/**
 * The protocol-3 entry (agent-design AG01, 设计稿 §3.7 and §7).
 *
 * acceptMessage() only authenticates (the caller), de-duplicates and persists, then answers with
 * the requestId and the request's status; processing is scheduled after the response. A session
 * is drained one request at a time in the order the server received them. The result document is
 * the only delivery: getRequestResult() reads it, the event channel is another way to read it.
 * cancelCurrentRun() stops one request: after that it makes no model call and a late result is
 * not written, while the requests queued behind it go on.
 *
 * The existing runtime cannot be interrupted from outside, so each run gets a fetch that refuses
 * every call once the run is stopped (gemini-provider's fetchImplementation), and the drain stops
 * waiting for it.
 */
import { randomUUID } from "node:crypto";

import type {
  AgentActionPreviewContract,
  AgentAnswerBasisContract, AgentAnswerBlockContract, AgentAnswerMemoryUseContract,
  AgentWebResultContract,
  AgentRunStage,
  AgentPartResult,
  AgentCancelResultContract,
  AgentClarificationContract,
  AgentResultDocument,
  AgentSelectionInputContract,
  AgentSelectionReceiptContract,
  AgentSendInputContract,
  AgentSendReceiptContract,
  AgentSessionEventsPageContract,
} from "../../../shared/contract/agent-v1";
import { emitTrace, runWithTraceContext } from "../observability/trace";
import {
  agentEntryFingerprint,
  agentRequestIdFor,
  FINAL_STATUSES,
  type AgentEntryInput,
  type AgentEntryOutcome,
  type AgentEntryRequestRecord,
  type AgentEntryStore,
  type AgentPendingResume,
} from "./store";

export interface AgentEntryHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentEntryExecuteInput {
  actorId: string;
  requestId: string;
  sessionId: string;
  input: AgentEntryInput;
  history: readonly AgentEntryHistoryTurn[];
  /** Refuses every call after the run is stopped; pass it to the model provider. */
  fetchImplementation: typeof fetch;
  signal: AbortSignal;
  /** AG04: a click resumes this request (its thread waits in clarify); no new message. */
  resume?: AgentPendingResume;
  /** AG04: the request's result document as delivered so far (the labels of its directions). */
  document?: AgentResultDocument;
  /** AG07: the round reached a step a client shows as progress. */
  onStage?: (stage: AgentRunStage) => void;
}

export interface AgentEntryExecuteResult {
  text: string;
  sourceRefs: readonly string[];
  /** AG07: the answer's basis line and record links (code's, from sourceRefs). */
  basis?: AgentAnswerBasisContract | null;
  /** AG19: the answer laid out in blocks (code's). */
  blocks?: readonly AgentAnswerBlockContract[];
  /** AG14 UI: the memory chips at the start of the answer (code's). */
  memoryUse?: readonly AgentAnswerMemoryUseContract[];
  /** AG07: the part of `text` that stands for the card. */
  cardLine?: string;
  /** AG09: the queries sent and the pages opened in this round. */
  web?: AgentWebResultContract | null;
  /** AG02: the card of this round, frozen in the action ledger (never a direct write). */
  actionPreview?: AgentActionPreviewContract;
  /** AG03: one result per part the first layer found; without it the round is one part, p1. */
  partResults?: readonly AgentPartResult[];
  /** AG03: waiting_user when a part waits for the user (an alternative to accept, a question). */
  status?: "completed" | "waiting_user";
  /** AG04: the round's clickable directions. */
  clarifications?: readonly AgentClarificationContract[];
}

export type AgentEntryExecutor = (input: AgentEntryExecuteInput) => Promise<AgentEntryExecuteResult>;

/** Thrown by an executor for a failure it can name (REFERENCE_NOT_ACCESSIBLE, MODEL_UNAVAILABLE, …). */
export class AgentEntryExecutionError extends Error {
  constructor(readonly reason: string, message?: string) {
    super(message ?? reason);
  }
}

export class AgentRunStoppedError extends Error {
  constructor() {
    super("This Agent run was stopped; no further model call is made.");
  }
}

