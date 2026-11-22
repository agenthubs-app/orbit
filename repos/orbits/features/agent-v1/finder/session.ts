/**
 * The bridge between the agent's write resolvers (propose/resolve.ts, propose/events-resolve.ts) and the record finder:
 * one session per request (the World loaded lazily once, the model access of the round), and `findRecord` — the first
 * layer's words in (the clue, the people already settled, the time words, the action), the agent's own ids out as one of
 * three outcomes the resolvers map onto their ready / ask / not-found results. A read that failed is its own outcome
 * ("failed"): the resolvers say the records could not be read, never "not found".
 *
 * Provenance of finder/impl (copied byte for byte, so the lab's unit tests still describe it): lab-rsi
 * repos/orbits/lab/record-finder/rsi/archive/r10/impl at lab commit 931bae340 (r10 accepted), types from the lab's
 * types.ts; prompts and the Gemini mapping from rsi/live at f6042bef9 (finder/prompts.ts).
 */
import type { AgentRecordAccess } from "../graph/deps";
import type { DomainScope } from "../domains/types";
import type { JudgmentAccess, JudgmentBudget } from "../judgment/ask";
import type { ModelBudget } from "../models/main";
import { emitTrace } from "../observability/trace";
import { resolveTime } from "./impl/time";
import { liveFind, type FinderFn, type FinderModels } from "./live";
import type { Decision, FindInput, Verb } from "./types";
import { ACCOUNT, agentRefOf, createWorldLoader, labIdOf, WorldReadError, type AgentKind, type WorldLoader } from "./world";

export { finderMode } from "./live";

export interface FinderSession {
  loader: WorldLoader;
  models: FinderModels;
  now: string;
  timeZone: string;
}

/** What a resolver context carries for the finder (ResolveContext has all of these). */
export interface FinderHost {
  records: AgentRecordAccess | undefined;
  scope: DomainScope | null;
  asOf: string;
  timeZone: string;
  judgment?: JudgmentAccess | null;
  judgmentBudget?: JudgmentBudget;
  requestId?: string;
  /** The round's main-model budget and fetch (given by the propose node; absent: no reformulate round). */
  modelBudget?: ModelBudget;
  fetchImplementation?: typeof fetch;
  finder?: FinderSession | null;
}

/** The request's session, made on first use and kept on the context; null without record access. */
export function finderSessionOf(host: FinderHost): FinderSession | null {
  if (host.finder) return host.finder;
  if (!host.records || !host.scope) return null;
  host.finder = {
    loader: createWorldLoader({ now: host.asOf, records: host.records, scope: host.scope, timeZone: host.timeZone }),
    models: {
      ...(host.judgment !== undefined ? { judgment: host.judgment } : {}),
      ...(host.judgmentBudget ? { judgmentBudget: host.judgmentBudget } : {}),
      ...(host.modelBudget ? { modelBudget: host.modelBudget } : {}),
      ...(host.fetchImplementation ? { fetchImplementation: host.fetchImplementation } : {}),
      ...(host.requestId ? { requestId: host.requestId } : {}),
    },
    now: host.asOf,
    timeZone: host.timeZone,
  };
  return host.finder;
}

export type Found =
  | { kind: "one"; id: string; agentKind: AgentKind; occurrence?: string }
  | { kind: "ask"; ids: { id: string; agentKind: AgentKind }[]; /** The words matched none of them (the person's records offered). */ unmatched?: boolean }
  | { kind: "none" }
  | { kind: "failed" };

/**
 * A lab decision → the agent's ids. Only records of the kinds asked for are kept (a lab id of another kind cannot be
 * acted on by the caller). "ask" keeps the options in the decision's order; a question left with no option is "none"
 * when none of its options is of those kinds; a question is never turned into a pick.
 */
