/**
 * The engine's TurnResult against what the agent decided, and (switch `on`) the engine's decisions applied to the
 * agent's parts. Pure functions over the graph's parts; nothing here reads or writes a store.
 *
 * What `on` changes (each change is traced as conversation.applied):
 * - refs: a reference the engine bound to one record of this conversation is that record when the agent left it unbound
 *   (the part's clue gets its recordId, or a clue is added when the part acts on that kind and gave none); a record the
 *   agent bound itself is never replaced — e.g. XL-010's 「小陈」 after a card that
 *   linked 陈一鸣. An engine "ask" or "none" never binds and never unbinds (the agent's own resolver goes on asking).
 * - continues: a part the agent left new that the engine attributes to an open question nobody took (questions only;
 *   the agent's own attribution is never moved or cleared).
 * - cancel: a part the engine reads as calling off the change that waits (「算了先别建」) proposes no write.
 * - time: a read part that goes back to the request before (repeat / swap_period / refine / adjust / follow_list /
 *   ask_again_about) reads the engine's window when the agent's part has none (Asia/Tokyo only: the engine's calendar).
 * What `on` does not change: the merged request's people / kind / topic beyond the refs, ask vs go (the agent's
 * clarify step still decides), shelving (the agent's rule is the same: two unrelated messages or an idle break),
 * redo (the engine never redoes a write; the agent never re-runs a write without a new card and a click).
 */
import type { GraphPart } from "../graph/state";
import type { FirstLayerContext } from "../context/build";
import type { FollowUpClass, PartResult, RefResult, Slots, TurnResult } from "./types";
import { agentRefOf, kindVerbOf } from "./bridge";

export type ConversationDiffField = "ref" | "continues" | "follow_up" | "request" | "next" | "shelved" | "cancel" | "world" | "pronoun" | "carry";

export interface ConversationDiff {
  field: ConversationDiffField;
  part: string | null;
  agent: unknown;
  engine: unknown;
  /** next: the engine's references that did not bind (what it would ask about). */
  why?: unknown;
}

const WRITE = /\.(create|update|complete|reopen|delete|unlink|restore|import|link)$/u;
const CARRYING: FollowUpClass[] = ["repeat", "swap_period", "refine", "adjust", "follow_list", "ask_again_about"];

/** The engine part a graph part stands for: the one whose quote overlaps it most. */
export function enginePartOf(result: TurnResult, message: string, part: Pick<GraphPart, "quote">): PartResult | null {
  let best: PartResult | null = null;
  let bestOverlap = 0;
  let from = 0;
  for (const item of result.parts) {
    const at = message.indexOf(item.quote, from) >= 0 ? message.indexOf(item.quote, from) : message.indexOf(item.quote);
    if (at < 0) continue;
    from = at + item.quote.length;
    const overlap = Math.min(at + item.quote.length, part.quote[1]) - Math.max(at, part.quote[0]);
    if (overlap > bestOverlap) {
      best = item;
      bestOverlap = overlap;
    }
  }
  return best ?? (result.parts.length === 1 ? result.parts[0] : null);
}

/** The graph ref whose words are the engine ref's words (one contains the other). */
function refOfSaid(part: GraphPart, message: string, said: string): GraphPart["refs"][number] | undefined {
  return part.refs.find((ref) => {
    if (!ref.quote) return false;
    const words = message.slice(ref.quote[0], ref.quote[1]);
    return Boolean(words) && (words.includes(said) || said.includes(words));
  });
}

const sameKind = (entity: string, type: string) => entity === type || (entity === "attendance" && type === "event");

/** Pointer, pronoun, ordinal and kind words: what is left of a reference after them is its content. */
const POINTER_WORDS = /[「」『』“”"'（）()\s，,。.!！?？]|这|那|哪|條|条|篇|个|個|件|项|場|场|次|份|张|些|一|第|的|位|他|她|它|们|们|待办|笔记|日程|活动|联系人|记录|この|その|あの|どの|件|やつ|方|人|彼女|彼|メモ|タスク|予定|イベント|最初|最後|最后|二|三|四|上|下|前|后|後|刚才|さっき|\b(?:the|this|that|these|those|one|ones|first|second|last|it|him|her|them|note|task|to-?do|event|memo)\b/giu;

/** The longest run of characters two strings share (case folded). */
function sharedRun(left: string, right: string): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  let best = 0;
  for (let i = 0; i < a.length; i += 1) for (let j = 0; j < b.length; j += 1) {
    let k = 0;
    while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k += 1;
    if (k > best) best = k;
  }
  return best;
}

