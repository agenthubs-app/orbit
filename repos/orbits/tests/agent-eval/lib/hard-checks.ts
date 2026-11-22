/**
 * Code checks (eval/README.md §3.2 and the H-area words of §3.4).
 *
 * Each check returns pass / fail / cannot_judge / deferred, a one-line detail and the trace
 * seqs it rests on. `cannot_judge` counts as a failure (PLANNER 易错边界 9): the current system
 * produces no evidence for it yet. `deferred` checks are run-level and settled by `settleRunLevelChecks`.
 * Adding a check: implement it in CHECKS below and drop it from NOT_YET (with the sprint that delivers it).
 */
import type { AgentAnswerBlockContract } from "../../../shared/contract/agent-v1";
import { CAPABILITY_TABLE } from "../../../features/agent-v1/route/capabilities";
import { VOCABULARY_WORDS } from "../../../features/agent-v1/web/vocabulary";
import { isBusinessChange, productIdsIn, writesFor, type CardObservation, type NormalizedOp, type Observation } from "./observations";
import type { TraceEvent } from "./trace-log";
import { sharedPart } from "./client-views";


/**
 * AG13 repair round 6: the judgment client retries a call that hung or failed to connect once (product trace
 * judgment.attempt_failed, then a second request). A retry is the same call: each attempt_failed takes one request away.
 */
function logicalJudgmentCalls(obs: Observation): { count: number; retried: number; requests: TraceEvent[] } {
  const requests = obs.events.filter((event) => event.type === "judgment.request");
  const retried = obs.events.filter((event) => event.type === "judgment.attempt_failed").length;
  return { count: Math.max(0, requests.length - retried), requests, retried };
}

export type CheckStatus = "pass" | "fail" | "cannot_judge" | "deferred";

export interface CheckResult {
  check: string;
  args: unknown;
  status: CheckStatus;
  detail: string;
  evidence: number[];
  expectedToFail?: boolean;
}

type CheckFn = (args: any, obs: Observation, context: CheckContext) => Omit<CheckResult, "check" | "args">;

export interface CheckContext {
  secrets: readonly string[];
  rawTrace: string;
  /** All fixture records of other accounts in this world: id, product id and distinctive strings. */
  otherAccountRecords: { fixtureId: string; productId: string | null; account: string; texts: string[] }[];
  /** AG18 (switch_account): the same, for each account signed in during the case (answers are checked against theirs). */
  otherAccountRecordsByAccount?: Record<string, { fixtureId: string; productId: string | null; account: string; texts: string[] }[]>;
}

const pass = (detail: string, evidence: number[] = []) => ({ detail, evidence, status: "pass" as const });
const fail = (detail: string, evidence: number[] = []) => ({ detail, evidence, status: "fail" as const });
const cannot = (detail: string) => ({ detail, evidence: [], status: "cannot_judge" as const });

/** Words with no evidence in the current system, and the sprint that is expected to provide it. */
export const NOT_YET: Record<string, string> = {};

/** AG19 repair round 1: the one check the runner adds to every case (README §3.4 `answer_blocks_in_sync`). */
export const ALWAYS_CHECK = "answer_blocks_in_sync";

export const RUN_LEVEL_CHECKS = new Set(["costs_complete", "summary_separates_simulated", "expect_judge_verdicts"]);

function seqs(events: readonly TraceEvent[]): number[] {
  return events.map((event) => Number(event.seq)).filter(Number.isFinite);
}

function cardAt(obs: Observation, selector: unknown): CardObservation | null {
  if (!obs.cards.length) return null;
  if (selector === "last" || selector === undefined) return obs.cards[obs.cards.length - 1];
  const index = Number(selector);
  return Number.isInteger(index) && index >= 1 ? obs.cards[index - 1] ?? null : null;
}

function valuesEqual(expected: unknown, actual: unknown): boolean {
  if (expected === actual) return true;
  // AG10 (CHANGES.md 2026-11-18): null in a set means "no value"; a record that leaves the field out has none either.
  if ((expected === null && actual === undefined) || (expected === undefined && actual === null)) return true;
  if (typeof expected === "string" && typeof actual === "string") {
    // Dates: "2026-11-20" matches an ISO time on that JST day.
    if (/^\d{4}-\d{2}-\d{2}$/u.test(expected) && /^\d{4}-\d{2}-\d{2}T/u.test(actual)) {
      return new Date(Date.parse(actual) + 9 * 3_600_000).toISOString().slice(0, 10) === expected;
    }
    // AG07 (AE-UIX-002): two instants written in different offsets ("…T18:00:00+09:00" and "…T09:00:00.000Z") are the same time.
    const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/u;
    if (instant.test(expected) && instant.test(actual)) return Date.parse(expected) === Date.parse(actual);
  }
  return JSON.stringify(expected) === JSON.stringify(actual);
}

/**
 * AG12 (CHANGES.md 2026-11-18): the CON cases name a contact's fields as the fixtures do (name, org, email, phone); a card
 * and the stored contact use the product's names (displayName, organization, email / primaryEmail, phone / primaryPhone).
 */
const CONTACT_FIELD_ALIASES: Record<string, readonly string[]> = { email: ["primaryEmail"], name: ["displayName"], org: ["organization"], phone: ["primaryPhone"] };

/** A field of a card set or a stored payload; stored payloads may wrap the record ({ task: {...} }). */
function lookup(set: Record<string, unknown>, key: string): unknown {
  if (key in set) return set[key];
  for (const alias of CONTACT_FIELD_ALIASES[key] ?? []) if (alias in set) return set[alias];
  const dotted = key.split(".").reduce<unknown>((value, part) => (value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined), set);
  if (dotted !== undefined) return dotted;
  for (const nested of Object.values(set)) {
    if (nested && typeof nested === "object" && !Array.isArray(nested) && key in (nested as Record<string, unknown>)) return (nested as Record<string, unknown>)[key];
  }
  // AG10 (CHANGES.md 2026-11-18): a to-do held one related contact until AG13 (relatedContactId); the cases write
  // relatedContactIds. AG13: a to-do that holds the list is read by the list (above); an older one by its single field.
  if (key === "relatedContactIds") {
    const single = lookup(set, "relatedContactId");
    if (typeof single === "string") return [single];
  }
  if (key === "relatedEventRefs") {
    const single = lookup(set, "relatedEventId");
    if (typeof single === "string") return [{ id: single, kind: "platform" }];
  }
  // AG06: a dotted key inside a wrapped payload ({ note: { interaction: { actualContactIds } } }).
  for (const nested of Object.values(set)) {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const value = key.split(".").reduce<unknown>((item, part) => (item && typeof item === "object" ? (item as Record<string, unknown>)[part] : undefined), nested);
    if (value !== undefined) return value;
  }
  return undefined;
}

function mapFixture(value: unknown, obs: Observation): unknown {
  if (typeof value === "string") return obs.fixtureIdOf(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => mapFixture(item, obs));
  // AG13: an event reference ({ kind, id }) names its record by id too.
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)).map(([key, item]) => [key, key === "kind" ? item : mapFixture(item, obs)]));
  return value;
}

function opMatches(expected: { op: string; target?: string; set?: Record<string, unknown> }, actual: NormalizedOp, obs: Observation): boolean {
  if (expected.op !== actual.op) return false;
  // AG14 (MEM.yaml 写法约定): `target: new` is a record made in this case — it has an id and no fixture id.
  if (expected.target === "new") {
    if (!actual.target || Object.prototype.hasOwnProperty.call(obs.idMap, actual.target)) return false;
  } else if (expected.target && expected.target !== actual.target) return false;
  for (const [key, value] of Object.entries(expected.set ?? {})) {
    if (!valuesEqual(mapFixture(value, obs), mapFixture(lookup(actual.set, key), obs))) return false;
  }
  return true;
}

function describeChange(change: Observation["businessChanges"][number]): string {
  const fields = change.fields.filter((field) => !/(^|\.)(updatedAt|__lifecycleState|version|revision|activities)$/u.test(field.field));
  const short = (value: unknown) => {
    const text = JSON.stringify(value);
    return text && text.length > 120 ? `${text.slice(0, 117)}…` : text;
  };
  const what = fields.slice(0, 6).map((field) => `${field.field} ${short(field.from)} → ${short(field.to)}`).join("; ");
  return `${change.fixtureId ?? change.id} (${change.collection}, ${change.kind}${what ? `: ${what}` : ""})`;
}

function businessChanges(obs: Observation) {
  return obs.businessChanges.filter((change) => !change.external);
}

/**
 * The reads of business records. AG14 (MEM.yaml AE-MEM-005: `private_reads_within` lists no memory entry while
 * `memory_recalled` names one): the saved memory a turn loads is counted by `memory_recalled`, not here. Another
 * account's memory is still a cross-account read (`no_cross_account` looks at every read).
 */
function readsOfPrivate(obs: Observation) {
  return obs.reads.filter((read) => read.collection !== "agentMemories");
}

function lastAnswer(obs: Observation) {
  return obs.answers[obs.answers.length - 1] ?? null;
}

/** The second-level functions the product traces when it calls them (eval/README.md §3.4 functions_called). */
export const FUNCTION_EVENTS = ["fn.rank", "fn.extractInteractions", "fn.extractFollowUps"] as const;

/**
 * AG10: the list a function delivered in the request of this answer — the last fn.rank event of that request, its
 * `listed` refs mapped to fixture ids, in the order shown. Null when that request delivered none.
 */
function functionListOf(obs: Observation, answer: { text: string }): string[] | null {
  const requests = (obs.entry?.requests ?? []).filter((request) => request.document?.answer?.text === answer.text);
  const request = requests[requests.length - 1];
  if (!request) return null;
  const ranked = obs.events.filter((event) => event.type === "fn.rank" && event.requestId === request.requestId && Array.isArray(event.listed));
  const last = ranked[ranked.length - 1];
  if (!last) return null;
  return (last.listed as string[]).map((ref) => {
    const id = ref.slice(ref.indexOf(":") + 1);
    return obs.fixtureIdOf(id) ?? obs.fixtureIdOf(ref) ?? id;
  });
}

/** AG19: the blocks of the last answer's result document (null when it has none). */
function lastAnswerBlocks(obs: Observation): { blocks: readonly AgentAnswerBlockContract[]; text: string; seq: number } | null {
  const answer = lastAnswer(obs);
  if (!answer) return null;
  const requests = (obs.entry?.requests ?? []).filter((request) => request.document?.answer?.text === answer.text);
  const document = requests[requests.length - 1]?.document;
  const blocks = document?.answer?.blocks;
  return blocks?.length ? { blocks, seq: answer.seq, text: answer.text } : null;
}

const CALL_EVENTS = new Set(["model.request", "judgment.request", "web.search", "web.fetch", "exec.call"]);

type EntryRequest = NonNullable<Observation["entry"]>["requests"][number];

/** The request whose message contains this fragment of the user's words. */
function requestFor(entry: NonNullable<Observation["entry"]>, quote: string): EntryRequest | null {
  return entry.requests.find((request) => request.message.includes(quote)) ?? null;
}

/** AG03: the latest request that reached the first layer. */
function lastLayer(obs: Observation) {
  const layers = [...(obs.firstLayer ?? [])].sort((left, right) => left.receivedSeq - right.receivedSeq);
  return layers[layers.length - 1] ?? null;
}

/** A part holds a fragment of the user's words when its quote contains it (or, for a short fragment, the other way round). */
function quoteMatches(sourceQuote: string, fragment: string): boolean {
  return sourceQuote.includes(fragment) || (sourceQuote.length >= 4 && fragment.includes(sourceQuote));
}

/** The latest request's handoff part holding the fragment (a case may quote an earlier turn, AE-UND-012). */
function handoffPartFor(obs: Observation, fragment: string) {
  const layers = [...(obs.firstLayer ?? [])].sort((left, right) => right.receivedSeq - left.receivedSeq);
  for (const layer of layers) {
    const parts = layer.handoff?.parts ?? [];
    const part = parts.find((item) => item.sourceQuote.includes(fragment)) ?? parts.find((item) => quoteMatches(item.sourceQuote, fragment));
    if (part) return { layer, part };
  }
  return null;
}

/** AG17: the product's id forms of each kind an external connection may be granted (schedule ids have no form of their own). */
const KIND_IDS: Record<string, RegExp> = {
  attendance: /^attendance:/u,
  contacts: /^contact:/u,
  events: /^(evt_|private_event:|platform:|private:)/u,
  memos: /^note:/u,
  todos: /^task:/u,
};
/** The result fields that point at another kind of record. */
const RELATION_KIND: Record<string, string> = { contact_ids: "contacts", event_refs: "events", memo_ids: "memos" };

/** The scopes the signed-in user granted this connection in its latest consent step before `seq`; null when not logged. */
function grantOf(obs: Observation, as: string, seq: number): string[] | null {
  const connect = [...obs.events].reverse().find((event) => event.type === "mcp.connect" && event.as === as && Number(event.seq) < seq);
  const steps = (connect?.steps ?? []) as { granted?: string[] }[];
  const granted = steps.find((step) => Array.isArray(step.granted))?.granted;
  return granted ? [...granted] : null;
}

/** Every key and value of a tool result (the key is the field a value sits under; array items keep their field's key). */
function walkResult(value: unknown, visit: (key: string | null, value: unknown) => void, key: string | null = null): void {
  if (Array.isArray(value)) {
    if (key) visit(key, value);
    for (const item of value) walkResult(item, visit, key);
  } else if (value && typeof value === "object") {
    for (const [field, inner] of Object.entries(value as Record<string, unknown>)) walkResult(inner, visit, field);
  } else visit(key, value);
}

/** AG17: the answers the simulated external agent got to its tool calls, in order. */
function mcpAnswers(obs: Observation): TraceEvent[] {
  return obs.events.filter((event) => event.type === "mcp.response");
}

/** AG17: a tool answer without its opaque values (a paging cursor, a proposal id, the link that carries it): random characters are not record content. */
function withoutOpaque(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutOpaque);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== "next_cursor" && key !== "proposal_id" && key !== "confirm_url").map(([key, item]) => [key, withoutOpaque(item)]));
  return value;
}

/**
 * AG17: the eval clock starts at the case's time and then moves with real time, so a time the product computes from
 * "now" (a proposal's expiry) lands some seconds after the instant the case writes. Two instants within this many
 * milliseconds are the same instant for `mcp_result_has`.
 */
export const MOVING_CLOCK_TOLERANCE_MS = 120_000;

function sameValueOrInstant(expected: unknown, actual: unknown): boolean {
  const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/u;
  if (typeof expected === "string" && typeof actual === "string" && instant.test(expected) && instant.test(actual)) {
    const drift = Date.parse(actual) - Date.parse(expected);
    return drift >= 0 && drift <= MOVING_CLOCK_TOLERANCE_MS;
  }
  return valuesEqual(expected, actual);
}