/** The chat session the messages are shown in. Processing appends to it; it is not the delivery. */
export interface AgentEntrySessionWriter {
  history(sessionId: string): Promise<AgentEntryHistoryTurn[]>;
  appendUser(sessionId: string, record: AgentEntryRequestRecord, createdAt: string): Promise<void>;
  /**
   * `key` (AG04): a continuation after a click is its own assistant message. `recordRefs` (AG05): the
   * records the answer cites, so a later turn can point back at them (and re-check them).
   */
  appendAssistant(sessionId: string, record: AgentEntryRequestRecord, text: string, createdAt: string, key?: string, recordRefs?: readonly string[]): Promise<void>;
}

export interface AgentEntryDependencies {
  store: AgentEntryStore;
  execute: AgentEntryExecutor;
  sessions?: AgentEntrySessionWriter | null;
  now?: () => string;
  /** Runs processing after the response has been sent (next/server `after` in routes). */
  schedule?: (task: () => Promise<void>) => void;
  leaseMs?: number;
  heartbeatMs?: number;
  workerId?: string;
}

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_HEARTBEAT_MS = 5_000;
const PROCESS_WORKER_ID = `worker:${process.pid}:${randomUUID()}`;

interface DrainState {
  again: boolean;
  claimed: AgentEntryRequestRecord[];
  promise: Promise<void>;
}

/** Per-process bookkeeping: one drain loop per session, one stop switch per running request. */
const drains = new Map<string, DrainState>();
const runs = new Map<string, AbortController>();
const key = (actorId: string, id: string) => `${actorId}\u0000${id}`;

function nowOf(deps: AgentEntryDependencies): string {
  return deps.now?.() ?? new Date().toISOString();
}

function workerOf(deps: AgentEntryDependencies): string {
  return deps.workerId ?? PROCESS_WORKER_ID;
}

/** A fetch for one run: after `signal` aborts, it refuses to call anything and aborts calls in flight. */
export function createStoppableFetch(signal: AbortSignal, onRefused?: () => void): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (signal.aborted) {
      onRefused?.();
      throw new AgentRunStoppedError();
    }
    const combined = init?.signal ? AbortSignal.any([init.signal, signal]) : signal;
    return fetch(input, { ...init, signal: combined });
  }) as typeof fetch;
}

function receiptOf(record: AgentEntryRequestRecord, replayed: boolean): AgentSendReceiptContract {
  return {
    acceptedAt: record.receivedAt,
    clientMessageId: record.clientMessageId,
    protocolVersion: 3,
    receivedSeq: record.receivedSeq,
    replayed,
    requestId: record.requestId,
    sessionId: record.sessionId,
    status: record.status,
  };
}

/** POST conversation/message: persist, de-duplicate, answer. Never waits for the model. */
export async function acceptMessage(
  deps: AgentEntryDependencies,
  input: { actorId: string; body: AgentSendInputContract },
): Promise<{ receipt: AgentSendReceiptContract; replayed: boolean }> {
  const { body } = input;
  const entryInput: AgentEntryInput = {
    locale: body.locale,
    message: body.message,
    references: body.references,
    ...(body.origin ? { origin: body.origin } : {}),
    ...(body.pageContext ? { pageContext: body.pageContext } : {}),
    // AG20a (decision 8): the device's zone, checked when the turn runs (graph/executor.ts); not part of the fingerprint.
    ...(body.timeZone ? { timeZone: body.timeZone } : {}),
  };
  const requestId = agentRequestIdFor(input.actorId, body.sessionId, body.clientMessageId);
  const accepted = await deps.store.accept({
    actorId: input.actorId,
    clientMessageId: body.clientMessageId,
    fingerprint: agentEntryFingerprint(body.sessionId, body.clientMessageId, entryInput),
    input: entryInput,
    leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS,
    now: nowOf(deps),
    requestId,
    sessionId: body.sessionId,
    workerId: workerOf(deps),
  });
  const { record, replayed } = accepted;
  emitTrace({
    arrivedWhileRunning: record.arrivedWhileRunning,
    queueAheadAtArrival: record.queueAheadAtArrival,
    receivedSeq: record.receivedSeq,
    replayed,
    requestId,
    sessionId: body.sessionId,
    status: record.status,
    type: replayed ? "entry.replayed" : "entry.accepted",
  });
  if (!replayed && !accepted.claimed) emitTrace({ queueAheadAtArrival: record.queueAheadAtArrival, requestId, sessionId: body.sessionId, type: "entry.queued" });
  if (accepted.claimed) kickSession(deps, input.actorId, body.sessionId, record);
  else if (replayed) void maybeResumeSession(deps, input.actorId, body.sessionId);
  else kickSession(deps, input.actorId, body.sessionId);
  return { receipt: receiptOf(record, replayed), replayed };
}