/**
 * A record the engine bound that the reference's own words contradict. The engine's World holds only the records this
 * conversation named, so a described record the conversation never showed («给李薇寄样片那条» after a card on 给小林发修订报价)
 * can come out bound to the only to-do it knows (eval on run: AE-XL-014). A reference with content words of its own binds
 * a record (not a contact) only when the record's name shares two characters in a row with those words.
 */
export function contentContradicts(said: string, recordName: string | undefined, type: string): boolean {
  if (type === "contact") return false;
  const content = said.replace(POINTER_WORDS, "");
  if ([...content].length < 2) return false;
  return !recordName || sharedRun(content, recordName) < 2;
}

/** The engine's id as the agent's record, when it is a record of this conversation that can be opened now. */
function liveRef(ref: RefResult, gone: ReadonlySet<string>): { type: string; id: string } | null {
  if (ref.outcome !== "bound" || !ref.id || gone.has(ref.id)) return null;
  return agentRefOf(ref.id);
}

/** The agent's merged request of a part, in the lab's slots (people as agent ids). */
export function agentRequestOf(part: GraphPart): Slots {
  const { kind, verb } = kindVerbOf(part.capabilities);
  const filter = part.plan.readFilter;
  const people = part.refs.filter((ref) => ref.entity === "contact" && ref.recordId).map((ref) => ref.recordId!);
  return {
    ...(kind ? { kind } : {}),
    ...(verb ? { verb } : {}),
    ...(filter?.from || filter?.to ? { time: { from: (filter.from ?? filter.to)!, to: (filter.to ?? filter.from)! } } : {}),
    ...(people.length ? { people: [...new Set(people)].sort() } : {}),
    ...(filter?.status ? { status: filter.status === "completed" ? "done" as const : "open" as const } : {}),
  };
}

/** The engine's request with agent ids (people sorted), without topic and place (the agent has no such slots). */
export function engineRequestOf(request: Slots | null): Slots | null {
  if (!request) return null;
  const people = (request.people ?? []).map((id) => agentRefOf(id)?.id).filter((id): id is string => Boolean(id));
  return {
    ...(request.kind ? { kind: request.kind } : {}),
    ...(request.verb ? { verb: request.verb } : {}),
    ...(request.time ? { time: { ...request.time } } : {}),
    ...(people.length ? { people: [...new Set(people)].sort() } : {}),
    ...(request.status ? { status: request.status } : {}),
  };
}

/** A change the engine read as calling off the change that waits: no request, no question, a card or write question before. */
export function isCancel(item: PartResult, waitingChange: boolean): boolean {
  return waitingChange && item.continues === null && item.request !== null && Object.keys(item.request).length === 0 && item.refs.length === 0;
}

export interface CompareInput {
  message: string;
  parts: readonly GraphPart[];
  result: TurnResult;
  /** The agent's own follow-up reading per part, where code made one (follow_list / swap_period / ask_again_about / repeat). */
  agentFollowUps: ReadonlyMap<string, FollowUpClass>;
  waitingChange: boolean;
}