export function outcomeOf(decision: Decision, kinds: readonly AgentKind[], occurrences?: ReadonlyMap<string, string>): Found {
  const refs = decision.ids.map((id) => ({ labId: id, ref: agentRefOf(id) })).filter((item): item is { labId: string; ref: { kind: AgentKind; id: string } } => Boolean(item.ref && kinds.includes(item.ref.kind)));
  if (decision.outcome === "one") {
    const [first] = refs;
    if (!first) return { kind: "none" };
    const occurrence = occurrences?.get(first.labId);
    return { agentKind: first.ref.kind, id: first.ref.id, kind: "one", ...(occurrence ? { occurrence } : {}) };
  }
  if (decision.outcome === "ask") {
    if (!refs.length) {
      // Only records the caller cannot act on: nothing to offer (the finders are asked for these kinds only, so this is
      // traced as a fault, not expected).
      if (decision.ids.length) emitTrace({ ids: decision.ids, kinds, type: "finder.options_of_other_kinds" });
      return { kind: "none" };
    }
    return { ids: refs.map((item) => ({ agentKind: item.ref.kind, id: item.ref.id })), kind: "ask" };
  }
  return { kind: "none" };
}

export interface FindRequest {
  fn: FinderFn;
  sentence: string;
  clue: string;
  verb: Verb;
  kinds?: ("todo" | "memo")[];
  status?: "open" | "done" | "any";
  /** Contact ids (the agent's) the person step settled. */
  people?: readonly string[];
  /** The time words as said (resolved by the lab's resolveTime against the request's now and zone). */
  timeText?: string;
  /** Parts of the resolved time that are the change's new values, not a filter (a schedule item moved to 15:00). */
  timeDrop?: readonly ("time" | "endTime" | "shiftMinutes" | "partOfDay" | "went")[];
  /** The records the last answer showed, in order (ordinal / deixis), as the agent's refs. */
  shown?: readonly { kind: AgentKind; id: string }[];
  /** The agent kinds the caller can act on. */
  accept: readonly AgentKind[];
  partId?: string;
}

/** One lookup: the World, the lab's finder and decide, the model steps when the rules do not settle it. */
export async function findRecord(session: FinderSession, request: FindRequest): Promise<Found> {
  let time: FindInput["time"];
  if (request.timeText?.trim()) {
    const { spans: _spans, ...said } = resolveTime({ now: session.now, text: request.timeText, timeZone: session.timeZone });
    for (const key of request.timeDrop ?? []) delete (said as Record<string, unknown>)[key];
    if (Object.keys(said).length) time = said;
  }
  const input: FindInput = {
    account: ACCOUNT, clue: request.clue, sentence: request.sentence, verb: request.verb,
    ...(request.kinds ? { kinds: request.kinds } : {}), ...(request.status ? { status: request.status } : {}),
    ...(request.people?.length ? { people: request.people.map((id) => labIdOf("contact", id)) } : {}),
    ...(time ? { time } : {}),
    ...(request.shown?.length ? { sessionShown: request.shown.map((ref) => labIdOf(ref.kind, ref.id)) } : {}),
  };
  let result: Awaited<ReturnType<typeof liveFind>>;
  try {
    // Only the rows this lookup could mean are read (finder/prefilter.ts); the reformulated words are a new query.
    const world = await session.loader.findWorld(request.fn, input);
    result = await liveFind(request.fn, input, world, session.models, (again) => session.loader.findWorld(request.fn, again));
  } catch (error) {
    if (!(error instanceof WorldReadError)) emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "finder.world" });
    return { kind: "failed" };
  }
  const occurrences = new Map<string, string>(result.candidates.filter((item) => item.occurrence).map((item) => [item.id, item.occurrence!]));
  const mapped = outcomeOf(result.decision, request.accept, occurrences);
  const found: Found = mapped.kind === "ask" && result.unmatched ? { ...mapped, unmatched: true } : mapped;
  emitTrace({
    calls: result.calls, candidates: result.candidates.map((item) => item.id), decision: result.decision, fn: request.fn, outcome: found.kind,
    partId: request.partId ?? null, pick: result.pick ? Object.keys(result.pick)[0] : null, reformulated: result.input !== input, type: "finder.lookup", verb: request.verb,
  });
  return found;
}

/** The agent's shown list (FirstLayerContext.shownList items) as finder refs. */
export function shownRefsOf(items: readonly { id: string; type: string }[] | undefined): { kind: AgentKind; id: string }[] {
  return (items ?? []).flatMap((item) => {
    if (item.type === "todo" || item.type === "memo" || item.type === "contact" || item.type === "schedule") return [{ id: item.id, kind: item.type as AgentKind }];
    if (item.type === "event") return [{ id: item.id, kind: (item.id.startsWith("private_event:") ? "private" : "platform") as AgentKind }];
    return [];
  });
}
