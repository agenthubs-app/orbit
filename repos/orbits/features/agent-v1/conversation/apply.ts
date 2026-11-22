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

export type ConversationDiffField = "ref" | "continues" | "follow_up" | "request" | "next" | "shelved" | "cancel";

export interface ConversationDiff {
  field: ConversationDiffField;
  part: string | null;
  agent: unknown;
  engine: unknown;
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
  gone: ReadonlySet<string>;
  timeZone: string;
}

export interface Applied {
  part: string;
  what: "ref_bound" | "ref_added" | "continues" | "cancel" | "time";
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