/** Per part: refs, continues, follow-up class and merged request (ask / go and shelving are compared at deliver). */
export function compareTurn(input: CompareInput): ConversationDiff[] {
  const diffs: ConversationDiff[] = [];
  for (const part of input.parts) {
    const item = enginePartOf(input.result, input.message, part);
    if (!item) continue;
    for (const ref of item.refs) {
      const own = refOfSaid(part, input.message, ref.said);
      const engineId = ref.outcome === "bound" ? agentRefOf(ref.id ?? "")?.id ?? null : null;
      const agentId = own?.recordId ?? null;
      if (engineId !== agentId) diffs.push({ agent: agentId, engine: { candidates: (ref.candidates ?? []).map((id) => agentRefOf(id)?.id ?? id), id: engineId, outcome: ref.outcome, said: ref.said }, field: "ref", part: part.localId });
    }
    const agentContinues = part.continues?.kind === "clarification" ? part.continues.ref : null;
    if ((item.continues ?? null) !== agentContinues) diffs.push({ agent: agentContinues, engine: item.continues, field: "continues", part: part.localId });
    const agentFollow = input.agentFollowUps.get(part.localId) ?? (part.continues ? null : "new");
    if (item.followUp !== agentFollow && !(item.followUp === "adjust" && agentFollow === "repeat")) diffs.push({ agent: agentFollow, engine: item.followUp, field: "follow_up", part: part.localId });
    if (isCancel(item, input.waitingChange) && part.capabilities.some((capability) => WRITE.test(capability))) diffs.push({ agent: part.capabilities.filter((capability) => WRITE.test(capability)), engine: "cancel", field: "cancel", part: part.localId });
    if (!item.continues) {
      const mine = agentRequestOf(part);
      const theirs = engineRequestOf(item.request) ?? {};
      const fields = (["kind", "verb", "time", "people", "status"] as const).filter((key) => JSON.stringify(mine[key] ?? null) !== JSON.stringify(theirs[key] ?? null));
      if (fields.length) diffs.push({ agent: Object.fromEntries(fields.map((key) => [key, mine[key] ?? null])), engine: Object.fromEntries(fields.map((key) => [key, theirs[key] ?? null])), field: "request", part: part.localId });
    }
  }
  return diffs;
}

export interface ApplyInput extends CompareInput {
  context: FirstLayerContext | null;
  /** The World's names (lab id → name), to check a bound record against the reference's words. */
  names?: Record<string, { type: string; name: string }>;
  gone: ReadonlySet<string>;
  timeZone: string;
}

export interface Applied {
  part: string;
  /** ref_refused: the engine bound a record the reference's own words do not name; nothing changed (traced only). */
  what: "ref_bound" | "ref_added" | "ref_refused" | "continues" | "cancel" | "time" | "pronoun" | "people_add" | "people_drop";
  detail: unknown;
}