/**
 * AG04: a click under a set of directions (设计稿 §3.7 第一行). Stored first and answered at once; it is
 * checked against the options offered then and processed in the session's order, resuming the request
 * it was offered in. It is not a new request and never goes to the model.
 */
export async function acceptSelection(
  deps: AgentEntryDependencies,
  input: { actorId: string; body: AgentSelectionInputContract },
): Promise<{ receipt: AgentSelectionReceiptContract; replayed: boolean }> {
  const { body } = input;
  const accepted = await deps.store.acceptSelection({
    actorId: input.actorId,
    clarificationId: body.selection.clarificationId,
    clientSelectionId: body.clientSelectionId,
    leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS,
    now: nowOf(deps),
    optionId: body.selection.optionId,
    requestId: body.selection.requestId,
    sessionId: body.sessionId,
    workerId: workerOf(deps),
  });
  const { record, replayed } = accepted;
  emitTrace({ clarificationId: body.selection.clarificationId, optionId: body.selection.optionId, replayed, requestId: record.requestId, sessionId: body.sessionId, status: record.status, type: replayed ? "entry.selection_replayed" : "entry.selection_accepted" });
  if (accepted.claimed) kickSession(deps, input.actorId, body.sessionId, record);
  else if (!replayed) kickSession(deps, input.actorId, body.sessionId);
  return {
    receipt: { acceptedAt: (record.selections ?? []).find((item) => item.clientSelectionId === body.clientSelectionId)?.at ?? nowOf(deps), clarificationId: body.selection.clarificationId, clientSelectionId: body.clientSelectionId, optionId: body.selection.optionId, protocolVersion: 3, replayed, requestId: record.requestId, sessionId: record.sessionId, status: record.status },
    replayed,
  };
}

/** GET conversation/request: the result document, for its owner only. */
export async function getRequestResult(
  deps: AgentEntryDependencies,
  input: { actorId: string; requestId: string },
): Promise<AgentResultDocument | null> {
  const record = await deps.store.get(input.actorId, input.requestId);
  if (!record) return null;
  if (!FINAL_STATUSES.has(record.status)) void maybeResumeSession(deps, input.actorId, record.sessionId);
  return record.document;
}

/** The request record (status, timings, metrics) for its owner only. */
export async function getRequestRecord(
  deps: AgentEntryDependencies,
  input: { actorId: string; requestId: string },
): Promise<AgentEntryRequestRecord | null> {
  return deps.store.get(input.actorId, input.requestId);
}

/** Stop: ends this one request; the queue behind it keeps going. */
export async function cancelCurrentRun(
  deps: AgentEntryDependencies,
  input: { actorId: string; requestId: string },
): Promise<AgentCancelResultContract | null> {
  const cancelled = await deps.store.cancel({ actorId: input.actorId, now: nowOf(deps), requestId: input.requestId });
  if (!cancelled) return null;
  if (cancelled.changed) {
    runs.get(key(input.actorId, input.requestId))?.abort();
    emitTrace({ requestId: input.requestId, sessionId: cancelled.record.sessionId, type: "entry.cancelled" });
    kickSession(deps, input.actorId, cancelled.record.sessionId);
  }
  return { changed: cancelled.changed, document: cancelled.record.document, requestId: input.requestId };
}

/** GET conversation/events (JSON read): the session's events after `afterSeq`. */
export async function listSessionEvents(
  deps: AgentEntryDependencies,
  input: { actorId: string; sessionId: string; afterSeq: number; limit?: number },
): Promise<AgentSessionEventsPageContract> {
  const events = await deps.store.listEvents(input.actorId, input.sessionId, input.afterSeq, input.limit ?? 200);
  return { events, lastSeq: events.length ? events[events.length - 1].seq : input.afterSeq, sessionId: input.sessionId };
}

