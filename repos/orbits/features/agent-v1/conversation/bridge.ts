/**
 * The bridge between the agent and the conversation lab's engine (conversation/impl, swappable: any implementation of
 * the lab's `Conversation` interface in impl/index.ts works here unchanged).
 *
 * - ids: lab ids are `<prefix>-<agent id>` (C contact, T to-do, M memo, S schedule item, E platform event, P private
 *   event), so the engine's kindOfId works and `agentRefOf` maps back.
 * - the log (ConversationLog, kept in the session state when the switch is not legacy): per turn the user's words, the
 *   first layer's reading as a ModelHint, and the agent's reply as a lab AgentReply (mentions, list, question, card,
 *   the request it answered) — references and names only, no record bodies, at most LOG_TURNS turns.
 * - the World: only the records this conversation named (log names, the context's handles, open-item options); no
 *   store read is made for the engine (shadow mode reads exactly what legacy reads). Genders are not known to the agent:
 *   every contact is "unknown" (the lab's rule: unknown never decides a pronoun).
 * - the hint: the first layer's UnderstandOutput as the lab's ModelHint (quote, clarity, continues, refs, slots).
 */
import type { ContextHandle, FirstLayerContext } from "../context/build";
import type { UnderstandOutput, UnderstandPart } from "../understand/schema";
import type { AgentReply, HintPart, LabWorld, ModelHint, PartResult, RecordKind, Slots, TurnResult } from "./types";
import type { Contact, Memo, PlatformEvent, PrivateEvent, ScheduleItem, Todo } from "../finder/types";
import engine from "./impl/index";

export const LOG_TURNS = 30;
export const LOG_NAMES = 300;
export const LAB_ACCOUNT = "A" as const;

// ---------------------------------------------------------------- ids

const PREFIX: Record<string, string> = { contact: "C", memo: "M", schedule: "S", todo: "T" };

/** The agent's record (type, id) as a lab id; null for a kind the engine does not know (rules, memory, attendance …). */
export function labIdOf(type: string, id: string): string | null {
  if (!id) return null;
  if (type === "event") return `${id.startsWith("private_event:") ? "P" : "E"}-${id}`;
  const prefix = PREFIX[type];
  return prefix ? `${prefix}-${id}` : null;
}

const TYPE_OF: Record<string, string> = { C: "contact", E: "event", M: "memo", P: "event", S: "schedule", T: "todo" };

export function agentRefOf(labId: string): { type: string; id: string } | null {
  const at = labId.indexOf("-");
  const type = at > 0 ? TYPE_OF[labId.slice(0, at)] : undefined;
  return type && labId.length > at + 1 ? { id: labId.slice(at + 1), type } : null;
}

/** A card target's collection → the agent's record type. */
export const TYPE_OF_COLLECTION: Record<string, string> = { contacts: "contact", notes: "memo", personal_schedule_items: "schedule", private_events: "event", tasks: "todo" };

// ---------------------------------------------------------------- the log

export interface ConversationLogTurn {
  requestId: string;
  user: { text: string; at: string; hint: ModelHint | null };
  agent: AgentReply | null;
}

export interface ConversationLog {
  turns: ConversationLogTurn[];
  /** lab id → the agent's type and the record's display name. */
  names: Record<string, { type: string; name: string }>;
}

export const emptyLog = (): ConversationLog => ({ names: {}, turns: [] });

export function normalizeLog(raw: unknown): ConversationLog | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<ConversationLog>;
  if (!Array.isArray(value.turns)) return null;
  const turns = value.turns.filter((turn): turn is ConversationLogTurn => Boolean(turn && typeof turn.requestId === "string" && turn.user && typeof turn.user.text === "string" && typeof turn.user.at === "string"));
  const names: ConversationLog["names"] = {};
  for (const [id, item] of Object.entries(value.names && typeof value.names === "object" ? value.names : {})) if (item && typeof item.name === "string" && typeof item.type === "string") names[id] = { name: item.name, type: item.type };
  return { names, turns };
}

