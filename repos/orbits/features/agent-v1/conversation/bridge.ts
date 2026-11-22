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
import type { AgentReply, HintPart, LabWorld, ModelHint, RecordKind, Slots, TurnResult } from "./types";
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

export function worldOf(names: Record<string, { type: string; name: string }>, now: string, timeZone: string): LabWorld {
  const day = now.slice(0, 10);
  const contacts: Contact[] = [];
  const todos: Todo[] = [];
  const memos: Memo[] = [];
  const schedule: ScheduleItem[] = [];
  const platformEvents: PlatformEvent[] = [];
  const privateEvents: PrivateEvent[] = [];
  for (const [id, { name }] of Object.entries(names)) {
    const prefix = id.slice(0, 1);
    if (prefix === "C") contacts.push({ account: LAB_ACCOUNT, id, name });
    else if (prefix === "T") todos.push({ account: LAB_ACCOUNT, createdAt: now, id, status: "open", title: name, updatedAt: now });
    else if (prefix === "M") memos.push({ account: LAB_ACCOUNT, body: "", id, title: name, updatedAt: now, writtenOn: day });
    else if (prefix === "S") schedule.push({ account: LAB_ACCOUNT, endsAt: now, id, startsAt: now, title: name });
    else if (prefix === "E") platformEvents.push({ endsAt: now, id, startsAt: now, title: name });
    else if (prefix === "P") privateEvents.push({ account: LAB_ACCOUNT, id, startsAt: now, title: name });
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