/** Switch `on`: the engine's decisions on the parts (see the header). Returns new parts and what changed. */
export function applyTurn(input: ApplyInput): { parts: GraphPart[]; applied: Applied[] } {
  const applied: Applied[] = [];
  const openQuestions = new Map((input.context?.openItems ?? []).filter((item) => item.kind === "clarification").map((item) => [item.ref, item]));
  const taken = new Set<string>();
  const agentTaken = new Set(input.parts.map((part) => part.continues?.ref).filter((ref): ref is string => Boolean(ref)));
  const parts = input.parts.map((original) => {
    const part: GraphPart = { ...original, capabilities: [...original.capabilities], plan: { ...original.plan }, refs: original.refs.map((ref) => ({ ...ref })) };
    const item = enginePartOf(input.result, input.message, part);
    if (!item) return part;
    // continues (questions only): the engine attributes a part the agent left new to an open question no part of the
    // agent's took; it never moves or clears the agent's own attribution (eval shadow run: AE-AMB-009, AE-EVT-009).
    const engineQ = item.continues && openQuestions.has(item.continues) && !taken.has(item.continues) && !agentTaken.has(item.continues) ? item.continues : null;
    if (!part.continues && engineQ) {
      part.continues = { kind: "clarification", ref: engineQ };
      taken.add(engineQ);
      applied.push({ detail: { to: engineQ }, part: part.localId, what: "continues" });
    }
    // refs: bind what the engine bound. In a correction (「不是这个，是王磊那个」) only the last reference is the one meant;
    // the engine also binds the negated pointer to the record it rejects, which is never applied.
    const meant = item.followUp === "correct" ? [...item.refs].sort((left, right) => input.message.lastIndexOf(right.said) - input.message.lastIndexOf(left.said)).slice(0, 1) : item.refs;
    for (const ref of meant) {
      const live = liveRef(ref, input.gone);
      if (!live) continue;
      if (contentContradicts(ref.said, input.names?.[ref.id!]?.name, live.type)) {
        applied.push({ detail: { id: live.id, said: ref.said }, part: part.localId, what: "ref_refused" });
        continue;
      }
      // A clue of another kind inside the words (the person 「王磊」 of 「王磊那条」) is not this reference: the record is added.
      const own = part.refs.find((other) => sameKind(other.entity, live.type) && other === refOfSaid({ ...part, refs: [other] }, input.message, ref.said));
      if (own) {
        // Only a clue the agent left unbound: a record the agent bound (an @ pick, a context handle, code) stays, whatever
        // the engine says (eval shadow run: AE-SCL-021 「那 @选品方向 呢」 bound by the engine to the earlier note).
        if (own.recordId) continue;
        applied.push({ detail: { from: own.recordId, said: ref.said, to: live.id }, part: part.localId, what: "ref_bound" });
        own.recordId = live.id;
        continue;
      }
      const at = input.message.indexOf(ref.said, part.quote[0]);
      const acts = part.capabilities.some((capability) => capability.split(".")[0] === live.type || (live.type === "event" && capability.startsWith("attendance.")));
      if (at < 0 || at >= part.quote[1] || !acts || part.refs.some((other) => other.recordId === live.id)) continue;
      part.refs.push({ entity: live.type, quote: [at, at + ref.said.length], recordId: live.id });
      applied.push({ detail: { said: ref.said, to: live.id }, part: part.localId, what: "ref_added" });
    }
    // cancel: no write for a part that calls off the change that waits
    if (isCancel(item, input.waitingChange)) {
      const writes = part.capabilities.filter((capability) => WRITE.test(capability));
      if (writes.length) {
        part.capabilities = part.capabilities.filter((capability) => !WRITE.test(capability));
        part.plan = { ...part.plan, clarity: "statement", negation: true, readings: [] };
        applied.push({ detail: { dropped: writes }, part: part.localId, what: "cancel" });
      }
    }
    // time: a follow-up that goes back to the request before reads the engine's window
    const reads = part.capabilities.some((capability) => /\.read$/u.test(capability));
    if (input.timeZone === "Asia/Tokyo" && reads && !item.continues && item.followUp && CARRYING.includes(item.followUp) && item.request?.time && !part.plan.readFilter?.from && !part.plan.readFilter?.to) {
      part.plan = { ...part.plan, readFilter: { ...(part.plan.readFilter ?? {}), from: item.request.time.from, to: item.request.time.to } };
      applied.push({ detail: { followUp: item.followUp, time: item.request.time }, part: part.localId, what: "time" });
    }
    return part;
  });
  return { applied, parts };
}

// ---------------------------------------------------------------- decisions opened 2026-11-23 (conversation/mode.ts openedMode)

/** A bare person pronoun, as a reference's whole words (R27 binds only these). */
const PERSON_PRONOUN = /^(?:她|他|ta|TA|彼女|彼|she|he|her|him)(?:的|さん|の)?$/iu;

/**
 * R27 (no gender known, owner decision 2026-11-23): the engine asks about a bare pronoun when it cannot tell a gender,
 * even when the latest turn that named anyone named exactly one person; that person is the one meant. Its "ask" with one
 * contact candidate (outside an idle break: R2 still asks) becomes "bound". Returns the result with those refs bound and
 * the refs changed.
 */
export function withPronounsBound(result: TurnResult, idle: boolean): { result: TurnResult; bound: { quote: string; said: string; id: string }[] } {
  const bound: { quote: string; said: string; id: string }[] = [];
  if (idle) return { bound, result };
  const parts = result.parts.map((part) => ({
    ...part,
    refs: part.refs.map((ref) => {
      const only = ref.outcome === "ask" && ref.candidates?.length === 1 ? ref.candidates[0] : null;
      if (!only || !only.startsWith("C-") || !PERSON_PRONOUN.test(ref.said.trim())) return ref;
      bound.push({ id: only, quote: part.quote, said: ref.said });
      return { id: only, outcome: "bound" as const, said: ref.said };
    }),
  }));
  return { bound, result: { ...result, parts } };
}