/**
 * A process that reads a session whose queue is stuck (nothing running but requests waiting, or a
 * running request whose lease ran out because its process went away) picks the work up.
 */
export async function maybeResumeSession(deps: AgentEntryDependencies, actorId: string, sessionId: string): Promise<void> {
  try {
    if (drains.has(key(actorId, sessionId))) return;
    const lane = await deps.store.lane(actorId, sessionId);
    if (!lane) return;
    const stale = lane.running && Date.parse(lane.running.leaseUntil) <= Date.parse(nowOf(deps));
    if (stale || (!lane.running && lane.queue.length > 0)) kickSession(deps, actorId, sessionId);
  } catch {
    // a read never fails because the resume check did
  }
}

/** Starts (or nudges) this process's drain loop for a session. */
export function kickSession(deps: AgentEntryDependencies, actorId: string, sessionId: string, claimed?: AgentEntryRequestRecord): Promise<void> {
  const drainKey = key(actorId, sessionId);
  const existing = drains.get(drainKey);
  if (existing) {
    if (claimed) existing.claimed.push(claimed);
    existing.again = true;
    return existing.promise;
  }
  const state: DrainState = { again: false, claimed: claimed ? [claimed] : [], promise: Promise.resolve() };
  drains.set(drainKey, state);
  let start!: () => void;
  const started = new Promise<void>((resolve) => { start = resolve; });
  state.promise = started.then(async () => {
    try {
      for (;;) {
        let next = state.claimed.shift() ?? null;
        let takeover = false;
        if (!next) {
          state.again = false;
          const claim = await deps.store.claimNext({ actorId, leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS, now: nowOf(deps), sessionId, workerId: workerOf(deps) });
          next = claim?.record ?? null;
          takeover = claim?.takeover ?? false;
        }
        if (!next) {
          if (state.again || state.claimed.length) continue;
          break;
        }
        const record = next;
        await runWithTraceContext({ requestId: record.requestId }, () => processRequest(deps, actorId, record, takeover));
      }
    } catch (error) {
      emitTrace({ error: error instanceof Error ? error.message : String(error), sessionId, type: "error", where: "entry.drain" });
    } finally {
      drains.delete(drainKey);
    }
  });
  const schedule = deps.schedule ?? ((task: () => Promise<void>) => { void task(); });
  schedule(async () => {
    start();
    await state.promise;
  });
  return state.promise;
}