/** The log with one more turn, capped (oldest turns and names not used by a kept turn go first). */
export function appendTurn(log: ConversationLog | null | undefined, turn: ConversationLogTurn, names: Record<string, { type: string; name: string }>): ConversationLog {
  const turns = [...(log?.turns ?? []).filter((item) => item.requestId !== turn.requestId), turn].slice(-LOG_TURNS);
  const all = { ...(log?.names ?? {}), ...names };
  const used = new Set(turns.flatMap((item) => [...(item.agent?.mentions ?? []), ...(item.agent?.listed ?? []), ...(item.agent?.asks?.options ?? []).map((option) => option.id), ...(item.user.hint?.parts ?? []).flatMap((part) => (part.refs ?? []).map((ref) => ref.id ?? ""))]));
  const kept = Object.entries(all).filter(([id]) => used.has(id) || Object.keys(names).includes(id)).slice(-LOG_NAMES);
  return { names: Object.fromEntries(kept), turns };
}

// ---------------------------------------------------------------- the world

/** Every record the conversation named, with the context's handles and open-item options of this turn. */
export function namesOf(log: ConversationLog | null, context: FirstLayerContext | null): Record<string, { type: string; name: string }> {
  const out: Record<string, { type: string; name: string }> = { ...(log?.names ?? {}) };
  const add = (type: string, id: string, name: string | null | undefined) => {
    const lab = labIdOf(type, id);
    if (lab && name && !out[lab]) out[lab] = { name, type };
  };
  for (const handle of context?.handles.values() ?? []) add(handle.type, handle.id, handle.name);
  for (const item of context?.lastMentionedForCode ?? []) add(item.type, item.id, item.name);
  for (const item of context?.openItems ?? []) for (const option of item.options ?? []) add(option.type, option.id, option.label.replace(/[（(].*$/u, "").trim());
  return out;
}

/** `forms`: words of this turn the agent's store bound to a record (「田中」 for 田中浩, 「@11 月 10 日笔记」 for a note without
 * a title): the World knows the record by them too — a contact as aliases, another record as its title (a note keeps
 * its stored name as the body). */
export function worldOf(names: Record<string, { type: string; name: string }>, now: string, timeZone: string, forms: Record<string, string[]> = {}): LabWorld {
  const day = now.slice(0, 10);
  const contacts: Contact[] = [];
  const todos: Todo[] = [];
  const memos: Memo[] = [];
  const schedule: ScheduleItem[] = [];
  const platformEvents: PlatformEvent[] = [];
  const privateEvents: PrivateEvent[] = [];
  for (const [id, { name }] of Object.entries(names)) {
    const prefix = id.slice(0, 1);
    const said = (forms[id] ?? []).filter((form) => form && form !== name);
    const title = prefix !== "C" && said.length ? said[0] : name;
    if (prefix === "C") contacts.push({ account: LAB_ACCOUNT, id, name, ...(said.length ? { aliases: said } : {}) });
    else if (prefix === "T") todos.push({ account: LAB_ACCOUNT, createdAt: now, id, status: "open", title, updatedAt: now });
    else if (prefix === "M") memos.push({ account: LAB_ACCOUNT, body: title === name ? "" : name, id, title, updatedAt: now, writtenOn: day });
    else if (prefix === "S") schedule.push({ account: LAB_ACCOUNT, endsAt: now, id, startsAt: now, title });
    else if (prefix === "E") platformEvents.push({ endsAt: now, id, startsAt: now, title });
    else if (prefix === "P") privateEvents.push({ account: LAB_ACCOUNT, id, startsAt: now, title });
  }
  return { aliases: [], attendance: [], contacts, genders: {}, memos, now, platformEvents, privateEvents, schedule, timeZone, todos };
}

// ---------------------------------------------------------------- the hint

const RECORD_KINDS: Record<string, RecordKind> = { attendance: "event", contact: "contact", event: "event", memo: "memo", schedule: "schedule", todo: "todo" };
const VERBS: Record<string, Slots["verb"]> = { complete: "complete", create: "create", delete: "delete", read: "read", reopen: "update", unlink: "update", update: "update" };

/** The kind and verb a part's capabilities say (the first record capability). */
export function kindVerbOf(capabilities: readonly string[]): { kind?: RecordKind; verb?: Slots["verb"] } {
  for (const capability of capabilities) {
    const [head, tail] = capability.split(".");
    const kind = RECORD_KINDS[head];
    if (kind) return { kind, ...(VERBS[tail] ? { verb: VERBS[tail] } : {}) };
  }
  return {};
}

function handleId(context: FirstLayerContext | null, handle: string | undefined): string | null {
  const found: ContextHandle | undefined = handle ? context?.handles.get(handle) : undefined;
  return found ? labIdOf(found.type, found.id) : null;
}

/** A record pointer right after a name: 「王磊那条」「沈さんのあの件」「Wang's one」 — the record of that person, not the person. */
const RECORD_POINTER_AFTER = /^(?:的)?(?:那|这|那一|这一)(?:条|篇|个|件|项|场|次|份|张)|^(?:の)?(?:あの|その|この)?(?:件|やつ|メモ|タスク|予定)|^(?:'s)\s+(?:one|note|task|to-?do|memo)\b/iu;

export function hintPartOf(part: UnderstandPart, context: FirstLayerContext | null): HintPart {
  const { kind, verb } = kindVerbOf(part.requiredCapabilities);
  const refs = part.objectClues.filter((clue) => RECORD_KINDS[clue.entity] && clue.text.trim()).map((clue) => {
    // The first layer often reports the person of 「王磊那条」 as a contact reference; the words mean that person's record,
    // so the reference is the whole span, of the part's record kind, bound to nothing (code resolves it).
    const at = clue.entity === "contact" && !clue.referenceId ? part.sourceQuote.indexOf(clue.text) : -1;
    const pointer = at >= 0 ? RECORD_POINTER_AFTER.exec(part.sourceQuote.slice(at + clue.text.length)) : null;
    if (pointer) return { id: null, ...(kind && kind !== "contact" ? { kind } : {}), said: clue.text + pointer[0] };
    return { id: handleId(context, clue.referenceId), kind: RECORD_KINDS[clue.entity], said: clue.text };
  });
  const filter = part.readFilter;
  const people = refs.filter((ref) => ref.kind === "contact" && ref.id).map((ref) => ref.id!);
  const slots: Slots = {
    ...(kind ? { kind } : {}),
    ...(verb ? { verb } : {}),
    ...(filter?.from || filter?.to ? { time: { from: (filter.from ?? filter.to)!, to: (filter.to ?? filter.from)! } } : {}),
    ...(people.length ? { people } : {}),
    ...(filter?.text ? { topic: [filter.text] } : {}),
    ...(filter?.status ? { status: filter.status === "completed" ? "done" as const : "open" as const } : {}),
  };
  const continued = part.continues ? context?.openItemHandles.get(part.continues.ref) : undefined;
  return {
    clarity: part.clarity === "multiple_readings" ? "missing_one" : part.clarity,
    continues: continued && continued.kind === "clarification" ? continued.ref : null,
    quote: part.sourceQuote,
    refs,
    ...(Object.keys(slots).length ? { slots } : {}),
  };
}

export function hintOf(output: UnderstandOutput | null, context: FirstLayerContext | null): ModelHint | null {
  if (!output || output.plainChat || !output.parts.length) return null;
  return { parts: output.parts.map((part) => hintPartOf(part, context)) };
}

// ---------------------------------------------------------------- the engine

export interface EngineTurn {
  message: string;
  at: string;
  hint: ModelHint | null;
  gone: string[];
}

/**
 * The engine on this turn: a fresh session replays the logged turns (each with its own hint and the agent's reply),
 * then reads the current message. Pure and synchronous; it throws what the engine throws.
 */
export function runEngine(log: ConversationLog | null, world: LabWorld, turn: EngineTurn): TurnResult {
  const turns = (log?.turns ?? []).slice(-LOG_TURNS);
  const session = engine.startSession(world, LAB_ACCOUNT, turns[0]?.user.at ?? turn.at);
  for (const item of turns) {
    session.turn({ at: item.user.at, gone: [], hint: item.user.hint, message: item.user.text });
    if (item.agent) session.reply(item.agent);
  }
  return session.turn({ at: turn.at, gone: turn.gone, hint: turn.hint, message: turn.message });
}

// ---------------------------------------------------------------- ask / go (ORBIT_AGENT_CONVERSATION_NEXT)
//
// The lab's engine asks when a reference points at nothing (`none`) or at more than one record. In the lab the World is
// the whole account and the hint names references only. Here the World holds only the records the talk named, and the
// first layer's clues are wider than references; read as they are, the engine wanted to ask on ~230 turns the agent
// answered right (fix3 run, 2026-11-23). For the ask / go decision only (the logged hint and the other decisions stay as
// they are), the bridge gives the engine what the lab gives it:
// - the hint's references only: a pick loses its「@」mark; the record a create part makes and words that describe a set
//   (a kind word with no pointer, no quoted title, no ordinal) are dropped (nextHintOf);
// - a World with the records the store gave this turn (the caller's names: the reply's records and the turn's reads),
//   each known also by the words of this turn the agent bound to it (a name, a title, a pick — never a pronoun or a
//   pointer, which the engine reads from the talk itself: formsOf);
// - a reference pointing at nothing is no reason to ask when the first layer gave it a visible record's id (an exact
//   pick), or when the engine found the words by itself where the first layer saw no reference (askGoOf).

/** Words naming a kind of record (a set: 活动 / イベント / 联系人 / my contacts …). */
const KIND_WORD = /活动|会面|イベント|催し|events?\b|待办|待辦|to-?dos?\b|タスク|tasks?\b|笔记|筆記|メモ|notes?\b|日程|予定|安排|schedule|联系人|聯絡人|人脉|人脈|連絡先|contacts?\b|relationships?\b/iu;
/** A pointer, a quoted title or an ordinal: the words then point at a record (这条待办 / 「X」这条 / 第二条 / the to-do about …). */
const POINTS = /[那这這此该該它]|その|あの|この|どの|[「『“"]|第\s*[一二三四五六七八九十\d]|\d+\s*番目|\b(?:that|this|these|those|the|it|first|second|third|last)\b/iu;

function setWords(said: string): boolean {
  return KIND_WORD.test(said) && !POINTS.test(said);
}

/** The hint as the lab writes one for ask / go: references only (see above). */
export function nextHintOf(hint: ModelHint | null): ModelHint | null {
  if (!hint) return null;
  return {
    parts: hint.parts.map((part) => {
      const making = part.slots?.verb === "create" ? part.slots.kind : undefined;
      const refs = (part.refs ?? [])
        .map((ref) => (ref.said.trimStart().startsWith("@") ? { ...ref, said: ref.said.trimStart().slice(1).trim() } : ref))
        .filter((ref) => ref.said && (ref.id || !((making && ref.kind === making) || setWords(ref.said))));
      return { ...part, refs };
    }),
  };
}

/** A pronoun or a pointer: the engine reads what it points at from the talk, never from the store's binding. */
const TALK_POINTER = /[他她它彼]|\b(?:he|she|him|her|his|they|them|it)\b/iu;

/** The words the agent bound to a record this turn → that record's extra forms (lab id → words; see worldOf). */
export function formsOf(bound: readonly { labId: string; words: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const { labId, words } of bound) {
    // a title with its pointer after it (给小林寄合同那条待办 / 「X」这条待办 / XのToDo): the title
    const form = words.trim().replace(/^@\s*/u, "").replace(/[「」『』“”"]/gu, "")
      .replace(/(?:的)?[这那這][一]?(?:条|篇|个|件|项|场|次|份|张|位)\S{0,6}$|(?:という|の)\s*(?:タスク|ToDo|メモ|予定|イベント)$/iu, "").trim();
    if ([...form].length < 2 || POINTS_START.test(form) || TALK_POINTER.test(form) || setWords(form)) continue;
    (out[labId] ??= []).includes(form) || out[labId].push(form);
  }
  return out;
}

/** A form that is itself a pointer or an ordinal (那条 / その件 / 第二个 / the other one). */
const POINTS_START = /^(?:[那这這此该該它]|その|あの|この|どの|第\s*[一二三四五六七八九十\d]+\s*\S?$|\d+\s*番目)|^(?:that|this|these|those|the|it)\b/iu;

/**
 * The store keeps a CJK name without the space the lab's World has (田中浩, not 田中 浩), so the engine reads its family
 * name as the first character only. A three- or four-character CJK name is also known by its first two characters
 * (田中浩 → 田中, 小林健 → 小林, 山本直子 → 山本); two contacts sharing them still make the engine ask.
 */
export function familyFormsOf(names: Record<string, { type: string; name: string }>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, { name }] of Object.entries(names)) {
    const plain = name.trim();
    if (id.startsWith("C-") && /^[\p{Script=Han}]{3,4}$/u.test(plain)) out[id] = [plain.slice(0, 2)];
  }
  return out;
}

const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a);

/**
 * A part's ask / go: the engine's `next`, except that a reference pointing at nothing is no reason to ask when
 * - the first layer gave it the id of a record the context handed it (a pick, an earlier record), still visible: the
 *   pick is exact, the World only lacks the words it was picked by (a note without a title, picked by its date);
 * - the engine found the words by itself (no reference of the hint overlaps them) and the first layer read the turn
 *   (a hint, or plain chat).
 * A part whose references all bound and that still asks names a person more than one contact has: that stays.
 */
export function askGoOf(part: PartResult, hint: ModelHint | null, plainChat: boolean, visible: ReadonlySet<string> = new Set(), before: PartResult = part): PartResult["next"] {
  if (part.next !== "ask") return part.next;
  const unbound = part.refs.filter((ref) => ref.outcome !== "bound");
  // every reference bound: the engine asks about a person more than one contact has — unless a decision opened after
  // the engine (R27) bound what it asked about
  if (!unbound.length) return before.refs.some((ref) => ref.outcome !== "bound") ? "go" : part.next;
  const hinted = (hint?.parts ?? []).flatMap((item) => item.refs ?? []).filter((ref) => ref.said);
  const excused = (said: string) => {
    const over = hinted.filter((ref) => overlaps(ref.said, said));
    if (over.some((ref) => ref.id && visible.has(ref.id))) return true;
    return !over.length && Boolean(hint || plainChat);
  };
  return unbound.every((ref) => ref.outcome === "none" && excused(ref.said)) ? "go" : part.next;
}

/** The engine's ask / go on this turn: the lab's hint and a World with the store's records (see above). */
/** `bind`: decisions opened after the engine that bind references (R27 pronouns when ORBIT_AGENT_CONVERSATION_PRONOUN is on).
 * `extend`: the World with the records the turn's store read gave (r10's write confirmations, conversation/world-read.ts). */
export function runAskGo(log: ConversationLog | null, names: Record<string, { type: string; name: string }>, turn: EngineTurn, plainChat: boolean, forms: Record<string, string[]> = {}, timeZone = "Asia/Tokyo", bind?: (result: TurnResult) => TurnResult, extend?: (world: LabWorld) => LabWorld): TurnResult {
  const hint = nextHintOf(turn.hint);
  const all: Record<string, string[]> = { ...familyFormsOf(names) };
  for (const [id, words] of Object.entries(forms)) all[id] = [...new Set([...(all[id] ?? []), ...words])];
  const base = worldOf(names, turn.at, timeZone, all);
  const raw = runEngine(log, extend ? extend(base) : base, { ...turn, hint });
  const result = bind ? bind(raw) : raw;
  const gone = new Set(turn.gone);
  const visible = new Set(Object.keys(names).filter((id) => !gone.has(id)));
  return { ...result, parts: result.parts.map((part, index) => ({ ...part, next: askGoOf(part, hint, plainChat, visible, raw.parts[index]) })) };
}