export interface CarryChange {
  part: string;
  what: "people_add" | "people_drop";
  ids: string[];
  followUp: FollowUpClass | null;
}

/** Follow-ups that keep the request's person (ask_again_about swaps the object, so it does not). */
const KEEPS_PERSON: FollowUpClass[] = ["repeat", "swap_period", "refine", "adjust", "follow_list"];

/**
 * The merged request's people against the agent's part:
 * - people_add: a read that goes back to the request before (KEEPS_PERSON) whose part names no person keeps the people
 *   of the engine's merged request (「那下周呢」 after 「王磊的待办」);
 * - people_drop: a new request (followUp new) whose part holds a person the words of this message do not name (no
 *   words, or words that are not in the message) and that the engine's request does not hold — a person carried in.
 * Kind, time, place and topic of the merged request stay logged only (the agent has no place or topic slot; time is
 * the `time` decision of applyTurn).
 */
export function carryChangesOf(input: Pick<CompareInput, "message" | "parts" | "result">): CarryChange[] {
  const out: CarryChange[] = [];
  for (const part of input.parts) {
    const item = enginePartOf(input.result, input.message, part);
    if (!item || item.continues || part.continues) continue;
    const engine = (item.request?.people ?? []).map((id) => agentRefOf(id)).filter((ref): ref is { type: string; id: string } => ref?.type === "contact").map((ref) => ref.id);
    const people = part.refs.filter((ref) => ref.entity === "contact");
    const reads = part.capabilities.some((capability) => /\.read$/u.test(capability));
    if (item.followUp && KEEPS_PERSON.includes(item.followUp) && reads && !people.length && engine.length) out.push({ followUp: item.followUp, ids: [...new Set(engine)], part: part.localId, what: "people_add" });
    if (item.followUp === "new") {
      const carried = people.filter((ref) => ref.recordId && !engine.includes(ref.recordId) && !(ref.quote && ref.quote[1] > ref.quote[0] && input.message.slice(ref.quote[0], ref.quote[1]).trim()));
      if (carried.length) out.push({ followUp: item.followUp, ids: carried.map((ref) => ref.recordId!), part: part.localId, what: "people_drop" });
    }
  }
  return out;
}

/** Switch on: the carry changes on the parts (new parts; the originals are not touched). */
export function applyCarry(parts: readonly GraphPart[], changes: readonly CarryChange[]): GraphPart[] {
  return parts.map((original) => {
    const mine = changes.filter((change) => change.part === original.localId);
    if (!mine.length) return original;
    let refs = original.refs.map((ref) => ({ ...ref }));
    for (const change of mine) {
      if (change.what === "people_add") for (const id of change.ids) if (!refs.some((ref) => ref.recordId === id)) refs.push({ entity: "contact", quote: null, recordId: id });
      if (change.what === "people_drop") refs = refs.filter((ref) => !(ref.entity === "contact" && ref.recordId && change.ids.includes(ref.recordId)));
    }
    return { ...original, refs };
  });
}

/** How two engine results differ per part (refs, continues, follow-up, request, next): the enriched World against names only. */
export function resultDiffs(message: string, parts: readonly GraphPart[], base: TurnResult, other: TurnResult): ConversationDiff[] {
  const diffs: ConversationDiff[] = [];
  const view = (item: PartResult | null) => item ? { continues: item.continues, followUp: item.followUp, next: item.next, refs: item.refs.map((ref) => ({ id: ref.id ?? null, outcome: ref.outcome, said: ref.said, ...(ref.candidates ? { candidates: ref.candidates } : {}) })), request: item.request } : null;
  for (const part of parts) {
    const left = view(enginePartOf(base, message, part));
    const right = view(enginePartOf(other, message, part));
    for (const key of ["refs", "continues", "followUp", "request", "next"] as const) {
      if (JSON.stringify(left?.[key] ?? null) !== JSON.stringify(right?.[key] ?? null)) diffs.push({ agent: left?.[key] ?? null, engine: right?.[key] ?? null, field: "world", part: `${part.localId}:${key}` });
    }
  }
  return diffs;
}