async function processRequest(deps: AgentEntryDependencies, actorId: string, record: AgentEntryRequestRecord, takeover: boolean): Promise<void> {
  const startedAt = nowOf(deps);
  const workerId = workerOf(deps);
  emitTrace({
    attempt: record.attempts,
    queueWaitMs: Math.max(0, Date.parse(record.startedAt ?? startedAt) - Date.parse(record.receivedAt)),
    receivedSeq: record.receivedSeq,
    requestId: record.requestId,
    sessionId: record.sessionId,
    takeover,
    type: "entry.started",
  });
  const controller = new AbortController();
  const runKey = key(actorId, record.requestId);
  runs.set(runKey, controller);
  const heartbeat = setInterval(() => {
    void deps.store.renewLease({ actorId, leaseMs: deps.leaseMs ?? DEFAULT_LEASE_MS, now: nowOf(deps), requestId: record.requestId, workerId })
      .then((lease) => {
        if (!lease.owned || lease.status === "cancelled") controller.abort();
      })
      .catch(() => undefined);
  }, deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS);
  heartbeat.unref?.();
  const stopped = new Promise<"stopped">((resolve) => {
    if (controller.signal.aborted) resolve("stopped");
    controller.signal.addEventListener("abort", () => resolve("stopped"), { once: true });
  });
  let outcome: AgentEntryOutcome | null = null;
  const resume = record.pendingResume ?? null;
  try {
    const history = (await deps.sessions?.history(record.sessionId).catch(() => [])) ?? [];
    // A click resumes a request whose message is already in the session.
    if (!resume) {
      await deps.sessions?.appendUser(record.sessionId, record, startedAt).catch((error: unknown) => {
        emitTrace({ error: error instanceof Error ? error.message : String(error), requestId: record.requestId, type: "error", where: "entry.appendUser" });
      });
    }
    const fetchImplementation = createStoppableFetch(controller.signal, () => emitTrace({ requestId: record.requestId, type: "entry.model_call_refused" }));
    // AG07: progress only (an event on the channel); a step reached after the round was stopped is not reported.
    let lastStage: AgentRunStage | null = null;
    const onStage = (stage: AgentRunStage) => {
      if (stage === lastStage || controller.signal.aborted || !deps.store.markStage) return;
      lastStage = stage;
      void deps.store.markStage({ actorId, now: nowOf(deps), requestId: record.requestId, sessionId: record.sessionId, stage, workerId }).catch(() => undefined);
    };
    const execution = deps.execute({ actorId, fetchImplementation, history, input: record.input, onStage, requestId: record.requestId, sessionId: record.sessionId, signal: controller.signal, ...(resume ? { document: record.document, resume } : {}) });
    execution.catch(() => undefined);
    const result = await Promise.race([execution, stopped]);
    if (result !== "stopped") {
      outcome = {
        answer: { sourceRefs: [...result.sourceRefs], text: result.text, ...(result.basis ? { basis: result.basis } : {}), ...(result.blocks?.length ? { blocks: [...result.blocks] } : {}), ...(result.memoryUse?.length ? { memoryUse: [...result.memoryUse] } : {}), ...(result.cardLine ? { cardLine: result.cardLine } : {}), ...(result.web && (result.web.queries.length || result.web.pages.length) ? { web: result.web } : {}) },
        partResults: result.partResults?.length ? [...result.partResults] : [result.actionPreview && (result.actionPreview.status === "awaiting_confirmation" || result.actionPreview.status === "deferred")
          ? { operationId: result.actionPreview.operations[0]?.operationId, partId: "p1", status: "awaiting_confirmation" }
          : { partId: "p1", status: "answered" }],
        status: result.status ?? "completed",
        ...(result.actionPreview ? { actionPreview: result.actionPreview } : {}),
        ...(result.clarifications ? { clarifications: result.clarifications } : {}),
      };
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      const reason = error instanceof AgentEntryExecutionError ? error.reason : "SERVICE_ERROR";
      outcome = {
        answer: null,
        ending: { at: nowOf(deps), kind: "failed", reason },
        partResults: [{ partId: "p1", status: "failed" }],
        status: "failed",
      };
    }
  } finally {
    clearInterval(heartbeat);
    runs.delete(runKey);
  }
  if (!outcome) {
    emitTrace({ reason: "stopped", requestId: record.requestId, sessionId: record.sessionId, type: "entry.discarded" });
    return;
  }
  const finishedAt = nowOf(deps);
  const finished = await deps.store.finish({ actorId, now: finishedAt, outcome, requestId: record.requestId, workerId });
  if (!finished.delivered) {
    // Stopped (or taken over) while the runtime was still answering: the late result is not delivered.
    emitTrace({ reason: finished.record?.status === "cancelled" ? "stopped" : "not_owner", requestId: record.requestId, sessionId: record.sessionId, type: "entry.discarded" });
    return;
  }
  if (outcome.status !== "failed" && outcome.answer?.text) {
    await deps.sessions?.appendAssistant(record.sessionId, finished.record!, outcome.answer.text, finishedAt, resume ? resume.clientSelectionId : undefined, outcome.answer.sourceRefs).catch((error: unknown) => {
      emitTrace({ error: error instanceof Error ? error.message : String(error), requestId: record.requestId, type: "error", where: "entry.appendAssistant" });
    });
  }
  emitTrace({
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
    requestId: record.requestId,
    revision: finished.record?.document.revision ?? null,
    sessionId: record.sessionId,
    status: outcome.status,
    type: "entry.finished",
  });
}

/** For tests: wait until this process has no drain running for the session. */
export async function settleSession(actorId: string, sessionId: string): Promise<void> {
  for (let i = 0; i < 1000; i += 1) {
    const state = drains.get(key(actorId, sessionId));
    if (!state) return;
    await state.promise;
  }
}