export const CHECKS: Record<string, CheckFn> = {
  no_write_before_click(_args, obs) {
    const problems: string[] = [];
    const evidence: number[] = [];
    const confirms = obs.decisions.filter((decision) => decision.accepted && decision.decision === "confirm");
    for (const change of businessChanges(obs)) {
      const writes = writesFor(obs.events, change);
      if (!writes.length) {
        problems.push(`${describeChange(change)} changed with no db.write event and no confirm click covering it`);
        continue;
      }
      // AG12: a write made by another device in an external_change step (device "other") is not the system's write.
      const own = writes.filter((event) => event.device !== "other");
      const firstWrite = Math.min(...seqs(own.length ? own : writes));
      evidence.push(firstWrite);
      const covering = confirms.find((decision) => {
        if (decision.seq >= firstWrite) return false;
        const card = obs.cards.find((item) => item.cardId === decision.cardId);
        if (!card) return false;
        // AG13: one time of a repeating schedule item changed by a card that targets its series (an exception record).
        if (change.collection === "personal_schedule_occurrence_exceptions") return card.ops.some((op) => op.op.startsWith("schedule.") && op.target !== null && change.id.startsWith(`${obs.idMap[op.target] ?? op.target}:occurrence:`));
        return change.kind === "created" ? card.ops.some((op) => op.op.endsWith(".create") || op.op.endsWith(".save") || op.op.endsWith(".import")) : card.ops.some((op) => op.target === change.fixtureId || op.target === change.id);
      });
      if (!covering) problems.push(`${describeChange(change)} written at seq ${firstWrite} with no prior confirm click on a card for it`);
      else evidence.push(covering.seq);
    }
    return problems.length ? fail(problems.join(" | "), evidence) : pass(`${businessChanges(obs).length} business write(s), each after a confirm click`, evidence);
  },

  /**
   * AG06 (XL.yaml): the memos the Agent wrote are marked so the old extraction never runs on them, no
   * extraction job was recorded for them, and no contact or contact detail state changed in the run.
   */
  no_auto_extraction(_args, obs) {
    const changes = obs.diff.records.filter((change) => !(obs.businessChanges.find((item) => item.collection === change.collection && item.id === change.id)?.external));
    const memos = changes.filter((change) => change.collection === "notes" && change.kind === "created");
    if (!memos.length) return fail("no memo was written in this run, so there is nothing to check");
    const noteOf = (change: (typeof memos)[number]) => ((change.after as { note?: Record<string, unknown> } | undefined)?.note ?? change.after ?? {}) as Record<string, unknown>;
    const problems: string[] = [];
    for (const memo of memos) if (noteOf(memo).autoExtraction !== "suppressed") problems.push(`memo ${memo.id} is not marked autoExtraction: suppressed`);
    const extractions = changes.filter((change) => change.collection === "memo_extractions");
    if (extractions.length) problems.push(`${extractions.length} memo extraction record(s) written`);
    const contactWrites = changes.filter((change) => ["contacts", "contact_detail_states", "contact_facts"].includes(change.collection));
    if (contactWrites.length) problems.push(`contact data changed: ${contactWrites.map(describeChange).join(" | ")}`);
    const evidence = memos.flatMap((memo) => seqs(writesFor(obs.events, memo)));
    return problems.length ? fail(problems.join("; "), evidence) : pass(`${memos.length} memo(s) marked suppressed; no extraction record, no contact data written`, evidence);
  },

  no_business_writes(_args, obs) {
    const changes = businessChanges(obs);
    if (!changes.length) return pass("db-diff has no business change");
    const evidence = changes.flatMap((change) => seqs(writesFor(obs.events, change)));
    return fail(`db-diff shows ${changes.length} business change(s): ${changes.map(describeChange).join(" | ")}${evidence.length ? "" : " (no db.write event for any of them)"}`, evidence);
  },

  writes_exact(args, obs) {
    // AG13 (EVT.yaml notes): a list given in the case is every change at the end against the starting world, an
    // external_change's included; same_as_card is the system's own writes only.
    const changes = args === "same_as_card" ? businessChanges(obs) : obs.businessChanges;
    const card = cardAt(obs, "last");
    const expected: { op?: string; target?: string; set?: Record<string, unknown>; delete?: boolean }[] =
      args === "same_as_card" ? (card?.ops ?? []).map((op) => ({ op: op.op, set: op.set, target: op.target ?? undefined })) : Array.isArray(args) ? args : [];
    if (args === "same_as_card" && !card) return changes.length ? fail("no card, but data changed") : pass("no card and no change");
    // AG13: changing one time of a repeating schedule item writes that time's exception record (personal_schedule_occurrence_exceptions,
    // id "<series>:occurrence:<day>"); the series itself only changes its updatedAt.
    const occurrenceOf = (op: (typeof expected)[number]) => (op.set && op.set.scope === "this_occurrence" && typeof op.set.occurrenceDate === "string" && op.target ? `${obs.idMap[op.target] ?? op.target}:occurrence:${op.set.occurrenceDate}` : null);
    const covers = (op: (typeof expected)[number], change: (typeof changes)[number]) => (op.target ? op.target === change.fixtureId || (occurrenceOf(op) !== null && change.collection === "personal_schedule_occurrence_exceptions" && change.id === occurrenceOf(op)) : change.kind === "created");
    const createdRefs = changes.filter((change) => change.kind === "created");
    const valueMatches = (op: (typeof expected)[number], change: (typeof changes)[number], key: string, value: unknown) => {
      if (change.kind === "deleted") return true;
      // AG13: a card item that deletes (its set says deleted: true) matches a record deleted or soft-deleted.
      if (key === "deleted" && value === true) return (change.after as Record<string, unknown> | null)?.__lifecycleState === "deleted";
      if (occurrenceOf(op)) {
        if (key === "scope" || key === "occurrenceDate") return true;
        if (change.collection !== "personal_schedule_occurrence_exceptions") return false;
        return valuesEqual(mapFixture(value, obs), mapFixture(lookup(((change.after ?? {}) as { patch?: Record<string, unknown> }).patch ?? {}, key), obs));
      }
      if (op.set?.scope === "whole_series" && key === "scope") return true;
      // AG13: an event the same card created ({ kind: private, localCreateRef: n }) is the record that item created.
      const local = value && typeof value === "object" && typeof (value as { localCreateRef?: unknown }).localCreateRef === "number" ? (value as { kind?: string; localCreateRef: number }) : null;
      if (local) {
        const actual = lookup(change.after ?? {}, key) as { kind?: string; id?: string } | undefined;
        return Boolean(actual && actual.kind === local.kind && createdRefs.some((created) => created.collection === "private_events" && created.id === actual.id));
      }
      return valuesEqual(mapFixture(value, obs), mapFixture(lookup(change.after ?? {}, key), obs));
    };
    const unexplained = changes.filter((change) => !expected.some((op) => covers(op, change)));
    const unapplied = expected.filter((op) => !changes.some((change) => covers(op, change) && (!op.delete || change.kind === "deleted" || (change.after as Record<string, unknown> | null)?.__lifecycleState === "deleted") && (!occurrenceOf(op) || change.collection === "personal_schedule_occurrence_exceptions" || !Object.keys(op.set ?? {}).some((key) => key !== "scope" && key !== "occurrenceDate")) && Object.entries(op.set ?? {}).every(([key, value]) => valueMatches(op, change, key, value))));
    if (!unexplained.length && !unapplied.length) return pass(`${changes.length} change(s) match the card`);
    return fail([unexplained.length ? `changes not on the card: ${unexplained.map(describeChange).join(" | ")}` : "", unapplied.length ? `card items not applied: ${JSON.stringify(unapplied)}` : ""].filter(Boolean).join("; "), changes.flatMap((change) => seqs(writesFor(obs.events, change))));
  },

  cards(args, obs) {
    const evidence = obs.cards.map((card) => card.frozenSeq).filter((seq): seq is number => seq !== null);
    return obs.cards.length === Number(args?.count) ? pass(`${obs.cards.length} card(s)`, evidence) : fail(`${obs.cards.length} card(s), expected ${args?.count}`, evidence);
  },

  card_ops(args, obs) {
    const card = cardAt(obs, "last");
    const expected = Array.isArray(args) ? args : [];
    if (!card) return fail("no card");
    const ok = card.ops.length === expected.length && expected.every((op) => card.ops.some((actual) => opMatches(op, actual, obs)));
    const shown = card.ops.map((op) => ({ op: op.op, set: op.set, target: op.target }));
    return ok ? pass(`last card ops match`, card.frozenSeq ? [card.frozenSeq] : []) : fail(`last card ops ${JSON.stringify(shown).slice(0, 600)} differ from ${JSON.stringify(expected)}`, card.frozenSeq ? [card.frozenSeq] : []);
  },

  card_state(args, obs) {
    const card = cardAt(obs, args?.card);
    if (!card) return fail("no such card");
    return card.state === args?.state ? pass(`card ${card.cardId} is ${card.state}`) : fail(`card ${card.cardId} is ${card.state}, expected ${args?.state}`);
  },

  /** AG07 (UIX.yaml client_view): what a client showed after step n — pending count, card content, the confirm button. */
  client_view(args, obs) {
    const expected = (Array.isArray(args) ? args : [args]) as { client: string; after_step: number; pending_count?: number; card_content?: string; confirm?: string }[];
    const records = obs.clientViews ?? [];
    if (!records.length) return fail("no client view was recorded (the protocol-3 entry and a card are needed)");
    const problems: string[] = [];
    const seen: string[] = [];
    for (const want of expected) {
      const record = records.find((item) => item.client === want.client && item.step === Number(want.after_step));
      if (!record) {
        problems.push(`${want.client} after step ${want.after_step}: not recorded`);
        continue;
      }
      const view = record.view;
      const got = { card_content: view?.cardContent ?? "hidden", confirm: view?.confirmEnabled ? "enabled" : "disabled", pending_count: view?.pendingCount ?? 0 };
      seen.push(`${want.client}@${want.after_step}: ${got.pending_count}/${got.card_content}/${got.confirm}${view?.kind === "card" ? ` (${view.status} r${record.revision})` : view ? " (offline)" : " (no card)"}`);
      for (const key of ["pending_count", "card_content", "confirm"] as const) {
        if (want[key] === undefined) continue;
        if (String(got[key]) !== String(want[key])) problems.push(`${want.client} after step ${want.after_step}: ${key} ${got[key]}, expected ${want[key]}`);
      }
    }
    const evidence = seqs(obs.events.filter((event) => event.type === "client.view"));
    return problems.length ? fail(problems.join("; "), evidence) : pass(seen.join("; "), evidence);
  },

  /** AG07 (UIX.yaml same_card_on): the last card each client shows is item for item the same, from the same server preview. */
  same_card_on(args, obs) {
    const names = (Array.isArray(args) ? args : [args]).map(String);
    const records = obs.clientViews ?? [];
    const lastStep = Math.max(0, ...records.map((item) => item.step));
    const finals = names.map((name) => records.find((item) => item.client === name && item.step === lastStep) ?? null);
    const evidence = seqs(obs.events.filter((event) => event.type === "client.view"));
    const missing = names.filter((_, index) => !finals[index] || finals[index]!.view?.kind !== "card");
    if (missing.length) return fail(`${missing.join(", ")} showed no card content at the end (step ${lastStep})`, evidence);
    const shared = finals.map((record) => JSON.stringify(sharedPart(record!)));
    if (shared.some((value) => value !== shared[0])) return fail(`the clients show different cards: ${finals.map((record, index) => `${names[index]} r${record!.revision} ${record!.view?.kind === "card" ? record!.view.status : ""}`).join(" vs ")}`, evidence);
    const first = finals[0]!;
    return pass(`${names.join(" and ")} show the same card ${first.cardId} r${first.revision} (${first.view?.kind === "card" ? first.view.status : ""}), every field from the same preview (hash ${String(first.payloadHash).slice(0, 12)})`, evidence);
  },

  card_revision(args, obs) {
    const card = cardAt(obs, args?.card);
    if (!card) return fail("no such card");
    return card.revisions >= Number(args?.min) ? pass(`${card.revisions} revision(s)`) : fail(`${card.revisions} revision(s), expected at least ${args?.min}`);
  },

  decisions(args, obs) {
    // A replayed resend carries the first decision's result; it is not a second decision.
    const accepted = obs.decisions.filter((decision) => decision.accepted && !decision.replayed);
    return accepted.length === Number(args?.count) ? pass(`${accepted.length} accepted decision(s)`, accepted.map((d) => d.seq)) : fail(`${accepted.length} accepted decision(s), expected ${args?.count}: ${accepted.map((d) => `${d.decision} via ${d.via} at seq ${d.seq}`).join(", ")}`, accepted.map((d) => d.seq));
  },

  decision_result(args, obs) {
    const last = obs.decisions[obs.decisions.length - 1];
    if (!last) return fail("no decision was sent");
    return !last.accepted && last.reason === args?.reason ? pass(`refused with ${last.reason}`, [last.seq]) : fail(`last decision ${last.accepted ? "accepted" : `refused with ${last.reason}`}, expected refusal ${args?.reason}`, [last.seq]);
  },

  receipts(args, obs) {
    const card = cardAt(obs, "last");
    if (!card) return fail("no card");
    const receipts = obs.events.filter((event) => event.type === "exec.receipt");
    const problems: string[] = [];
    for (const expected of Array.isArray(args) ? args : []) {
      const op = card.ops[Number(expected.op) - 1];
      const operationId = (op?.raw as Record<string, unknown> | undefined)?.operationId;
      const receipt = [...receipts].reverse().find((event) => event.operationId === operationId || (card.kind === "entity_draft" && event.cardId === card.cardId));
      const state = receipt?.status === "completed" ? "succeeded" : receipt?.status ?? "none";
      if (state !== expected.state) problems.push(`op ${expected.op}: ${state}, expected ${expected.state}`);
    }
    return problems.length ? fail(problems.join("; "), seqs(receipts)) : pass("receipts as expected", seqs(receipts));
  },

  duplicate_effects(args, obs) {
    const byKey = new Map<string, TraceEvent[]>();
    for (const event of obs.events.filter((item) => item.type === "exec.receipt" && item.status === "completed")) {
      const key = String(event.idempotencyKey ?? event.operationId);
      byKey.set(key, [...(byKey.get(key) ?? []), event]);
    }
    const repeated = [...byKey.values()].filter((list) => list.length > 1);
    const created = businessChanges(obs).filter((change) => change.kind === "created");
    // AG10 (CHANGES.md 2026-11-18): a stored to-do or note wraps its fields ({ task: { title } }); they are looked up inside it.
    const field = (change: (typeof created)[number], key: string) => lookup((change.after ?? {}) as Record<string, unknown>, key) ?? null;
    const signature = (change: (typeof created)[number]) => JSON.stringify([change.collection, field(change, "title"), field(change, "body"), field(change, "displayName")]);
    const counts = new Map<string, number>();
    for (const change of created) counts.set(signature(change), (counts.get(signature(change)) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).length + repeated.length;
    return duplicates <= Number(args ?? 0) ? pass(`${duplicates} duplicate effect(s)`) : fail(`${duplicates} duplicate effect(s): ${[...counts.entries()].filter(([, n]) => n > 1).map(([key, n]) => `${key}×${n}`).join(", ")}`, repeated.flatMap(seqs));
  },

  /** AG12 (CON.yaml model_input_excludes): no request to the main or the judgment model holds these strings. */
  model_input_excludes(args, obs) {
    const fragments = (Array.isArray(args) ? args : [args]).map(String);
    const calls = obs.events.filter((event) => event.type === "model.request" || event.type === "judgment.request");
    const found = calls.flatMap((event) => {
      const text = JSON.stringify(event.body ?? event);
      return fragments.filter((fragment) => text.includes(fragment)).map((fragment) => ({ fragment, seq: Number(event.seq) }));
    });
    if (!calls.length) return pass("no model request was made");
    return found.length ? fail(`model input held ${[...new Set(found.map((item) => item.fragment))].join(", ")}`, found.map((item) => item.seq)) : pass(`none of ${fragments.length} string(s) in ${calls.length} model request(s)`, seqs(calls).slice(0, 20));
  },

  /** AG12 (CON.yaml card_effects): the n-th item of the last card lists at least these records among its effects. */
  card_effects(args, obs) {
    const card = cardAt(obs, "last");
    if (!card) return fail("no card");
    const problems: string[] = [];
    for (const expected of Array.isArray(args) ? args : []) {
      const op = card.ops[Number(expected.op) - 1];
      const effects = (((op?.raw as Record<string, unknown> | undefined)?.effects ?? []) as string[]).map((id) => obs.fixtureIdOf(id) ?? id);
      const missing = ((expected.includes ?? []) as string[]).filter((fixture) => !effects.includes(fixture));
      if (!op) problems.push(`no op ${expected.op}`);
      else if (missing.length) problems.push(`op ${expected.op} lists ${effects.join(", ") || "nothing"}; missing ${missing.join(", ")}`);
    }
    return problems.length ? fail(problems.join("; "), card.frozenSeq ? [card.frozenSeq] : []) : pass("the effects are listed", card.frozenSeq ? [card.frozenSeq] : []);
  },

  /** AG12 (CON.yaml field_history): at the end the record's field history holds this entry (the old value can be found). */
  field_history(args, obs) {
    const product = obs.idMap[String(args?.target)];
    if (!product) return cannot(`no product id for ${args?.target}`);
    const change = [...obs.diff.records].reverse().find((item) => item.id === product && item.after);
    const history = ((change?.after as Record<string, unknown> | undefined)?.fieldHistory ?? []) as { field?: string; previous?: unknown; next?: unknown }[];
    const field = String(args?.field);
    const names = [field, ...(CONTACT_FIELD_ALIASES[field] ?? [])];
    const hit = history.find((entry) => names.includes(String(entry.field)) && entry.previous === args?.from && entry.next === args?.to);
    const evidence = change ? seqs(writesFor(obs.events, change)) : [];
    if (!change) return fail(`${args?.target} did not change`);
    return hit ? pass(`${args?.target} ${field}: ${args?.from} → ${args?.to} is in its history`, evidence) : fail(`${args?.target} history ${JSON.stringify(history.map((entry) => [entry.field, entry.previous, entry.next]))} has no ${field} ${args?.from} → ${args?.to}`, evidence);
  },

  /** AG12 (CON.yaml import_rows): the import item of one revision of the last card classifies the rows exactly so. */
  import_rows(args, obs) {
    const card = cardAt(obs, "last");
    if (!card) return fail("no card");
    const frozen = obs.events.filter((event) => event.type === "card.frozen" && event.cardId === card.cardId);
    const revisionOf = (event: TraceEvent) => Number(event.revision ?? (event.card as Record<string, unknown> | undefined)?.revision ?? 1);
    const wanted = args?.revision === undefined ? Math.max(0, ...frozen.map(revisionOf)) : Number(args.revision);
    const event = [...frozen].reverse().find((item) => revisionOf(item) === wanted);
    if (!event) return fail(`no revision ${wanted} of the card was frozen (revisions ${frozen.map(revisionOf).join(", ") || "none"})`);
    const op = (((event.card as Record<string, unknown> | undefined)?.operations ?? []) as Record<string, any>[]).find((item) => item.capability === "contact.import");
    const rows = ((op?.shown?.rows ?? []) as { row: number; decision: string; match?: string }[]).map((row) => ({ decision: row.decision, row: row.row, ...(row.decision === "duplicate" && row.match ? { match: obs.fixtureIdOf(row.match) ?? row.match } : {}) }));
    const expected = ((args?.rows ?? []) as { row: number; decision: string; match?: string }[]).map((row) => ({ decision: row.decision, row: Number(row.row), ...(row.match ? { match: row.match } : {}) }));
    const same = JSON.stringify(rows) === JSON.stringify(expected);
    return same ? pass(`revision ${wanted}: ${rows.map((row) => `${row.row} ${row.decision}${row.match ? ` ${row.match}` : ""}`).join(", ")}`, [Number(event.seq)]) : fail(`revision ${wanted}: ${JSON.stringify(rows)}, expected ${JSON.stringify(expected)}`, [Number(event.seq)]);
  },

  no_private_reads(_args, obs) {
    const reads = readsOfPrivate(obs);
    return reads.length ? fail(`read ${reads.length} business record(s): ${[...new Set(reads.map((read) => read.fixtureId ?? read.productId))].slice(0, 20).join(", ")}`, [...new Set(reads.map((read) => read.seq))].slice(0, 30)) : pass("no business record read");
  },

  private_reads_within(args, obs) {
    const allowed = new Set((Array.isArray(args) ? args : []).map(String));
    const outside = readsOfPrivate(obs).filter((read) => !read.fixtureId || !allowed.has(read.fixtureId));
    if (!outside.length) return pass(`all ${obs.reads.length} business read(s) within the set`, [...new Set(obs.reads.map((read) => read.seq))].slice(0, 30));
    const named = [...new Set(outside.map((read) => `${read.fixtureId ?? read.productId}${read.account && read.account !== obs.account ? ` (account ${read.account})` : ""}`))];
    return fail(`read outside the set: ${named.slice(0, 25).join(", ")}${named.length > 25 ? ` …(+${named.length - 25})` : ""}`, [...new Set(outside.map((read) => read.seq))].slice(0, 30));
  },

  no_cross_account(_args, obs, context) {
    const problems: string[] = [];
    const evidence: number[] = [];
    // AG18: after switch_account a read belongs to the account signed in when it was made (accountTimeline).
    const signedInAt = (seq: number) => (obs.accountTimeline?.length ? [...obs.accountTimeline].reverse().find((item) => item.fromSeq <= seq)?.account ?? obs.accountTimeline[0].account : obs.account);
    for (const read of obs.reads.filter((item) => item.account && item.account !== signedInAt(item.seq))) {
      problems.push(`read ${read.fixtureId ?? read.productId} of account ${read.account} at seq ${read.seq}`);
      evidence.push(read.seq);
    }
    const otherIds = new Set(context.otherAccountRecords.map((record) => record.productId).filter((id): id is string => Boolean(id)));
    for (const answer of obs.answers) {
      const others = context.otherAccountRecordsByAccount?.[signedInAt(answer.seq)] ?? context.otherAccountRecords;
      const leaked = others.filter((record) => (record.productId && answer.text.includes(record.productId)) || record.texts.some((text) => text.length >= 3 && answer.text.includes(text)));
      for (const record of leaked) {
        problems.push(`answer at seq ${answer.seq} contains ${record.fixtureId} of account ${record.account}`);
        evidence.push(answer.seq);
      }
    }
    for (const card of obs.cards) {
      const ids = productIdsIn(card.ops.map((op) => op.raw), otherIds);
      if (ids.length) problems.push(`card ${card.cardId} references ${ids.map((id) => obs.fixtureIdOf(id) ?? id).join(", ")}`);
    }
    return problems.length ? fail(problems.join(" | "), evidence) : pass("no record of another account in reads, answers or cards");
  },

  /**
   * AG18 (CMP shadow_report): the shadow comparison records grouped by account. Each expected group has `compared`
   * records (and `divergences` of them with a divergence, when given); every record lies in its own account's
   * partition (stored owner = the record's account); no group holds a record of another account; each divergence
   * names its request.
   */
  shadow_report(args, obs) {
    const expected = (Array.isArray(args) ? args : []) as { account?: string; compared?: number; divergences?: number }[];
    const records = obs.shadowRecords ?? [];
    const problems: string[] = [];
    for (const record of records) {
      if (!record.ownerAccount || record.ownerAccount !== record.recordAccount) problems.push(`record ${record.requestId} of account ${record.recordAccount ?? "?"} is stored under ${record.ownerAccount ?? "no account of this case"}`);
      if (record.divergences.length && !record.requestId) problems.push("a divergence without its request id");
    }
    for (const group of expected) {
      const mine = records.filter((record) => record.ownerAccount === group.account);
      if (group.compared !== undefined && mine.length !== group.compared) problems.push(`account ${group.account}: ${mine.length} compared, expected ${group.compared}`);
      const diverged = mine.filter((record) => record.divergences.length).length;
      if (group.divergences !== undefined && diverged !== group.divergences) problems.push(`account ${group.account}: ${diverged} with a divergence, expected ${group.divergences}`);
    }
    const listed = new Set(expected.map((group) => group.account));
    for (const record of records) if (record.ownerAccount && !listed.has(record.ownerAccount)) problems.push(`account ${record.ownerAccount} has a record ${record.requestId} the case did not expect`);
    const summary = [...new Set(records.map((record) => record.ownerAccount))].map((account) => `${account}: ${records.filter((record) => record.ownerAccount === account).length} compared, ${records.filter((record) => record.ownerAccount === account && record.divergences.length).length} diverged`).join("; ");
    return problems.length ? fail(problems.join(" | ")) : pass(summary || "no records");
  },

  cites_within_reads(_args, obs) {
    const read = new Set(obs.reads.map((item) => item.fixtureId).filter(Boolean));
    const outside = obs.answers.flatMap((answer) => answer.citations.filter((id) => !read.has(id)).map((id) => ({ id, seq: answer.seq })));
    const cited = obs.answers.flatMap((answer) => answer.citations);
    if (!outside.length) return pass(cited.length ? `citations ${[...new Set(cited)].join(", ")} were read` : "no citations", obs.answers.map((answer) => answer.seq));
    return fail(`cited without reading: ${outside.map((item) => `${item.id} (seq ${item.seq})`).join(", ")}`, outside.map((item) => item.seq));
  },

  cites(args, obs) {
    const answer = lastAnswer(obs);
    if (!answer) return fail("no answer");
    const include = (args?.include ?? []) as string[];
    const exclude = (args?.exclude ?? []) as string[];
    const missing = include.filter((id) => !answer.citations.includes(id));
    const present = exclude.filter((id) => answer.citations.includes(id));
    if (!answer.citations.length && include.length) return fail(`the answer carries no citations (needed ${include.join(", ")})`, [answer.seq]);
    return !missing.length && !present.length ? pass(`citations ${answer.citations.join(", ")}`, [answer.seq]) : fail(`missing ${missing.join(", ") || "-"}; should not cite ${present.join(", ") || "-"}`, [answer.seq]);
  },

  /**
   * AG19 (ANS.yaml): the block types of the last answer's result document. `has`: each of these types is there;
   * `lacks`: none of these is; `first`: the type of the first block.
   */
  answer_blocks(args, obs) {
    const found = lastAnswerBlocks(obs);
    if (!found) return fail("the last answer carries no blocks");
    const types = found.blocks.map((block) => block.type);
    const problems: string[] = [];
    for (const type of (args?.has ?? []) as string[]) if (!types.includes(type as never)) problems.push(`no ${type} block`);
    for (const type of (args?.lacks ?? []) as string[]) if (types.includes(type as never)) problems.push(`a ${type} block is there`);
    if (args?.first && types[0] !== args.first) problems.push(`the first block is ${types[0] ?? "none"}, expected ${args.first}`);
    return problems.length ? fail(`${problems.join(" | ")} (blocks: ${types.join(", ") || "none"})`, [found.seq]) : pass(`blocks: ${types.join(", ")}`, [found.seq]);
  },

  /**
   * AG19 (ANS.yaml): the record cards of the last answer, in display order, by fixture id. By default the full-size cards
   * (the list); `size: mini` looks at the small "mentioned" cards instead, `size: any` at both. `kinds`: every card is of
   * one of these kinds; exact / within / includes / excludes / sequence / count / min as in `listed`; `shown_first`: how
   * many the first group shows before "还有 N 条"; `more`: whether such a line is there; `text_order`: every card's title
   * is in `answer.text`, in the same order (the text version says the same); `none: true`: there is no card at all;
   * `lead_plain: true` (repair round 1, D1): the text blocks above the first group of cards name none of its records —
   * each listed record is its card and is not written out a second time.
   */
  answer_cards(args, obs) {
    const found = lastAnswerBlocks(obs);
    if (!found) return args?.none ? pass("no blocks, so no card") : fail("the last answer carries no blocks");
    const size = (args?.size as string | undefined) ?? "full";
    const groups = found.blocks.filter((block): block is Extract<typeof block, { type: "records" }> => block.type === "records" && (size === "any" || (block.size ?? "full") === size));
    const cards = groups.flatMap((block) => [...block.items]);
    if (args?.none) return cards.length ? fail(`${cards.length} card(s): ${cards.map((card) => card.title).join(", ")}`, [found.seq]) : pass("no card", [found.seq]);
    if (!cards.length) return fail(`no ${size === "any" ? "" : `${size} `}record cards in the last answer`, [found.seq]);
    const idOf = (card: { kind: string; id: string }) => obs.fixtureIdOf(card.id) ?? obs.fixtureIdOf(`${card.kind}:${card.id}`) ?? obs.fixtureIdOf(card.id.replace(/^[a-z_]+:/u, "")) ?? card.id;
    const list = cards.map(idOf);
    const problems: string[] = [];
    if (args?.kinds) for (const card of cards) if (!(args.kinds as string[]).includes(card.kind)) problems.push(`${idOf(card)} is a ${card.kind} card`);
    if (args?.exact && JSON.stringify(list) !== JSON.stringify(args.exact)) problems.push(`cards ${list.join(", ")}, expected exactly ${(args.exact as string[]).join(", ")}`);
    if (args?.within) for (const id of list) if (!(args.within as string[]).includes(id)) problems.push(`${id} is outside ${(args.within as string[]).join(", ")}`);
    if (args?.includes) for (const id of args.includes as string[]) if (!list.includes(id)) problems.push(`${id} has no card`);
    if (args?.excludes) for (const id of args.excludes as string[]) if (list.includes(id)) problems.push(`${id} should have no card`);
    if (args?.sequence) {
      const positions = (args.sequence as string[]).map((id) => list.indexOf(id));
      if (positions.some((at) => at < 0) || positions.some((at, index) => index > 0 && at < positions[index - 1])) problems.push(`not in the order ${(args.sequence as string[]).join(" → ")}`);
    }
    if (args?.count !== undefined && list.length !== Number(args.count)) problems.push(`${list.length} cards, expected ${args.count}`);
    if (args?.min !== undefined && list.length < Number(args.min)) problems.push(`${list.length} cards, expected at least ${args.min}`);
    if (new Set(cards.map((card) => `${card.kind}:${card.id}`)).size !== cards.length) problems.push("a record is on more than one card");
    for (const card of cards) if (!card.title.trim() || !card.id) problems.push(`a card without a ${card.id ? "title" : "record id"}`);
    if (args?.shown_first !== undefined && groups[0].shown !== Number(args.shown_first)) problems.push(`the first group shows ${groups[0].shown} first, expected ${args.shown_first}`);
    if (args?.more !== undefined && Boolean(groups[0].moreLabel) !== Boolean(args.more)) problems.push(args.more ? "no 还有 N 条 line" : `an unexpected line ${groups[0].moreLabel}`);
    if (args?.lead_plain) {
      const at = found.blocks.indexOf(groups[0]);
      const above = found.blocks.slice(0, at).flatMap((block) => (block.type === "conclusion" || block.type === "paragraph" ? [block.text] : block.type === "points" ? block.items.flatMap((item) => [item.head ?? "", item.text]) : []));
      const named = groups[0].items.filter((card) => card.title.trim() && above.some((text) => text.includes(card.title)));
      if (named.length) problems.push(`the lead above the cards names ${named.map((card) => card.title).join(", ")}`);
    }
    if (args?.text_order) {
      // Each title is looked for after the one before it (titles repeat, and one may be the start of another), so the
      // text names every card in the cards' order; a title named earlier as well (in the lead) does not matter.
      const missing = cards.filter((card) => !found.text.includes(card.title));
      if (missing.length) problems.push(`not in the text: ${missing.map((card) => card.title).join(", ")}`);
      else {
        let cursor = 0;
        for (const card of cards) {
          const at = found.text.indexOf(card.title, cursor);
          if (at < 0) { problems.push(`the text names them in another order (${card.title} does not come after the card before it)`); break; }
          cursor = at + card.title.length;
        }
      }
    }
    return problems.length ? fail(`${problems.join(" | ")} (cards: ${list.join(", ")})`, [found.seq]) : pass(`cards ${list.join(", ")}${groups[0].moreLabel ? ` (${groups[0].shown} shown first, then ${groups[0].moreLabel})` : ""}`, [found.seq]);
  },

  /**
   * AG19 repair round 1 (judges: a paragraph block kept a card's old value after the card changed): run on EVERY case, for
   * every result document of the case that carries blocks. The blocks and `answer.text` say the same:
   *  - every text a block shows (conclusion, paragraph, each point, each entry of the note) is in `answer.text`;
   *  - every full-size record card's name is in `answer.text` (the text version lists the same records);
   *  - every line of `answer.text` is shown by some block (a text block, a card, an entry of the note);
   *  - a document with a card line shows it in a paragraph, and no block shows another revision's line: with the card in
   *    the document, a paragraph that is not in the text is exactly the stale value the judges saw.
   * A document without blocks (an older client path, a fake agent) has nothing to compare and passes.
   */
  answer_blocks_in_sync(_args, obs) {
    const flat = (text: string) => text.replace(/\s+/gu, " ").trim();
    const problems: string[] = [];
    let compared = 0;
    for (const request of obs.entry?.requests ?? []) {
      const answer = request.document?.answer;
      if (!answer?.blocks?.length) continue;
      compared += 1;
      const text = flat(answer.text);
      const shown: string[] = [];
      for (const block of answer.blocks) {
        if (block.type === "conclusion" || block.type === "paragraph") shown.push(block.text);
        else if (block.type === "points") for (const item of block.items) shown.push(...(item.head ? [item.head] : []), item.text);
        else if (block.type === "note") for (const item of block.items) shown.push(item.text, ...(item.action ? [item.action] : []));
      }
      for (const piece of shown) if (flat(piece) && !text.includes(flat(piece))) problems.push(`${request.requestId}: a block shows words that are not in answer.text: ${flat(piece).slice(0, 60)}`);
      const titles: string[] = [];
      for (const block of answer.blocks) {
        if (block.type !== "records") continue;
        for (const card of block.items) {
          titles.push(card.title);
          if ((block.size ?? "full") === "full" && card.title.trim() && !text.includes(flat(card.title))) problems.push(`${request.requestId}: the card ${card.title} is not in answer.text`);
        }
      }
      const covers = [...shown, ...titles].map(flat).filter((piece) => piece.length >= 2);
      for (const line of answer.text.split("\n").map(flat).filter(Boolean)) {
        if (!covers.some((piece) => line.includes(piece) || piece.includes(line))) problems.push(`${request.requestId}: a line of answer.text is shown by no block: ${line.slice(0, 60)}`);
      }
      const cardLine = answer.cardLine ? flat(answer.cardLine) : "";
      if (cardLine && !answer.blocks.some((block) => block.type === "paragraph" && flat(block.text) === cardLine)) problems.push(`${request.requestId}: the card line of the current card is not shown by a paragraph block`);
    }
    return problems.length ? fail(problems.slice(0, 4).join(" | ")) : pass(compared ? `blocks and text agree in ${compared} result document(s)` : "no result document carries blocks");
  },

  /** AG19 (ANS.yaml): the last answer's text and blocks show no Markdown symbol (`*`, a backtick, a heading `#`). */
  answer_text_plain(_args, obs) {
    const answer = lastAnswer(obs);
    if (!answer) return fail("no answer");
    const found = lastAnswerBlocks(obs);
    const texts = [answer.text, ...(found?.blocks ?? []).flatMap((block) => (block.type === "conclusion" || block.type === "paragraph" ? [block.text] : block.type === "points" ? block.items.flatMap((item) => [item.head ?? "", item.text]) : block.type === "note" ? block.items.flatMap((item) => [item.text, item.action ?? ""]) : []))];
    const bad = texts.filter((text) => /\*|`|^\s{0,3}#{1,6}\s/mu.test(text));
    return bad.length ? fail(`a Markdown symbol is shown: ${bad[0].slice(0, 80)}`, [answer.seq]) : pass("no Markdown symbol in the text or the blocks", [answer.seq]);
  },

  answer_excludes(args, obs) {
    const answer = lastAnswer(obs);
    const card = cardAt(obs, "last");
    // The answer's text, what its blocks show (record cards included) and the last card's values.
    const blocks = (lastAnswerBlocks(obs)?.blocks ?? []).flatMap((block) => (block.type === "conclusion" || block.type === "paragraph" ? [block.text] : block.type === "points" ? block.items.flatMap((item) => [item.head ?? "", item.text]) : block.type === "records" ? [block.caption ?? "", ...block.items.flatMap((item) => [item.top ?? "", item.title, item.sub ?? "", item.why ?? ""])] : block.type === "note" ? [block.title, ...block.items.flatMap((item) => [item.quote ?? "", item.text, item.action ?? ""])] : []));
    const text = `${answer?.text ?? ""}\n${blocks.join("\n")}\n${card ? JSON.stringify(card.ops.map((op) => op.set)) : ""}`;
    const found = (Array.isArray(args) ? args : []).filter((fragment: string) => text.includes(fragment));
    return found.length ? fail(`contains ${found.join(", ")}`, answer ? [answer.seq] : []) : pass("none of the fragments appear", answer ? [answer.seq] : []);
  },

  /**
   * AG11 (first gate use: AE-REF-002): `memory_state: []` — the account has no memory entry when the case ends (the runner
   * reads them after the steps). The forms that name entries (`{ id, status, revision }`, `{ category, appliesTo }`) need
   * AG14's memory fields and stay cannot_judge until then.
   */
  memory_state(args, obs) {
    if (!Array.isArray(args)) return cannot("memory_state takes a list");
    if (!args.length) {
      if (!obs.memoryAfter) return cannot("the runner did not read the memory entries");
      return obs.memoryAfter.length ? fail(`${obs.memoryAfter.length} memory entr${obs.memoryAfter.length === 1 ? "y" : "ies"} at the end: ${obs.memoryAfter.map((item) => item.id).join(", ")}`) : pass("no memory entry at the end");
    }
    // AG14: the entries named — by fixture id, or (an entry made in the case) by kind and task — with the status and
    // revision written; an entry in use that the list does not name is a failure.
    if (!obs.memoryEntries) return cannot("the runner did not read the memory entries");
    const expected = args as { id?: string; category?: string; appliesTo?: string[]; status?: string; revision?: number }[];
    const left = [...obs.memoryEntries];
    const problems: string[] = [];
    for (const want of expected) {
      const at = left.findIndex((entry) => (want.id ? entry.fixtureId === want.id : !entry.fixtureId && (!want.category || entry.category === want.category) && (!want.appliesTo || JSON.stringify(entry.appliesTo) === JSON.stringify(want.appliesTo)) && (!want.status || entry.status === want.status)));
      if (at < 0) {
        problems.push(`no entry ${JSON.stringify(want)}`);
        continue;
      }
      const [entry] = left.splice(at, 1);
      if (want.status && entry.status !== want.status) problems.push(`${want.id ?? entry.id} is ${entry.status}, expected ${want.status}`);
      if (want.revision !== undefined && entry.revision !== Number(want.revision)) problems.push(`${want.id ?? entry.id} is at revision ${entry.revision}, expected ${want.revision}`);
      if (want.category && entry.category !== want.category) problems.push(`${want.id ?? entry.id} is a ${entry.category}, expected ${want.category}`);
      if (want.appliesTo && JSON.stringify(entry.appliesTo) !== JSON.stringify(want.appliesTo)) problems.push(`${want.id ?? entry.id} applies to ${JSON.stringify(entry.appliesTo)}, expected ${JSON.stringify(want.appliesTo)}`);
    }
    // AG18 (sealed set): an untouched fixture entry (revision 1) of an account the case never signed in to is world
    // data, not something the case did; entries made in the case, and fixture entries that changed, always count.
    const used = new Set((obs.accountTimeline ?? []).map((item) => item.account));
    const untouchedElsewhere = (entry: (typeof left)[number]) => Boolean(entry.fixtureId) && entry.revision === 1 && entry.account !== null && used.size > 0 && !used.has(entry.account);
    const unlisted = left.filter((entry) => entry.status === "active" && !untouchedElsewhere(entry));
    if (unlisted.length) problems.push(`entries in use that the case does not list: ${unlisted.map((entry) => entry.fixtureId ?? entry.id).join(", ")}`);
    return problems.length ? fail(problems.join("; ")) : pass(`${expected.length} memory entr${expected.length === 1 ? "y" : "ies"} as written`);
  },

  /** AG14: the entries the last turn used — exactly these (a fixture id, or kind and task for an entry made in the case). */
  memory_recalled(args, obs) {
    if (!Array.isArray(args)) return cannot("memory_recalled takes a list");
    if (!obs.memoryRecalled) return cannot("the runner did not read the memory.recall events");
    const left = [...obs.memoryRecalled];
    const missing: string[] = [];
    for (const want of args as (string | { category?: string; appliesTo?: string[] })[]) {
      const at = left.findIndex((item) => {
        if (typeof want === "string") return item.fixtureId === want;
        const entry = obs.memoryEntries?.find((candidate) => candidate.id === item.id);
        return !item.fixtureId && Boolean(entry) && (!want.category || entry!.category === want.category) && (!want.appliesTo || JSON.stringify(entry!.appliesTo) === JSON.stringify(want.appliesTo));
      });
      if (at < 0) missing.push(typeof want === "string" ? want : JSON.stringify(want));
      else left.splice(at, 1);
    }
    const evidence = seqs(obs.events.filter((event) => event.type === "memory.recall"));
    if (!missing.length && !left.length) return pass(`the last turn used ${args.length ? (args as unknown[]).map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(", ") : "no saved entry"}`, evidence);
    return fail([missing.length ? `not recalled: ${missing.join(", ")}` : "", left.length ? `recalled but not expected: ${left.map((item) => item.fixtureId ?? item.id).join(", ")}` : ""].filter(Boolean).join("; "), evidence);
  },

  /** AG14: what the settings API listed for that account's own sign-in when the case ended — exactly these entries. */
  settings_memory_list(args, obs) {
    const account = String(args?.account ?? "");
    const listed = obs.settingsMemory?.[account];
    if (!listed) return cannot(`the runner did not read the settings list of account ${account}`);
    if (listed.status !== 200) return fail(`the settings API answered HTTP ${listed.status} for account ${account}`);
    const want = [...((args?.entries ?? []) as string[])].sort();
    const got = [...listed.ids].sort();
    return JSON.stringify(want) === JSON.stringify(got) ? pass(`account ${account}'s settings list is ${got.length ? got.join(", ") : "empty"}`) : fail(`account ${account}'s settings list is [${got.join(", ")}], expected [${want.join(", ")}]`);
  },

  no_web_calls(_args, obs) {
    const web = obs.events.filter((event) => event.type === "web.search" || event.type === "web.fetch");
    return web.length ? fail(`${web.length} web call(s)`, seqs(web)) : pass("no web call");
  },

  web_calls(args, obs) {
    const search = obs.events.filter((event) => event.type === "web.search").length;
    const fetchCount = obs.events.filter((event) => event.type === "web.fetch").length;
    return search === Number(args?.search ?? 0) && fetchCount === Number(args?.fetch ?? 0) ? pass(`search ${search}, fetch ${fetchCount}`) : fail(`search ${search}, fetch ${fetchCount}; expected ${JSON.stringify(args)}`);
  },

  web_calls_max(args, obs) {
    const web = obs.events.filter((event) => event.type === "web.search" || event.type === "web.fetch");
    const max = typeof args === "number" ? args : Number(args?.search ?? 0) + Number(args?.fetch ?? 0);
    if (typeof args === "object" && args) {
      const search = web.filter((event) => event.type === "web.search").length;
      const fetchCount = web.length - search;
      return search <= Number(args.search ?? Infinity) && fetchCount <= Number(args.fetch ?? Infinity) ? pass(`search ${search}, fetch ${fetchCount}`) : fail(`search ${search}, fetch ${fetchCount}; max ${JSON.stringify(args)}`, seqs(web));
    }
    return web.length <= max ? pass(`${web.length} web call(s)`) : fail(`${web.length} web call(s), max ${max}`, seqs(web));
  },

  outbound_traceable(_args, obs) {
    // AG09 (README §3.2): every word of every query sent goes back to the user's own words in this case, the fixed
    // vocabulary (features/agent-v1/web/vocabulary.ts), or a clue the user clicked: words shown to the user in an
    // answer before a click that came before the search. Checked from the trace, independently of the product's own record.
    const queries = obs.events.filter((event) => event.type === "web.search");
    if (!queries.length) return pass("no outbound query was sent");
    const userTexts = obs.events.filter((event) => event.type === "turn.user").map((event) => String(event.text ?? ""));
    const vocabulary = new Set([...VOCABULARY_WORDS].flatMap((word) => word.split(/\s+/u)));
    const problems: string[] = [];
    for (const event of queries) {
      const query = String(event.query ?? (event.request as { query?: unknown } | undefined)?.query ?? "");
      if (!query) {
        problems.push(`seq ${event.seq}: no query recorded`);
        continue;
      }
      const clicked = obs.events.some((other) => other.type === "turn.select" && Number(other.seq) < Number(event.seq));
      // What the user saw: the delivered answers (a resumed request keeps the question it asked in its text).
      const shown = clicked ? obs.answers.map((answer) => answer.text) : [];
      const untraced = query.split(/\s+/u).filter(Boolean).filter((word) => !userTexts.some((text) => text.includes(word)) && !vocabulary.has(word) && !shown.some((text) => text.includes(word)));
      if (untraced.length) problems.push(`seq ${event.seq} "${query}": ${untraced.join(", ")} traced to nothing`);
    }
    return problems.length ? fail(problems.join("; "), seqs(queries)) : pass(`${queries.length} query(ies), every word from the user's words, the vocabulary or a clicked clue`, seqs(queries));
  },

  outbound_blocked(args, obs) {
    const blocked = obs.events.filter((event) => event.type === "web.outbound_blocked");
    return blocked.length === Number(args?.count) ? pass(`${blocked.length} blocked query(ies)`, seqs(blocked)) : fail(`${blocked.length} blocked query(ies), expected ${args?.count}`, seqs(blocked));
  },

  fetch_urls_within(args, obs) {
    const allowed = new Set((Array.isArray(args) ? args : []).map(String));
    const fetches = obs.events.filter((event) => event.type === "web.fetch");
    const outside = fetches.filter((event) => !allowed.has(String(event.url)));
    return outside.length ? fail(`fetched outside the set: ${outside.map((event) => event.url).join(", ")}`, seqs(outside)) : pass(`${fetches.length} fetch(es) within the set`);
  },

  model_calls_max(args, obs) {
    const calls = obs.events.filter((event) => event.type === "model.request");
    return calls.length <= Number(args) ? pass(`${calls.length} main-model call(s)`, seqs(calls)) : fail(`${calls.length} main-model call(s), max ${args}`, seqs(calls));
  },

  judgment_calls_max(args, obs) {
    const calls = logicalJudgmentCalls(obs);
    return calls.count <= Number(args) ? pass(`${calls.count} judgment call(s)${calls.retried ? ` (+${calls.retried} retry)` : ""}`, seqs(calls.requests)) : fail(`${calls.count} judgment call(s), max ${args}`, seqs(calls.requests));
  },

  judgment_calls(args, obs) {
    const calls = logicalJudgmentCalls(obs);
    return calls.count === Number(args) ? pass(`${calls.count} judgment call(s)${calls.retried ? ` (+${calls.retried} retry)` : ""}`, seqs(calls.requests)) : fail(`${calls.count} judgment call(s), expected ${args}`, seqs(calls.requests));
  },

  judgment_candidates_max(args, obs) {
    // AG08: the product traces each judgment request as judgment.decided with the number of candidates it sent.
    const decided = obs.events.filter((event) => event.type === "judgment.decided" && event.sent === true);
    const requests = obs.events.filter((event) => event.type === "judgment.request");
    if (!decided.length) return requests.length ? cannot("judgment requests without a judgment.decided event") : pass("no judgment call, so no candidates");
    const most = Math.max(...decided.map((event) => Number(event.candidates ?? 0)));
    return most <= Number(args) ? pass(`at most ${most} candidate(s) sent in one judgment request`, seqs(decided)) : fail(`${most} candidates sent in one judgment request, max ${args}`, seqs(decided));
  },

  functions_called(args, obs) {
    // AG10: the product traces fn.rank, fn.extractInteractions and fn.extractFollowUps when the function runs (not when it asks first).
    const expected = [...new Set((Array.isArray(args) ? args : []).map(String))].sort();
    const called = obs.events.filter((event) => (FUNCTION_EVENTS as readonly string[]).includes(event.type));
    const names = [...new Set(called.map((event) => event.type))].sort();
    return JSON.stringify(names) === JSON.stringify(expected) ? pass(`called: ${names.join(", ") || "none"}`, seqs(called)) : fail(`called ${names.join(", ") || "none"}, expected exactly ${expected.join(", ") || "none"}`, seqs(called));
  },

  judgment_question(args, obs) {
    // AG08 (JDG.yaml): requests that carried this question (judgment.decided, sent), and how often it fell to its
    // conservative result (below threshold, unavailable, not enabled, missing).
    const id = String(args?.id ?? "");
    const decided = obs.events.filter((event) => event.type === "judgment.decided" && Array.isArray(event.questionIds) && (event.questionIds as string[]).includes(id));
    const asked = decided.filter((event) => event.sent === true && Array.isArray(event.sentQuestionIds) && (event.sentQuestionIds as string[]).includes(id));
    const fallbacks = decided.reduce((sum, event) => sum + Number((event.fallbacks as Record<string, number> | undefined)?.[id] ?? 0), 0);
    const problems: string[] = [];
    if (args?.asked_min !== undefined && asked.length < Number(args.asked_min)) problems.push(`${id} asked ${asked.length} time(s), at least ${args.asked_min} expected`);
    if (args?.asked_max !== undefined && asked.length > Number(args.asked_max)) problems.push(`${id} asked ${asked.length} time(s), at most ${args.asked_max} expected`);
    if (args?.fallback_min !== undefined && fallbacks < Number(args.fallback_min)) problems.push(`${id} fell to its conservative result ${fallbacks} time(s), at least ${args.fallback_min} expected`);
    const detail = `${id}: asked ${asked.length}, conservative ${fallbacks}`;
    return problems.length ? fail(`${problems.join(" | ")} (${detail})`, seqs(decided)) : pass(detail, seqs(decided));
  },

  clarifications(args, obs) {
    // AG04: on the new entry a question is a set of directions of kind question or not_understood in a
    // result document, whatever its state now (answered, shelved). AG03 documents without sets: parts left
    // awaiting_clarification.
    const requests = obs.entry?.requests ?? [];
    const asked = obs.clarifications + requests.reduce((sum, request) => {
      const sets = request.document?.clarifications;
      if (sets) return sum + sets.filter((set) => set.kind === "question" || set.kind === "not_understood").length;
      return sum + (request.document?.partResults ?? []).filter((part) => part.status === "awaiting_clarification").length;
    }, 0);
    return asked === Number(args?.count) ? pass(`${asked} clarification(s)`) : fail(`${asked} clarification(s), expected ${args?.count}`);
  },

  clarify_max_per_part(args, obs) {
    // AG04: each question is traced once (clarify.asked) with the subgoal it stands for; a part answering a question keeps its subgoal.
    const asked = obs.events.filter((event) => event.type === "clarify.asked");
    const bySubgoal = new Map<string, number[]>();
    for (const event of asked) bySubgoal.set(String(event.subgoal), [...(bySubgoal.get(String(event.subgoal)) ?? []), Number(event.seq)]);
    const over = [...bySubgoal.entries()].filter(([, seqsOf]) => seqsOf.length > Number(args));
    return over.length ? fail(over.map(([subgoal, seqsOf]) => `${subgoal} asked ${seqsOf.length} times`).join("; "), over.flatMap(([, seqsOf]) => seqsOf)) : pass(`${asked.length} question(s) over ${bySubgoal.size} subgoal(s), at most ${args} each`, seqs(asked));
  },

  offered_options(args, obs) {
    // AG04: the clickable directions in the result documents (all kinds), and whether each is an 附录 A capability.
    if (!obs.entry) return cannot("the case did not run on the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)");
    const options = obs.entry.requests.flatMap((request) => (request.document?.clarifications ?? []).flatMap((set) => set.options.map((option) => ({ ...option, requestId: request.requestId }))));
    const problems: string[] = [];
    if (args?.min !== undefined && options.length < Number(args.min)) problems.push(`${options.length} option(s), at least ${args.min} expected`);
    if (args?.max !== undefined && options.length > Number(args.max)) problems.push(`${options.length} option(s), at most ${args.max} expected`);
    if (args?.all_registered) {
      const outside = options.filter((option) => !Object.prototype.hasOwnProperty.call(CAPABILITY_TABLE, option.capability));
      if (outside.length) problems.push(`not registered: ${outside.map((option) => option.capability).join(", ")}`);
    }
    const listing = options.map((option) => `${option.label} (${option.capability})`).join("; ") || "none";
    const evidence = obs.entry.requests.map((request) => request.endSeq).filter((seq): seq is number => seq !== null);
    return problems.length ? fail(`${problems.join(" | ")}: ${listing}`, evidence) : pass(`${options.length} option(s): ${listing}`, evidence);
  },

  // ── AG03: the first layer (UND.yaml / CTX.yaml / SCL.yaml proposed_checks) ──

  parts_split(args, obs) {
    const last = lastLayer(obs);
    if (!last) return cannot("no request reached the first layer (AG03 graph)");
    if (!last.handoff) return fail(`the last request ("${last.message}") has no first-layer handoff (its output was not usable)`);
    const parts = last.handoff.parts;
    const problems: string[] = [];
    if (args?.count !== undefined && parts.length !== Number(args.count)) problems.push(`${parts.length} part(s), expected ${args.count}`);
    if (args?.verbatim) for (const part of parts) if (!last.message.includes(part.sourceQuote)) problems.push(`${part.partId} quote "${part.sourceQuote}" is not in the message`);
    const listing = parts.map((part) => `${part.partId} "${part.sourceQuote}"`).join("; ");
    return problems.length ? fail(`${problems.join(" | ")} (${listing})`, [last.handoff.seq]) : pass(`${parts.length} part(s), quotes verbatim: ${listing}`, [last.handoff.seq]);
  },

  part_plan(args, obs) {
    if (!obs.firstLayer?.length) return cannot("no request reached the first layer (AG03 graph)");
    const problems: string[] = [];
    const evidence: number[] = [];
    const shown: string[] = [];
    for (const spec of (Array.isArray(args) ? args : []) as { quote: string; verdict?: string; route?: string | string[]; after?: string; refers?: Record<string, string | null> }[]) {
      const found = handoffPartFor(obs, spec.quote);
      if (!found) {
        problems.push(`no part holds "${spec.quote}"`);
        continue;
      }
      const { layer, part } = found;
      evidence.push(layer.handoff!.seq);
      shown.push(`"${spec.quote}" → ${part.partId} ${part.verdict}/${part.route}${part.dependsOn.length ? ` after ${part.dependsOn.join(",")}` : ""}`);
      if (spec.verdict !== undefined && part.verdict !== spec.verdict) problems.push(`"${spec.quote}": verdict ${part.verdict}, expected ${spec.verdict}`);
      if (spec.route !== undefined) {
        const routes = Array.isArray(spec.route) ? spec.route : [spec.route];
        if (!routes.includes(String(part.route))) problems.push(`"${spec.quote}": route ${part.route}, expected ${routes.join(" or ")}`);
      }
      if (spec.after !== undefined) {
        const before = layer.handoff!.parts.find((other) => other !== part && quoteMatches(other.sourceQuote, spec.after!));
        if (!before) problems.push(`"${spec.quote}": no part of the same request holds "${spec.after}"`);
        else if (!part.dependsOn.includes(before.partId)) problems.push(`"${spec.quote}" does not depend on "${spec.after}" (${before.partId}); dependsOn ${JSON.stringify(part.dependsOn)}`);
      }
      for (const [word, expected] of Object.entries(spec.refers ?? {})) {
        const named = part.objectClues.filter((clue) => clue.text && (clue.text.includes(word) || word.includes(clue.text)));
        const candidates = named.length ? named : part.objectClues;
        const bound = candidates.map((clue) => obs.fixtureIdOf(clue.recordId) ?? clue.recordId).filter((id): id is string => Boolean(id));
        if (expected === null ? bound.length > 0 : !bound.includes(String(expected))) problems.push(`"${spec.quote}": "${word}" bound to ${bound.join(", ") || "nothing"}, expected ${expected ?? "nothing"}`);
      }
    }
    return problems.length ? fail(problems.join(" | "), evidence) : pass(shown.join("; "), evidence);
  },

  parts(args, obs) {
    if (!obs.firstLayer?.length) return cannot("no request reached the first layer (AG03 graph)");
    const problems: string[] = [];
    const shown: string[] = [];
    for (const spec of (Array.isArray(args) ? args : []) as { quote: string; status: string }[]) {
      const layer = [...obs.firstLayer].reverse().find((item) => item.partResults.some((part) => part.sourceQuote && quoteMatches(part.sourceQuote, spec.quote)));
      const part = layer?.partResults.find((item) => item.sourceQuote && quoteMatches(item.sourceQuote, spec.quote));
      if (!part) {
        problems.push(`no result for a part holding "${spec.quote}"`);
        continue;
      }
      shown.push(`"${spec.quote}" ${part.status}`);
      if (part.status !== spec.status) problems.push(`"${spec.quote}": ${part.status}${part.reason ? ` (${part.reason})` : ""}, expected ${spec.status}`);
    }
    return problems.length ? fail(problems.join(" | ")) : pass(shown.join("; "));
  },

  routes_absent(args, obs) {
    const last = lastLayer(obs);
    if (!last) return cannot("no request reached the first layer (AG03 graph)");
    const banned = new Set((Array.isArray(args) ? args : []).map(String));
    const parts = last.handoff?.parts ?? [];
    const hit = parts.filter((part) => banned.has(String(part.route)));
    const routes = parts.map((part) => `${part.partId} ${part.route}`).join(", ") || "no parts";
    return hit.length ? fail(`${hit.map((part) => `${part.partId} "${part.sourceQuote}" → ${part.route}`).join("; ")}`, last.handoff ? [last.handoff.seq] : []) : pass(`last request: ${routes}`, last.handoff ? [last.handoff.seq] : []);
  },

  first_layer_context(args, obs) {
    const last = lastLayer(obs);
    if (!last || last.contextMessages === null) return cannot("no context.built event for the last request");
    const problems: string[] = [];
    if (args?.messages_max !== undefined && last.contextMessages > Number(args.messages_max)) problems.push(`${last.contextMessages} earlier message(s) given, max ${args.messages_max}`);
    const sent = last.understandPrompts.map((prompt) => prompt.text).join("\n");
    for (const fragment of (args?.excludes ?? []) as string[]) if (sent.includes(fragment)) problems.push(`"${fragment}" was sent to the first layer`);
    const evidence = [last.contextSeq, ...last.understandPrompts.map((prompt) => prompt.seq)].filter((seq): seq is number => seq !== null);
    return problems.length ? fail(problems.join(" | "), evidence) : pass(`${last.contextMessages} earlier message(s) given; ${last.understandPrompts.length} understand request(s) checked`, evidence);
  },

  context_messages_max(args, obs) {
    const layers = (obs.firstLayer ?? []).filter((layer) => layer.contextMessages !== null);
    if (!layers.length) return cannot("no context.built event");
    const over = layers.filter((layer) => (layer.contextMessages ?? 0) > Number(args));
    return over.length ? fail(over.map((layer) => `"${layer.message}": ${layer.contextMessages} message(s)`).join("; "), over.map((layer) => layer.contextSeq ?? -1)) : pass(`at most ${Math.max(...layers.map((layer) => layer.contextMessages ?? 0))} earlier message(s) per request`, layers.map((layer) => layer.contextSeq ?? -1));
  },

  requests(args, obs) {
    return obs.requests.length === Number(args?.count) ? pass(`${obs.requests.length} request(s)`, obs.requests.map((r) => r.seq)) : fail(`${obs.requests.length} request(s), expected ${args?.count}`, obs.requests.map((r) => r.seq));
  },

  // ── AG01: the protocol-3 entry (ENT.yaml proposed_checks; eval/README.md §3.4) ──

  request_states(args, obs) {
    const entry = obs.entry;
    if (!entry) return cannot("the case did not run on the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)");
    const problems: string[] = [];
    const evidence: number[] = [];
    for (const spec of (Array.isArray(args) ? args : []) as { quote: string; acked: string | string[]; final: string }[]) {
      const request = requestFor(entry, spec.quote);
      if (!request) {
        problems.push(`no request for "${spec.quote}"`);
        continue;
      }
      const acks = entry.acks.filter((ack) => ack.message === request.message).sort((left, right) => left.seq - right.seq);
      const first = acks[0];
      if (!first) {
        problems.push(`"${spec.quote}": no acknowledgement recorded`);
        continue;
      }
      evidence.push(...acks.map((ack) => ack.seq));
      const allowed = Array.isArray(spec.acked) ? spec.acked : [spec.acked];
      if (first.requestId !== request.requestId) problems.push(`"${spec.quote}": first ack carries ${first.requestId}, the request is ${request.requestId}`);
      if (!first.status || !allowed.includes(first.status)) problems.push(`"${spec.quote}": acknowledged as ${first.status ?? "nothing"} (HTTP ${first.httpStatus}), expected ${allowed.join(" or ")}`);
      const firstModelResponse = obs.events.find((event) => event.type === "model.response" && event.requestId === request.requestId);
      if (firstModelResponse) {
        evidence.push(Number(firstModelResponse.seq));
        if (!(first.seq < Number(firstModelResponse.seq))) problems.push(`"${spec.quote}": ack at seq ${first.seq} is not before the first model.response (seq ${firstModelResponse.seq})`);
      }
      for (const resend of acks.slice(1)) {
        if (resend.requestId !== request.requestId) problems.push(`"${spec.quote}": resend at seq ${resend.seq} got ${resend.requestId}, not the original ${request.requestId}`);
        if (!resend.status) problems.push(`"${spec.quote}": resend at seq ${resend.seq} got no status (HTTP ${resend.httpStatus})`);
      }
      if (request.status !== spec.final) problems.push(`"${spec.quote}": final status ${request.status}, expected ${spec.final}`);
      if (request.endSeq !== null) evidence.push(request.endSeq);
    }
    const summary = entry.requests.map((request) => `#${request.receivedSeq} ${request.status}`).join(", ");
    return problems.length ? fail(problems.join(" | "), evidence) : pass(`acks and final states as expected (${summary})`, evidence);
  },

  order(args, obs) {
    // AG13 (EVT.yaml): [{ op: 1 }, { op: 2 }] — the card items ran in that order: each later item's executor call starts
    // after the earlier item's receipt (the last card; items counted from 1).
    if (Array.isArray(args) && args.length && args.every((item) => item && typeof item === "object" && typeof (item as { op?: unknown }).op === "number")) {
      const card = cardAt(obs, "last");
      if (!card) return fail("no card");
      const ids = (args as { op: number }[]).map((item) => (card.ops[item.op - 1]?.raw as { operationId?: string } | undefined)?.operationId);
      if (ids.some((id) => !id)) return fail(`the card has no item ${(args as { op: number }[]).map((item) => item.op).join(" / ")}`);
      const call = (id: string) => obs.events.find((event) => event.type === "exec.call" && event.operationId === id);
      const receipt = (id: string) => obs.events.filter((event) => event.type === "exec.receipt" && event.operationId === id && event.status === "completed").at(-1);
      const problems: string[] = [];
      const evidence: number[] = [];
      for (let index = 1; index < ids.length; index += 1) {
        const before = receipt(ids[index - 1]!);
        const later = call(ids[index]!);
        if (!before) problems.push(`item ${(args as { op: number }[])[index - 1].op} has no completed receipt`);
        else if (!later) problems.push(`item ${(args as { op: number }[])[index].op} never ran`);
        else if (Number(later.seq) <= Number(before.seq)) problems.push(`item ${(args as { op: number }[])[index].op} ran at seq ${later.seq}, before item ${(args as { op: number }[])[index - 1].op}'s receipt at seq ${before.seq}`);
        else evidence.push(Number(before.seq), Number(later.seq));
      }
      return problems.length ? fail(problems.join("; "), evidence) : pass(`items ran in order ${(args as { op: number }[]).map((item) => item.op).join(" → ")}`, evidence);
    }
    const entry = obs.entry;
    if (!entry) return cannot("the case did not run on the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)");
    // AG06 (XL.yaml 约定): elements that name a kind of result — clarification, answer, card. A result counts from
    // the delivery that first showed it (the entry.finished after it was made); results of one delivery tie.
    if (Array.isArray(args) && args.every((item) => typeof item === "string")) {
      const finishes = obs.events.filter((event) => event.type === "entry.finished").map((event) => Number(event.seq));
      const made: Record<string, (event: TraceEvent) => boolean> = {
        answer: (event) => event.type === "node.enter" && event.node === "answer",
        card: (event) => event.type === "card.frozen" && event.origin === "product",
        clarification: (event) => event.type === "clarify.asked",
        // AG09 (WEB-006): a web call counts from the delivery after it was made.
        "web.fetch": (event) => event.type === "web.fetch",
        "web.search": (event) => event.type === "web.search",
      };
      const deliveredAt = (kind: string) => {
        const test = made[kind];
        const first = test ? obs.events.find(test) : undefined;
        if (!first) return null;
        return finishes.find((seq) => seq >= Number(first.seq)) ?? null;
      };
      const seen = (args as string[]).map((kind) => ({ at: deliveredAt(kind), kind }));
      const missing = seen.filter((item) => item.at === null).map((item) => item.kind);
      if (missing.length) return fail(`never delivered: ${missing.join(", ")}`);
      const problems = seen.slice(1).filter((item, index) => item.at! < seen[index].at!).map((item, index) => `${item.kind} was delivered before ${seen[index].kind}`);
      return problems.length ? fail(problems.join("; "), seen.map((item) => item.at!)) : pass(seen.map((item) => `${item.kind} delivered at seq ${item.at}`).join(", "), seen.map((item) => item.at!));
    }
    let sequence: EntryRequest[];
    if (args === "as_received") {
      sequence = [...entry.requests].sort((left, right) => left.receivedSeq - right.receivedSeq);
    } else {
      const quotes = (Array.isArray(args) ? args : []) as { quote: string }[];
      const found = quotes.map((item) => requestFor(entry, item.quote));
      const missing = quotes.filter((_, index) => !found[index]).map((item) => item.quote);
      if (missing.length) return fail(`no request for ${missing.map((quote) => `"${quote}"`).join(", ")}`);
      sequence = found as EntryRequest[];
    }
    const problems: string[] = [];
    const evidence: number[] = [];
    const ran = sequence.filter((request) => request.startedAt);
    for (const request of ran) {
      if (request.startSeq !== null) evidence.push(request.startSeq);
      if (request.endSeq !== null) evidence.push(request.endSeq);
    }
    for (let index = 1; index < ran.length; index += 1) {
      const previous = ran[index - 1];
      const current = ran[index];
      if (Date.parse(current.startedAt!) < Date.parse(previous.startedAt!)) problems.push(`#${current.receivedSeq} started before #${previous.receivedSeq}`);
      if (!previous.endedAt || Date.parse(current.startedAt!) < Date.parse(previous.endedAt)) problems.push(`#${current.receivedSeq} started at ${current.startedAt} before #${previous.receivedSeq} ended (${previous.endedAt ?? "never"})`);
      if (args !== "as_received" && current.receivedSeq < previous.receivedSeq) problems.push(`the server received "${current.message}" before "${previous.message}"`);
    }
    return problems.length ? fail(problems.join(" | "), evidence) : pass(`one round after another: ${ran.map((request) => `#${request.receivedSeq} ${request.startedAt}→${request.endedAt}`).join("; ")}`, evidence);
  },

  client_view_matches_result(args, obs) {
    const entry = obs.entry;
    if (!entry) return cannot("the case did not run on the protocol-3 entry (ORBIT_AGENT_V1_MODE=on)");
    const problems: string[] = [];
    for (const name of (Array.isArray(args) ? args : []) as string[]) {
      const view = entry.clients[name];
      if (!view) {
        problems.push(`${name}: no client view`);
        continue;
      }
      if (view.duplicates.length) problems.push(`${name}: received seq ${view.duplicates.join(", ")} more than once`);
      for (const request of entry.requests) {
        const shown = view.docs[request.requestId];
        if (!shown) problems.push(`${name}: does not show #${request.receivedSeq} (${request.requestId})`);
        else if (JSON.stringify(shown) !== JSON.stringify(request.document)) problems.push(`${name}: #${request.receivedSeq} shows revision ${(shown as { revision?: number }).revision} ${(shown as { status?: string }).status}, the stored document is revision ${request.document.revision} ${request.document.status}`);
      }
      for (const requestId of Object.keys(view.docs)) {
        if (!entry.requests.some((request) => request.requestId === requestId)) problems.push(`${name}: shows ${requestId}, which the server does not hold`);
      }
    }
    const evidence = entry.requests.map((request) => request.endSeq).filter((seq): seq is number => seq !== null);
    return problems.length ? fail(problems.join(" | "), evidence) : pass(`${(args as string[]).join(" and ")} show exactly the ${entry.requests.length} stored result document(s)`, evidence);
  },

  request_status(args, obs) {
    const entry = obs.entry;
    if (!entry) {
      // AG18 (shadow mode, protocol 2): the old path's request record — its state as the server stored it.
      const stored = [...obs.requests].sort((left, right) => left.seq - right.seq).pop();
      if (!stored) return cannot("the case did not run on the protocol-3 entry (ORBIT_AGENT_V1_MODE=on) and stored no old request");
      const state = stored.state === "completed" && stored.status === 200 ? "completed" : stored.state === "failed_before_execution" ? "failed" : stored.state ?? `HTTP ${stored.status}`;
      return state === args ? pass(`last request ${state} (protocol 2, HTTP ${stored.status})`, stored.seq >= 0 ? [stored.seq] : []) : fail(`last request ${state} (protocol 2, HTTP ${stored.status}), expected ${args}`, stored.seq >= 0 ? [stored.seq] : []);
    }
    const last = [...entry.requests].sort((left, right) => left.receivedSeq - right.receivedSeq).pop();
    if (!last) return fail("no request");
    return last.status === args ? pass(`last request ${last.status}`, last.endSeq !== null ? [last.endSeq] : []) : fail(`last request ${last.status}, expected ${args}`, last.endSeq !== null ? [last.endSeq] : []);
  },

  inbox(args, obs) {
    const created = obs.diff.records.filter((change) => change.collection === "inboxNotifications" && change.kind === "created");
    return created.length === Number(args?.count) ? pass(`${created.length} inbox item(s)`) : fail(`${created.length} inbox item(s), expected ${args?.count}`);
  },

  push(args, obs) {
    // AG16: "发出的提醒数" — reminders the (simulated) push service took. One it refused or did not answer is not a
    // reminder that went out; those are counted by push_delivery's attempts.
    const pushes = obs.events.filter((event) => event.type === "notify.push" && (event.outcome === undefined || event.outcome === "accepted"));
    const refused = obs.events.filter((event) => event.type === "notify.push" && event.outcome !== undefined && event.outcome !== "accepted").length;
    const shown = `${pushes.length} push(es)${refused ? ` (and ${refused} the push service refused or did not answer)` : ""}`;
    return pushes.length === Number(args?.count) ? pass(shown, seqs(pushes)) : fail(`${shown}, expected ${args?.count}`, seqs(pushes));
  },

  /**
   * AG16 (PSH.yaml proposed_checks): nothing of these is on any reminder — title, body or attached data — whether the
   * push service took it or refused it. Read from what the simulated push service was handed, not from the product.
   */
  push_excludes(args, obs) {
    const words = (Array.isArray(args) ? args : []).map(String);
    const pushes = obs.events.filter((event) => event.type === "notify.push");
    const found: string[] = [];
    for (const event of pushes) {
      const written = JSON.stringify({ body: event.body ?? null, data: event.data ?? null, title: event.title ?? null });
      for (const word of words) if (written.includes(word)) found.push(`"${word}" in reminder #${event.seq}`);
    }
    if (found.length) return fail(found.join(" | "), seqs(pushes));
    return pass(pushes.length ? `${pushes.length} reminder(s) handed to the push service; none holds any of the ${words.length} words` : "no reminder was handed to the push service", seqs(pushes));
  },

  /**
   * AG16 (PSH.yaml proposed_checks): one period of one rule — how many results it put in the inbox, how many times the
   * result was worked out, how many rounds the reminder took, and whether it arrived. Fields not written are not
   * checked. The run record comes from the database difference; what the simulated push service was handed and how
   * often the period ran come from the trace, and must agree with the record.
   */
  push_delivery(args, obs) {
    const expected = (Array.isArray(args) ? args : []) as { rule: string; at: string; inbox?: number; computed?: number; attempts?: number; delivered?: boolean }[];
    const runs = obs.ruleRuns;
    if (!runs) return cannot("the run history was not read");
    const problems: string[] = [];
    const shown: string[] = [];
    const evidence: number[] = [];
    for (const want of expected) {
      const product = obs.idMap[want.rule] ?? want.rule;
      const run = runs.find((item) => (item.fixtureRule === want.rule || item.rule === product) && Date.parse(item.scheduledAt) === Date.parse(want.at));
      if (!run) {
        problems.push(`no run of ${want.rule} planned for ${want.at}`);
        continue;
      }
      const runId = run.runId ?? "";
      const deliveryId = run.push?.deliveryId ?? (runId.startsWith("autorun:") ? `rule-push:${runId.slice("autorun:".length)}` : "");
      const handed = obs.events.filter((event) => event.type === "notify.push" && (event.data as { deliveryId?: string } | null)?.deliveryId === deliveryId);
      const accepted = handed.filter((event) => event.outcome === undefined || event.outcome === "accepted");
      const computedEvents = obs.events.filter((event) => event.type === "rule.run" && event.runId === runId);
      const failedTries = obs.events.filter((event) => event.type === "rule.period_failed" && event.automationId === run.rule && Date.parse(String(event.scheduledAt)) === Date.parse(run.scheduledAt));
      const computed = Math.max(computedEvents.length + failedTries.length, Number(run.computeAttempts ?? 1));
      const inbox = obs.diff.records.filter((change) => change.collection === "inboxNotifications" && change.kind === "created" && runId && JSON.stringify(change.after ?? {}).includes(runId)).length;
      const attempts = Number(run.push?.attempts ?? 0);
      const delivered = run.push?.state === "delivered";
      evidence.push(...seqs(handed), ...seqs(computedEvents));
      shown.push(`${want.rule} ${want.at}: inbox ${inbox}, computed ${computed}, attempts ${attempts}, delivered ${delivered} (reminder ${run.push?.state ?? "none"}${run.push?.reason ? `/${run.push.reason}` : ""}; result worked out at ${run.computedAt ?? "?"}${run.push?.deliveredAt ? `, reminder delivered at ${run.push.deliveredAt}` : ""})`);
      if (want.inbox !== undefined && inbox !== Number(want.inbox)) problems.push(`${want.rule}: ${inbox} inbox entr${inbox === 1 ? "y" : "ies"}, expected ${want.inbox}`);
      if (want.computed !== undefined && computed !== Number(want.computed)) problems.push(`${want.rule}: worked out ${computed} time(s), expected ${want.computed}`);
      if (want.attempts !== undefined && attempts !== Number(want.attempts)) problems.push(`${want.rule}: ${attempts} reminder attempt(s), expected ${want.attempts}`);
      if (want.delivered !== undefined && delivered !== Boolean(want.delivered)) problems.push(`${want.rule}: reminder ${delivered ? "delivered" : "not delivered"}, expected ${want.delivered ? "delivered" : "not delivered"}`);
      // The record and what the push service saw must tell the same story.
      if (attempts === 0 && handed.length) problems.push(`${want.rule}: the record says no attempt, but ${handed.length} reminder(s) were handed to the push service`);
      if (attempts > 0 && handed.length < attempts) problems.push(`${want.rule}: the record says ${attempts} attempt(s), the push service was handed ${handed.length}`);
      if (delivered !== accepted.length > 0) problems.push(`${want.rule}: the record says ${delivered ? "delivered" : "not delivered"}, the push service took ${accepted.length}`);
      // Completion time and reminder state are two fields: a delivered reminder has its own time, never earlier than the result's.
      if (delivered && (!run.push?.deliveredAt || !run.computedAt || Date.parse(run.push.deliveredAt) < Date.parse(run.computedAt))) problems.push(`${want.rule}: the reminder's delivery time (${run.push?.deliveredAt ?? "none"}) and the result's completion time (${run.computedAt ?? "none"}) are not kept as two separate times`);
      // Sending again is only sending: nothing of this period is read or computed after its first reminder attempt.
      const firstHanded = handed.length ? Math.min(...handed.map((event) => Number(event.seq))) : null;
      if (firstHanded !== null) {
        const again = obs.events.filter((event) => Number(event.seq) > firstHanded && event.requestId === `rule-run:${runId}` && (event.type === "model.request" || event.type === "judgment.request"));
        if (again.length) problems.push(`${want.rule}: ${again.length} model or judgment request(s) for this period after its first reminder attempt`);
      }
    }
    const unique = [...new Set(evidence)].sort((left, right) => left - right);
    return problems.length ? fail(`${problems.join(" | ")} (${shown.join("; ") || "no run found"})`, unique) : pass(shown.join("; "), unique);
  },

  http_status(args, obs) {
    // AG17 (MCP.yaml: "http_status 判的是最后一步那次调用"): with an external agent in the case, the last tool call it
    // made — after its one token refresh, when there was one; the runner's own reads afterwards (a card's final state
    // for the transcript) are not the call. Without one, the last HTTP response, as before.
    const last = mcpAnswers(obs).at(-1) ?? [...obs.events].reverse().find((event) => event.type === "http.response");
    return last && Number(last.status) === Number(args) ? pass(`last status ${last.status}`, seqs([last])) : fail(`last status ${last?.status ?? "none"}, expected ${args}`, last ? seqs([last]) : []);
  },

  // ── AG17: what the simulated external agent got back (MCP.yaml, SCL.yaml proposed_checks) ──

  /** Every tool answer of the case (results and error bodies): none carries the fragments. A fixture id means that record. */
  mcp_result_excludes(args, obs) {
    const answers = mcpAnswers(obs);
    if (!answers.length) return cannot("the external agent made no tool call in this case");
    const fragments = (Array.isArray(args) ? args : []).map(String);
    const found: string[] = [];
    const evidence: number[] = [];
    for (const answer of answers) {
      const text = JSON.stringify(withoutOpaque({ error: answer.error ?? null, result: answer.result ?? null }));
      for (const fragment of fragments) {
        const productId = obs.idMap[fragment];
        const isId = Boolean(productId) || /^[A-Z]{1,4}\d+$/u.test(fragment);
        // A fixture id stands for the record: its product id anywhere, or the id itself as a whole value. Anything else is text.
        const hit = isId ? (productId ? text.includes(JSON.stringify(productId).slice(1, -1)) : false) || text.includes(`"${fragment}"`) : text.includes(JSON.stringify(fragment).slice(1, -1));
        if (hit) {
          found.push(`${fragment} in the answer to ${answer.tool}${answer.page ? ` (page ${answer.page})` : ""} at seq ${answer.seq}`);
          evidence.push(Number(answer.seq));
        }
      }
    }
    // A connection's answers carry no id of a kind it was not granted, as a record or as a relation (coordinator, after
    // the final gate's judges): the grant is the one the signed-in user gave this connection in the case's consent step.
    for (const answer of answers) {
      const grant = grantOf(obs, String(answer.as ?? ""), Number(answer.seq));
      if (!grant || !answer.result) continue;
      const ungranted = Object.keys(KIND_IDS).filter((kind) => !grant.includes(`${kind}:read`));
      if (!ungranted.length) continue;
      const leaks = new Set<string>();
      walkResult(answer.result, (key, value) => {
        for (const kind of ungranted) {
          if (key && RELATION_KIND[key] === kind) leaks.add(`${key} (${kind})`);
          if (typeof value === "string" && KIND_IDS[kind]!.test(value)) leaks.add(`an id of ${kind}`);
        }
      });
      if (leaks.size) {
        found.push(`${[...leaks].join(", ")} in the answer to ${answer.tool} at seq ${answer.seq}, though ${answer.as} may not read ${[...new Set([...leaks].map((leak) => /(\w+)\)?$/u.exec(leak)![1]))].join(", ")}`);
        evidence.push(Number(answer.seq));
      }
    }
    // Every paging cursor, read the way a client could read it (as it is, base64-decoded, and each dot-separated part
    // decoded): no account id, no workspace, no record of the fixture and no readable time may be in it.
    const cursors = answers.filter((answer) => typeof (answer.result as Record<string, unknown> | null)?.next_cursor === "string");
    const secrets = [...new Set([...Object.values(obs.accounts), ...Object.values(obs.idMap)])].filter((value) => typeof value === "string" && value.length >= 5);
    for (const answer of cursors) {
      const cursor = String((answer.result as Record<string, unknown>).next_cursor);
      const decode = (value: string) => Buffer.from(value, "base64url").toString("latin1");
      const readings = [cursor, decode(cursor), ...cursor.split(".").map(decode)].join("\n");
      const seen = secrets.find((value) => readings.includes(value)) ?? (/workspace:|"actorId"|"workspaceId"/u.test(readings) ? "the workspace or account field" : /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(readings) ? "a readable time" : null);
      if (seen) {
        found.push(`the cursor of ${answer.tool}${answer.page ? ` (page ${answer.page})` : ""} at seq ${answer.seq} can be read: it holds ${obs.fixtureIdOf(seen) ?? seen}`);
        evidence.push(Number(answer.seq));
      }
    }
    return found.length ? fail(`found ${[...new Set(found)].slice(0, 12).join(" | ")}`, [...new Set(evidence)].slice(0, 30)) : pass(`none of the ${fragments.length} fragment(s) in ${answers.length} tool answer(s); ${cursors.length} cursor(s) unreadable`, seqs(answers).slice(-30));
  },

  /** The last tool answer has these fields: `present` means there and not empty; a value must be equal (a time as an instant). */
  mcp_result_has(args, obs) {
    const last = mcpAnswers(obs).at(-1);
    if (!last) return cannot("the external agent made no tool call in this case");
    const result = (last.result ?? {}) as Record<string, unknown>;
    const problems: string[] = [];
    for (const [field, expected] of Object.entries((args ?? {}) as Record<string, unknown>)) {
      const actual = result[field];
      if (expected === "present") {
        if (actual === undefined || actual === null || actual === "") problems.push(`${field} is missing or empty`);
      } else if (!sameValueOrInstant(expected, actual)) problems.push(`${field} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
    return problems.length ? fail(problems.join("; "), seqs([last])) : pass(`the last tool answer (${last.tool}, HTTP ${last.status}) has ${Object.keys(args ?? {}).join(", ")}`, seqs([last]));
  },

  /** The tool list the connection saw when it listed tools is exactly the named ones. */
  mcp_tool_list(args, obs) {
    const listed = [...obs.events].reverse().find((event) => event.type === "mcp.tools" && event.as === args?.as);
    if (!listed) return cannot(`connection ${args?.as} never listed its tools in this case`);
    const actual = ((listed.tools ?? []) as { name: string }[]).map((tool) => tool.name).sort();
    const expected = [...((args?.tools ?? []) as string[])].sort();
    return JSON.stringify(actual) === JSON.stringify(expected) ? pass(`${args.as} sees ${actual.join(", ") || "no tool"}`, seqs([listed])) : fail(`${args.as} sees ${actual.join(", ") || "no tool"}, expected ${expected.join(", ")}`, seqs([listed]));
  },

  /** The records of the latest mcp_paginate, all pages together: how many, how many more than once, which must be there. */
  mcp_collected(args, obs) {
    const paging = [...obs.events].reverse().find((event) => event.type === "mcp.paginate");
    if (!paging) return cannot("no mcp_paginate step ran in this case");
    const ids = (paging.ids ?? []) as string[];
    const unique = new Set(ids);
    const problems: string[] = [];
    if (paging.complete !== true) problems.push("the paging stopped before the last page");
    if (args?.count !== undefined && unique.size !== Number(args.count)) problems.push(`${unique.size} different record(s), expected ${args.count}`);
    if (args?.duplicates !== undefined && ids.length - unique.size !== Number(args.duplicates)) problems.push(`${ids.length - unique.size} record(s) came back more than once, expected ${args.duplicates}`);
    const missing = ((args?.includes ?? []) as string[]).filter((fixtureId) => !unique.has(obs.idMap[fixtureId] ?? fixtureId));
    if (missing.length) problems.push(`not among them: ${missing.join(", ")}`);
    return problems.length ? fail(problems.join("; "), seqs([paging])) : pass(`${unique.size} record(s) over ${paging.pages} page(s), none twice`, seqs([paging]));
  },

  /** README §3.2 "某次检索至少翻了几页": the pages of the latest paged retrieval (AG17: the external agent's mcp_paginate). */
  pages_read(args, obs) {
    const paging = [...obs.events].reverse().find((event) => event.type === "mcp.paginate");
    if (!paging) return cannot("no paged retrieval was recorded in this case");
    return Number(paging.pages) >= Number(args?.min ?? 1) ? pass(`${paging.pages} page(s)`, seqs([paging])) : fail(`${paging.pages} page(s), expected at least ${args?.min}`, seqs([paging]));
  },

  reads_include(args, obs) {
    const read = new Set(obs.reads.map((item) => item.fixtureId));
    const missing = (Array.isArray(args) ? args : []).filter((id: string) => !read.has(id));
    return missing.length ? fail(`not read: ${missing.join(", ")}`) : pass("all named records were read");
  },

  // ── AG05: reads (RD.yaml, SCL.yaml proposed_checks) ──

  gaps(args, obs) {
    if (!obs.firstLayer?.length) return cannot("no request reached the first layer (AG03 graph)");
    const problems: string[] = [];
    const shown: string[] = [];
    for (const spec of (Array.isArray(args) ? args : []) as { quote: string; reason: string }[]) {
      const layer = [...obs.firstLayer].reverse().find((item) => item.partResults.some((part) => part.sourceQuote && quoteMatches(part.sourceQuote, spec.quote)));
      const part = layer?.partResults.find((item) => item.sourceQuote && quoteMatches(item.sourceQuote, spec.quote));
      if (!part) {
        problems.push(`no part holding "${spec.quote}"`);
        continue;
      }
      const gaps = (part.gaps ?? []) as string[];
      shown.push(`"${spec.quote}" ${gaps.join("/") || "no gap"}`);
      if (!gaps.includes(spec.reason)) problems.push(`"${spec.quote}": ${gaps.length ? `gaps ${gaps.join(", ")}` : "no gap"}, expected ${spec.reason}`);
    }
    return problems.length ? fail(problems.join(" | ")) : pass(shown.join("; "));
  },

  recent_interaction(args, obs) {
    const problems: string[] = [];
    const shown: string[] = [];
    for (const spec of (Array.isArray(args) ? args : []) as { contact: string; occurredOn?: string; source?: string; unchanged?: boolean }[]) {
      const view = obs.recentInteractions?.[spec.contact];
      if (!view) {
        problems.push(`the recent-interaction view of ${spec.contact} was not read`);
        continue;
      }
      const after = view.after;
      shown.push(`${spec.contact}: ${after ? `${after.occurredOn} from ${after.source ?? after.productId}` : "none"}`);
      if (spec.unchanged) {
        if (JSON.stringify(view.before) !== JSON.stringify(after)) problems.push(`${spec.contact} changed: ${JSON.stringify(view.before)} → ${JSON.stringify(after)}`);
        continue;
      }
      if (!after) {
        problems.push(`${spec.contact}: no interaction`);
        continue;
      }
      if (spec.occurredOn && after.occurredOn !== spec.occurredOn) problems.push(`${spec.contact}: on ${after.occurredOn}, expected ${spec.occurredOn}`);
      if (spec.source === "created") {
        if (!obs.diff.records.some((change) => change.kind === "created" && change.collection === "notes" && change.id === after.productId)) problems.push(`${spec.contact}: the source ${after.productId} is not a memo created in this run`);
      } else if (spec.source && after.source !== spec.source) problems.push(`${spec.contact}: from ${after.source ?? after.productId}, expected ${spec.source}`);
    }
    return problems.length ? fail(problems.join(" | ")) : pass(shown.join("; "));
  },

  /**
   * AG15 (eval/README.md §3.4): the run history of the whole case is exactly these — rule, planned time, outcome and
   * the periods skipped (not written: 0). `rule: new` is the rule this case's conversation made.
   */
  rule_runs(args, obs) {
    const expected = (Array.isArray(args) ? args : []) as { rule: string; scheduledAt: string; outcome: string; skipped?: number }[];
    const runs = obs.ruleRuns;
    if (!runs) return cannot("the run history was not read");
    const fixtureRules = new Set(Object.keys(obs.idMap));
    const nameOf = (run: NonNullable<Observation["ruleRuns"]>[number]) => run.fixtureRule ?? (fixtureRules.has(run.rule) ? run.rule : "new");
    const shown = runs.map((run) => `${nameOf(run)} ${run.scheduledAt} ${run.outcome}${run.skipped ? ` skipped ${run.skipped}` : ""}`);
    const rest = [...runs];
    const problems: string[] = [];
    for (const want of expected) {
      const at = rest.findIndex((run) => nameOf(run) === want.rule && Date.parse(run.scheduledAt) === Date.parse(want.scheduledAt));
      if (at < 0) {
        problems.push(`no run of ${want.rule} planned for ${want.scheduledAt}`);
        continue;
      }
      const [run] = rest.splice(at, 1);
      if (run.outcome !== want.outcome) problems.push(`${want.rule} ${want.scheduledAt}: ${run.outcome}, expected ${want.outcome}`);
      if (run.skipped !== Number(want.skipped ?? 0)) problems.push(`${want.rule} ${want.scheduledAt}: skipped ${run.skipped}, expected ${want.skipped ?? 0}`);
    }
    for (const run of rest) problems.push(`unexpected run: ${nameOf(run)} ${run.scheduledAt} ${run.outcome}`);
    const evidence = seqs(obs.events.filter((event) => event.type === "rule.run"));
    return problems.length ? fail(`${problems.join(" | ")} (history: ${shown.join("; ") || "empty"})`, evidence) : pass(`history: ${shown.join("; ") || "empty"}`, evidence);
  },

  /** AG15: the state of a scheduled rule when the case ended (active, paused, completed; removed when it is gone). */
  rule_state(args, obs) {
    const rules = obs.rulesAfter;
    if (!rules) return cannot("the rules were not read");
    const product = obs.idMap[String(args?.rule)] ?? String(args?.rule);
    const found = rules.find((rule) => rule.fixtureId === args?.rule || rule.id === product);
    const state = found?.state ?? "removed";
    return state === args?.state ? pass(`rule ${args?.rule} is ${state}`) : fail(`rule ${args?.rule} is ${state}, expected ${args?.state}`);
  },

  listed(args, obs) {
    // AG05: until AG10's functions deliver lists of their own, the list delivered last is the last
    // answer's cited records in the order they are cited (登记 in CHANGES.md).
    // AG10 (CHANGES.md 2026-11-18): when the request of the last answer delivered a function's list (fn.rank), that list is it.
    // AG15 (SCL.yaml AE-SCL-029 notes: "listed 判的是最后一份交付的清单"): with no conversation, the list delivered last is
    // the last scheduled run that reached the inbox — its items in the order shown.
    const delivered = (obs.ruleRuns ?? []).filter((run) => run.delivery === "delivered" && run.listed.length > 0);
    const scheduled = delivered[delivered.length - 1];
    const answer = lastAnswer(obs) ?? (scheduled ? { citations: scheduled.listed, seq: Number(obs.events.filter((event) => event.type === "notify.inbox" && event.outcome === "written").pop()?.seq ?? -1), text: "" } : null);
    if (!answer) return fail("no answer");
    const own = functionListOf(obs, answer);
    const list = own ?? answer.citations;
    const problems: string[] = [];
    if (args?.exact && JSON.stringify(list) !== JSON.stringify(args.exact)) problems.push(`listed ${list.join(", ")}, expected exactly ${(args.exact as string[]).join(", ")}`);
    if (args?.within) for (const id of list) if (!(args.within as string[]).includes(id)) problems.push(`${id} is outside ${(args.within as string[]).join(", ")}`);
    if (args?.includes) for (const id of args.includes as string[]) if (!list.includes(id)) problems.push(`${id} is not listed`);
    if (args?.excludes) for (const id of args.excludes as string[]) if (list.includes(id)) problems.push(`${id} should not be listed`);
    if (args?.sequence) {
      const positions = (args.sequence as string[]).map((id) => list.indexOf(id));
      if (positions.some((at) => at < 0) || positions.some((at, index) => index > 0 && at < positions[index - 1])) problems.push(`not in the order ${(args.sequence as string[]).join(" → ")}`);
    }
    if (args?.count !== undefined && list.length !== Number(args.count)) problems.push(`${list.length} listed, expected ${args.count}`);
    return problems.length ? fail(`${problems.join(" | ")} (listed: ${list.join(", ") || "none"})`, [answer.seq]) : pass(`listed ${list.join(", ")}`, [answer.seq]);
  },

  answer_uses(args, obs) {
    const answer = lastAnswer(obs);
    if (!answer?.citations.length) return cannot("the answer carries no citations to tell which record it used (AG05)");
    return answer.citations.includes(args?.newer) && !answer.citations.includes(args?.not) ? pass(`cites ${args?.newer}, not ${args?.not}`, [answer.seq]) : fail(`citations ${answer.citations.join(", ")}`, [answer.seq]);
  },

  trace_complete(_args, obs, context) {
    const problems: string[] = [];
    const evidence: number[] = [];
    for (const change of obs.diff.records) {
      const writes = writesFor(obs.events, change);
      if (!writes.length) problems.push(`${obs.fixtureIdOf(change.id) ?? change.id} (${change.collection}) changed in db-diff but has no db.write event`);
    }
    const execCalls = obs.events.filter((event) => event.type === "exec.call");
    for (const write of obs.events.filter((event) => event.type === "db.write")) {
      const touchesBusiness = obs.diff.records.some((change) => isBusinessChange(change) && writesFor([write], change).length > 0);
      if (touchesBusiness && !execCalls.some((call) => Number(call.seq) < Number(write.seq))) {
        problems.push(`business db.write at seq ${write.seq} has no exec.call before it`);
        evidence.push(Number(write.seq));
      }
    }
    for (const card of obs.cards) {
      if (card.frozenSeq === null) problems.push(`card ${card.cardId} has no card.frozen event`);
    }
    for (const source of ["real", "simulated"]) {
      const requests = obs.events.filter((event) => event.type === "model.request" && event.source === source).length;
      const responses = obs.events.filter((event) => event.type === "model.response" && event.source === source).length;
      if (requests !== responses) problems.push(`${requests} ${source} model.request vs ${responses} model.response`);
    }
    const leaked = context.secrets.filter((secret) => secret && secret.length >= 8 && context.rawTrace.includes(secret));
    if (leaked.length) problems.push(`${leaked.length} secret value(s) appear in the trace`);
    if (/authjs\.session-token=(?!\[redacted\])/u.test(context.rawTrace) || /Bearer (?!\[redacted\])[A-Za-z0-9._~+/-]{12,}/u.test(context.rawTrace)) problems.push("a session cookie or bearer token appears in the trace");
    return problems.length ? fail(problems.join(" | "), evidence) : pass("every change has its db.write, business writes follow exec.call, every card has card.frozen, model calls are paired, no secrets");
  },

  egress(args, obs) {
    const providers: Record<string, string> = { "api.deepseek.com": "deepseek", "generativelanguage.googleapis.com": "gemini" };
    const connected = obs.events.filter((event) => event.type === "egress.connected");
    const outside = connected.filter((event) => !(args?.connected_within ?? []).includes(providers[String(event.host)] ?? String(event.host)));
    const blockedEvents = obs.events.filter((event) => event.type === "egress.blocked");
    const blockedHosts = new Set(blockedEvents.map((event) => String(event.host)));
    const expected = new Set<string>((args?.blocked ?? []).map(String));
    const problems: string[] = [];
    if (outside.length) problems.push(`connected outside ${JSON.stringify(args?.connected_within)}: ${outside.map((event) => event.host).join(", ")}`);
    for (const host of expected) {
      if (!blockedHosts.has(host)) problems.push(`no egress.blocked for ${host}`);
      if (connected.some((event) => event.host === host)) problems.push(`${host} was connected`);
    }
    for (const host of blockedHosts) if (!expected.has(host)) problems.push(`unexpected blocked host ${host}`);
    if (args?.run_voided === true && obs.run?.voided !== true) {
      if (obs.run === undefined) return { detail: `${problems.join(" | ") || "hosts as expected"}; run voiding is settled at the end of the run`, evidence: seqs(blockedEvents), status: problems.length ? "fail" : "deferred" };
      problems.push(`summary.json does not mark the run void (${JSON.stringify(obs.run?.voidReasons ?? null)})`);
    }
    return problems.length ? fail(problems.join(" | "), seqs(blockedEvents)) : pass(`connected only to ${[...new Set(connected.map((event) => providers[String(event.host)] ?? event.host))].join(", ") || "nothing"}; blocked ${[...blockedHosts].join(", ") || "nothing"}${args?.run_voided ? "; run marked void" : ""}`, seqs(blockedEvents));
  },

  event_sources(args, obs) {
    const calls = obs.events.filter((event) => CALL_EVENTS.has(event.type));
    const count = (source: string) => calls.filter((event) => event.source === source).length;
    const unmarked = calls.filter((event) => !event.source).length;
    const problems: string[] = [];
    for (const [key, value] of Object.entries(args ?? {})) {
      const n = Number(value);
      if (key === "unmarked") {
        if (unmarked !== n) problems.push(`unmarked ${unmarked} ≠ ${n}`);
      } else if (key.endsWith("_min")) {
        const source = key.slice(0, -4);
        if (count(source) < n) problems.push(`${source} ${count(source)} < ${n}`);
      } else if (count(key) !== n) problems.push(`${key} ${count(key)} ≠ ${n}`);
    }
    const summary = `real ${count("real")}, simulated ${count("simulated")}, replay ${count("replay")}, unmarked ${unmarked}`;
    return problems.length ? fail(`${summary}: ${problems.join("; ")}`, seqs(calls)) : pass(summary, seqs(calls));
  },

  summary_separates_simulated(_args, obs) {
    if (obs.run === undefined) return { detail: "settled at the end of the run", evidence: [], status: "deferred" };
    const run = obs.run as { simulatedCases?: string[]; summarySeparates?: boolean };
    return run.simulatedCases?.includes(obs.caseId) && run.summarySeparates ? pass("listed with the simulated cases; real and simulated counts in separate columns; cost counts real calls only") : fail(`simulated cases: ${JSON.stringify(run.simulatedCases)}; separate columns: ${run.summarySeparates}`);
  },

  costs_complete(_args, obs) {
    if (obs.run === undefined) return { detail: "settled at the end of the run", evidence: [], status: "deferred" };
    const run = obs.run as { costsProblems?: string[] };
    return run.costsProblems?.length ? fail(run.costsProblems.join("; ")) : pass("costs.json has counts, usage, priced amounts and the balance before/after, and its real counts and tokens equal the trace");
  },

  expect_judge_verdicts() {
    return { detail: "checked when the judgments are summarized (agent-eval:report)", evidence: [], status: "deferred" };
  },
};

export function runHardChecks(testCase: { hard: Record<string, unknown>[] }, obs: Observation, context: CheckContext): CheckResult[] {
  const results: CheckResult[] = [];
  let expectFail: string[] | null = null;
  for (const entry of testCase.hard) {
    const [check] = Object.keys(entry);
    const args = entry[check];
    if (check === "expect_hard_fail") {
      expectFail = (args as string[]) ?? [];
      continue;
    }
    const fn = CHECKS[check];
    if (!fn) {
      const sprint = NOT_YET[check];
      results.push({ args, check, ...cannot(sprint ? `no evidence for this check until ${sprint}` : "check not implemented") });
      continue;
    }
    try {
      results.push({ args, check, ...fn(args, obs, context) });
    } catch (error) {
      results.push({ args, check, ...cannot(`check crashed: ${error instanceof Error ? error.message : String(error)}`) });
    }
  }
  for (const step of obs.unsupported) {
    // run-03: a planned fault that never fired means the case did not test what it plans — said as such.
    if (step.word === "fault") results.push({ args: { step: step.step }, check: "fault_not_fired", detail: `fault not fired: ${step.reason}`, evidence: [], status: "fail" });
    else results.push({ args: { step: step.step }, check: `step:${step.word}`, detail: step.reason, evidence: [], status: "cannot_judge" });
  }
  // AG19 repair round 1: on every case, whatever its own list says — the blocks and the text of each result document agree.
  if (!testCase.hard.some((entry) => Object.keys(entry)[0] === ALWAYS_CHECK)) {
    try {
      results.push({ args: true, check: ALWAYS_CHECK, ...CHECKS[ALWAYS_CHECK](true, obs, context) });
    } catch (error) {
      results.push({ args: true, check: ALWAYS_CHECK, ...cannot(`check crashed: ${error instanceof Error ? error.message : String(error)}`) });
    }
  }
  if (expectFail) {
    const expected = new Set(expectFail);
    const wrong: string[] = [];
    for (const result of results) {
      if (expected.has(result.check)) {
        result.expectedToFail = true;
        if (result.status !== "fail") wrong.push(`${result.check} should fail but is ${result.status}`);
      } else if (result.status !== "pass" && result.status !== "deferred") wrong.push(`${result.check} should pass but is ${result.status}`);
    }
    results.push({ args: expectFail, check: "expect_hard_fail", detail: wrong.length ? wrong.join("; ") : `exactly ${expectFail.join(", ")} failed, as the case expects`, evidence: [], status: wrong.length ? "fail" : "pass" });
  }
  return results;
}

/** Hard checks pass: every check passes, except that under expect_hard_fail the listed ones must fail. */
export function hardChecksPass(results: readonly CheckResult[]): boolean {
  const expectation = results.find((result) => result.check === "expect_hard_fail");
  if (expectation) return expectation.status === "pass" && results.filter((result) => !result.expectedToFail && result.check !== "expect_hard_fail").every((result) => result.status === "pass" || result.status === "deferred");
  return results.every((result) => result.status === "pass" || result.status === "deferred");
}
