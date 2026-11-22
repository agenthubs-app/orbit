/**
 * Entry records, the per-session queue ("lane") and the session event log (agent-design AG01).
 *
 * A message is accepted by writing one request record; everything after that (claiming the
 * next request of a session, finishing it, stopping it) is a conditional update made under
 * the session's lock, so a session has at most one running request at any time, also across
 * processes. A running request holds a lease; when its process stops renewing it, the next
 * process that looks at the session takes the same request over under its original key.
 *
 * Postgres: requests live in `orbit_agent_chat_requests` under the existing record id
 * (sha256(actorId, requestId)); the lane and the events are their own collections. The lock is
 * `pg_advisory_xact_lock`, as the reliable send (orbit-agent-chat-request-store.ts) does.
 */
import { joinBlocks, languageOfText } from "../answer/blocks";
import { createHash } from "node:crypto";

import type {
  AgentActionPreviewContract,
  AgentAnswerContract,
  AgentClarificationContract,
  AgentPartResult,
  AgentRequestEndingContract,
  AgentRequestStatus,
  AgentResultDocument,
  AgentSendInputContract,
  AgentSessionEventContract,
  AgentRunStage,
  AgentSessionEventKind,
} from "../../../shared/contract/agent-v1";
import { attributeSelection } from "../clarify/attribution";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import { ORBIT_AGENT_CHAT_REQUEST_COLLECTION as REQUEST_COLLECTION, orbitAgentChatRequestRecordId as requestRecordId } from "../../orbit-ai/storage/orbit-agent-chat-request-ids";

export const LANE_COLLECTION = "agent_v1_session_lanes";
export const EVENT_COLLECTION = "agent_v1_session_events";
export const SESSION_TARGET_TYPE = "agent_v1_session";

export const FINAL_STATUSES: ReadonlySet<AgentRequestStatus> = new Set(["completed", "failed", "cancelled"]);

export type AgentEntryInput = Pick<AgentSendInputContract, "locale" | "message" | "origin" | "pageContext" | "references" | "timeZone">;

export interface AgentEntryRequestRecord {
  protocolVersion: 3;
  requestId: string;
  sessionId: string;
  clientMessageId: string;
  fingerprint: string;
  input: AgentEntryInput;
  status: AgentRequestStatus;
  receivedSeq: number;
  receivedAt: string;
  /** Another request of the session was running when this one arrived (设计稿 §7：处理中又来消息的比例). */
  arrivedWhileRunning: boolean;
  /** Requests ahead of this one (running plus queued) when it arrived. */
  queueAheadAtArrival: number;
  startedAt: string | null;
  endedAt: string | null;
  attempts: number;
  workerId: string | null;
  document: AgentResultDocument;
  /** AG04: a click waiting to resume this request (stored first, processed in the session's order). */
  pendingResume?: AgentPendingResume | null;
  /** AG04: the clicks accepted for this request, by their key (a resend returns the first). */
  selections?: { clientSelectionId: string; clarificationId: string; optionId: string; at: string }[];
}

export interface AgentPendingResume {
  kind: "select";
  clientSelectionId: string;
  clarificationId: string;
  optionId: string;
}

/** AG04: what an earlier request's document gets when a later message answered or shelved its question. */
export interface AgentEntryAmendment {
  partResults: readonly AgentPartResult[];
  clarifications: readonly AgentClarificationContract[];
  status: "completed" | "waiting_user";
  /** AG06 repair 1: the card was frozen again; the document shows the new one (and its line in the answer). */
  actionPreview?: AgentActionPreviewContract;
  answer?: AgentAnswerContract;
}

export interface AgentSessionLane {
  sessionId: string;
  receivedSeq: number;
  eventSeq: number;
  running: { requestId: string; workerId: string; leaseUntil: string } | null;
  queue: string[];
}

export class AgentEntryError extends Error {
  constructor(readonly code: "REQUEST_ID_REUSED" | "REQUEST_NOT_FOUND" | "REQUEST_NOT_WAITING" | "CLARIFICATION_NOT_FOUND" | "CLARIFICATION_CLOSED" | "OPTION_NOT_OFFERED") {
    super(code);
  }
}

export interface AgentEntryOutcome {
  /** waiting_user (AG03): the round is delivered and the lane moves on; a part waits for the user. */
  status: "completed" | "failed" | "waiting_user";
  answer: AgentAnswerContract | null;
  partResults: readonly AgentPartResult[];
  ending?: AgentRequestEndingContract;
  /** AG02: the card this round produced (or the one it showed). */
  actionPreview?: AgentActionPreviewContract;
  /** AG04: the round's clickable directions. */
  clarifications?: readonly AgentClarificationContract[];
}

export interface AgentEntryStore {
  accept(input: { actorId: string; sessionId: string; requestId: string; clientMessageId: string; fingerprint: string; input: AgentEntryInput; now: string; workerId: string; leaseMs: number }): Promise<{ record: AgentEntryRequestRecord; replayed: boolean; claimed: boolean }>;
  /** Claims the session's next request (or takes over one whose lease ran out). Null when one is running or none is waiting. */
  claimNext(input: { actorId: string; sessionId: string; now: string; workerId: string; leaseMs: number }): Promise<{ record: AgentEntryRequestRecord; takeover: boolean } | null>;
  /** Extends the lease while this worker still owns the running request; returns the request's current status. */
  renewLease(input: { actorId: string; requestId: string; workerId: string; now: string; leaseMs: number }): Promise<{ status: AgentRequestStatus | null; owned: boolean }>;
  /** Writes the outcome only if the request is still running under this worker; a late result is not delivered. */
  finish(input: { actorId: string; requestId: string; workerId: string; now: string; outcome: AgentEntryOutcome }): Promise<{ delivered: boolean; record: AgentEntryRequestRecord | null }>;
  /** Stops a queued or running request. A request that already ended is returned unchanged. */
  cancel(input: { actorId: string; requestId: string; now: string }): Promise<{ changed: boolean; record: AgentEntryRequestRecord } | null>;
  /**
   * AG04: a click under a set of directions. Checked against the options offered then (attributeSelection),
   * stored on the request and queued in the session's order; it resumes that request and makes no new one.
   */
  acceptSelection(input: { actorId: string; sessionId: string; requestId: string; clientSelectionId: string; clarificationId: string; optionId: string; now: string; workerId: string; leaseMs: number }): Promise<{ record: AgentEntryRequestRecord; replayed: boolean; claimed: boolean }>;
  /** AG04: writes back an earlier request that a later message answered or shelved (only while it is not running). */
  amend(input: { actorId: string; requestId: string; now: string; amendment: AgentEntryAmendment }): Promise<AgentEntryRequestRecord | null>;
  /** AG07: a progress event (status running with a stage) while this worker still runs the request; no document change. */
  markStage?(input: { actorId: string; sessionId: string; requestId: string; workerId: string; stage: AgentRunStage; now: string }): Promise<boolean>;
  get(actorId: string, requestId: string): Promise<AgentEntryRequestRecord | null>;
  lane(actorId: string, sessionId: string): Promise<AgentSessionLane | null>;
  listEvents(actorId: string, sessionId: string, afterSeq: number, limit: number): Promise<AgentSessionEventContract[]>;
}

/** The requestId of a message: one per (account, session, client message key). */
/**
 * AG04: a resumed request keeps what it delivered before and the continuation follows it. AG07 repair 2 (AE-XL-003):
 * the joined answer keeps the basis line of the read it still carries (the continuation's own, when it wrote one)
 * and the continuation's card line.
 */
export function resumedAnswer(previous: AgentAnswerContract, next: AgentAnswerContract | null): AgentAnswerContract {
  if (!next) return previous;
  const basis = next.basis ?? previous.basis;
  // AG09: what was sent and opened before the pause stays next to the joined answer, with the continuation's own after it.
  const queries = [...(previous.web?.queries ?? []), ...(next.web?.queries ?? [])].filter((query, index, all) => all.findIndex((other) => other.text === query.text) === index);
  const pages = [...(previous.web?.pages ?? []), ...(next.web?.pages ?? [])].filter((page, index, all) => all.findIndex((other) => other.sourceRef === page.sourceRef) === index);
  // AG19: the joined answer's blocks, in the same order as its text.
  const blocks = joinBlocks(previous, next, languageOfText(`${previous.text}\n${next.text}`));
  // AG14 UI: the memory chips of both, each entry once.
  const memoryUse = [...(previous.memoryUse ?? []), ...(next.memoryUse ?? [])].filter((item, index, all) => all.findIndex((other) => other.memoryId === item.memoryId && other.kind === item.kind) === index);
  return {
    ...(memoryUse.length ? { memoryUse } : {}),
    sourceRefs: [...new Set([...previous.sourceRefs, ...next.sourceRefs])],
    text: [previous.text, next.text].filter((text) => text.trim()).join("\n\n"),
    ...(basis ? { basis } : {}),
    ...(blocks?.length ? { blocks } : {}),
    ...(next.cardLine ? { cardLine: next.cardLine } : {}),
    ...(queries.length || pages.length ? { web: { pages, queries } } : {}),
  };
}

export function agentRequestIdFor(actorId: string, sessionId: string, clientMessageId: string): string {
  return `agreq_${createHash("sha256").update(JSON.stringify(["agent-v1-request", actorId, sessionId, clientMessageId])).digest("hex").slice(0, 32)}`;
}

export function agentEntryFingerprint(sessionId: string, clientMessageId: string, input: AgentEntryInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      clientMessageId,
      locale: input.locale,
      message: input.message,
      origin: input.origin ?? null,
      pageContext: input.pageContext ?? null,
      protocolVersion: 3,
      references: [...input.references].map(({ id, type }) => `${type}\u0000${id}`).sort(),
      sessionId,
    }))
    .digest("hex");
}

/* ── the operations, written once over a locked unit of work ───────────────── */

interface LaneUnit {
  getRequest(requestId: string): Promise<AgentEntryRequestRecord | null>;
  putRequest(record: AgentEntryRequestRecord): Promise<void>;
  getLane(): Promise<AgentSessionLane>;
  putLane(lane: AgentSessionLane): Promise<void>;
  addEvent(event: AgentSessionEventContract): Promise<void>;
}

type WithLane = <T>(actorId: string, sessionId: string, operation: (unit: LaneUnit) => Promise<T>) => Promise<T>;

function emptyLane(sessionId: string): AgentSessionLane {
  return { eventSeq: 0, queue: [], receivedSeq: 0, running: null, sessionId };
}

function nextDocument(record: AgentEntryRequestRecord, now: string, patch: Partial<AgentResultDocument>): AgentResultDocument {
  return { ...record.document, ...patch, revision: record.document.revision + 1, updatedAt: now };
}

async function pushEvent(unit: LaneUnit, lane: AgentSessionLane, record: AgentEntryRequestRecord, kind: AgentSessionEventKind, now: string): Promise<void> {
  lane.eventSeq += 1;
  await unit.addEvent({
    at: now,
    kind,
    requestId: record.requestId,
    seq: lane.eventSeq,
    sessionId: record.sessionId,
    status: record.status,
    ...(kind === "document" ? { document: record.document } : {}),
  });
}

function leaseUntil(now: string, leaseMs: number): string {
  return new Date(Date.parse(now) + leaseMs).toISOString();
}

function startRunning(record: AgentEntryRequestRecord, lane: AgentSessionLane, workerId: string, now: string, leaseMs: number): void {
  record.status = "running";
  record.startedAt = now;
  record.attempts = 1;
  record.workerId = workerId;
  record.document = nextDocument(record, now, { status: "running" });
  lane.running = { leaseUntil: leaseUntil(now, leaseMs), requestId: record.requestId, workerId };
}

function createOperations(withLane: WithLane, read: (actorId: string, requestId: string) => Promise<AgentEntryRequestRecord | null>): Omit<AgentEntryStore, "get" | "lane" | "listEvents"> {
  return {
    markStage: (input) => withLane(input.actorId, input.sessionId, async (unit) => {
      const record = await unit.getRequest(input.requestId);
      if (!record || record.status !== "running" || record.workerId !== input.workerId) return false;
      const lane = await unit.getLane();
      lane.eventSeq += 1;
      await unit.addEvent({ at: input.now, kind: "status", requestId: record.requestId, seq: lane.eventSeq, sessionId: record.sessionId, stage: input.stage, status: record.status });
      await unit.putLane(lane);
      return true;
    }),
    accept: (input) => withLane(input.actorId, input.sessionId, async (unit) => {
      const existing = await unit.getRequest(input.requestId);
      if (existing) {
        if (existing.fingerprint !== input.fingerprint || existing.sessionId !== input.sessionId) throw new AgentEntryError("REQUEST_ID_REUSED");
        return { claimed: false, record: existing, replayed: true };
      }
      const lane = await unit.getLane();
      lane.receivedSeq += 1;
      const record: AgentEntryRequestRecord = {
        arrivedWhileRunning: lane.running !== null,
        attempts: 0,
        clientMessageId: input.clientMessageId,
        document: { answer: null, partResults: [], requestId: input.requestId, revision: 1, schemaVersion: 1, sessionId: input.sessionId, status: "queued", updatedAt: input.now },
        endedAt: null,
        fingerprint: input.fingerprint,
        input: input.input,
        protocolVersion: 3,
        queueAheadAtArrival: lane.queue.length + (lane.running ? 1 : 0),
        receivedAt: input.now,
        receivedSeq: lane.receivedSeq,
        requestId: input.requestId,
        sessionId: input.sessionId,
        startedAt: null,
        status: "queued",
        workerId: null,
      };
      await pushEvent(unit, lane, record, "accepted", input.now);
      let claimed = false;
      if (!lane.running && lane.queue.length === 0) {
        startRunning(record, lane, input.workerId, input.now, input.leaseMs);
        await pushEvent(unit, lane, record, "status", input.now);
        claimed = true;
      } else {
        lane.queue.push(record.requestId);
      }
      await unit.putRequest(record);
      await unit.putLane(lane);
      return { claimed, record, replayed: false };
    }),

    claimNext: (input) => withLane(input.actorId, input.sessionId, async (unit) => {
      const lane = await unit.getLane();
      if (lane.running) {
        if (Date.parse(lane.running.leaseUntil) > Date.parse(input.now)) return null;
        const stale = await unit.getRequest(lane.running.requestId);
        if (stale && stale.status === "running") {
          stale.attempts += 1;
          stale.workerId = input.workerId;
          lane.running = { leaseUntil: leaseUntil(input.now, input.leaseMs), requestId: stale.requestId, workerId: input.workerId };
          await unit.putRequest(stale);
          await unit.putLane(lane);
          return { record: stale, takeover: true };
        }
        lane.running = null;
      }
      while (lane.queue.length) {
        const requestId = lane.queue.shift()!;
        const record = await unit.getRequest(requestId);
        if (!record || record.status !== "queued") continue;
        startRunning(record, lane, input.workerId, input.now, input.leaseMs);
        await pushEvent(unit, lane, record, "status", input.now);
        await unit.putRequest(record);
        await unit.putLane(lane);
        return { record, takeover: false };
      }
      await unit.putLane(lane);
      return null;
    }),

    renewLease: async (input) => {
      const known = await read(input.actorId, input.requestId);
      if (!known) return { owned: false, status: null };
      return withLane(input.actorId, known.sessionId, async (unit) => {
        const record = await unit.getRequest(input.requestId);
        const lane = await unit.getLane();
        const owned = record?.status === "running" && lane.running?.requestId === input.requestId && lane.running.workerId === input.workerId;
        if (owned) {
          lane.running = { ...lane.running!, leaseUntil: leaseUntil(input.now, input.leaseMs) };
          await unit.putLane(lane);
        }
        return { owned, status: record?.status ?? null };
      });
    },

    finish: async (input) => {
      const known = await read(input.actorId, input.requestId);
      if (!known) return { delivered: false, record: null };
      return withLane(input.actorId, known.sessionId, async (unit) => {
        const record = await unit.getRequest(input.requestId);
        const lane = await unit.getLane();
        if (!record || record.status !== "running" || lane.running?.requestId !== input.requestId || lane.running.workerId !== input.workerId) {
          return { delivered: false, record };
        }
        record.status = input.outcome.status;
        record.endedAt = input.now;
        // AG04: a resumed request keeps what it delivered before; the continuation follows it.
        const resumed = Boolean(record.pendingResume);
        const previous = record.document.answer;
        const answer = resumed && previous ? resumedAnswer(previous, input.outcome.answer) : input.outcome.answer;
        record.pendingResume = null;
        record.document = nextDocument(record, input.now, {
          answer,
          partResults: input.outcome.partResults,
          status: input.outcome.status,
          ...(input.outcome.ending ? { ending: input.outcome.ending } : {}),
          ...(input.outcome.actionPreview ? { actionPreview: input.outcome.actionPreview } : {}),
          ...(input.outcome.clarifications ? { clarifications: input.outcome.clarifications } : {}),
        });
        lane.running = null;
        await pushEvent(unit, lane, record, "document", input.now);
        await unit.putRequest(record);
        await unit.putLane(lane);
        return { delivered: true, record };
      });
    },

    acceptSelection: (input) => withLane(input.actorId, input.sessionId, async (unit) => {
      const record = await unit.getRequest(input.requestId);
      if (!record || record.sessionId !== input.sessionId) throw new AgentEntryError("REQUEST_NOT_FOUND");
      const earlier = (record.selections ?? []).find((item) => item.clientSelectionId === input.clientSelectionId);
      if (earlier) {
        if (earlier.clarificationId !== input.clarificationId || earlier.optionId !== input.optionId) throw new AgentEntryError("REQUEST_ID_REUSED");
        return { claimed: false, record, replayed: true };
      }
      const check = attributeSelection(record.document.clarifications, { clarificationId: input.clarificationId, optionId: input.optionId });
      if (check.ok === false) throw new AgentEntryError(check.reason);
      if (record.status !== "waiting_user" && record.status !== "completed") throw new AgentEntryError("REQUEST_NOT_WAITING");
      const lane = await unit.getLane();
      // The set is answered now, so a second click (on any option) is refused; the click itself waits its turn.
      const clarifications = (record.document.clarifications ?? []).map((item) => (item.clarificationId === input.clarificationId ? { ...item, selectedOptionId: input.optionId, state: "answered" as const } : item));
      record.selections = [...(record.selections ?? []), { at: input.now, clarificationId: input.clarificationId, clientSelectionId: input.clientSelectionId, optionId: input.optionId }];
      record.pendingResume = { clarificationId: input.clarificationId, clientSelectionId: input.clientSelectionId, kind: "select", optionId: input.optionId };
      record.status = "queued";
      record.document = nextDocument(record, input.now, { clarifications, status: "queued" });
      await pushEvent(unit, lane, record, "status", input.now);
      let claimed = false;
      if (!lane.running && lane.queue.length === 0) {
        startRunning(record, lane, input.workerId, input.now, input.leaseMs);
        await pushEvent(unit, lane, record, "status", input.now);
        claimed = true;
      } else if (!lane.queue.includes(record.requestId)) {
        lane.queue.push(record.requestId);
      }
      await unit.putRequest(record);
      await unit.putLane(lane);
      return { claimed, record, replayed: false };
    }),

    amend: async (input) => {
      const known = await read(input.actorId, input.requestId);
      if (!known) return null;
      return withLane(input.actorId, known.sessionId, async (unit) => {
        const record = await unit.getRequest(input.requestId);
        // Only a delivered request is written back; one queued or running writes its own result.
        if (!record || (record.status !== "waiting_user" && record.status !== "completed")) return record;
        const lane = await unit.getLane();
        record.status = input.amendment.status;
        record.document = nextDocument(record, input.now, { clarifications: input.amendment.clarifications, partResults: input.amendment.partResults, status: input.amendment.status, ...(input.amendment.actionPreview ? { actionPreview: input.amendment.actionPreview } : {}), ...(input.amendment.answer ? { answer: input.amendment.answer } : {}) });
        await pushEvent(unit, lane, record, "document", input.now);
        await unit.putRequest(record);
        await unit.putLane(lane);
        return record;
      });
    },

    cancel: async (input) => {
      const known = await read(input.actorId, input.requestId);
      if (!known) return null;
      return withLane(input.actorId, known.sessionId, async (unit) => {
        const record = (await unit.getRequest(input.requestId))!;
        if (FINAL_STATUSES.has(record.status)) return { changed: false, record };
        const lane = await unit.getLane();
        // Only this request ends: what it already delivered stays, the queue behind it is untouched.
        record.status = "cancelled";
        record.endedAt = input.now;
        record.document = nextDocument(record, input.now, { ending: { at: input.now, kind: "stopped_by_user" }, status: "cancelled" });
        if (lane.running?.requestId === record.requestId) lane.running = null;
        lane.queue = lane.queue.filter((id) => id !== record.requestId);
        await pushEvent(unit, lane, record, "document", input.now);
        await unit.putRequest(record);
        await unit.putLane(lane);
        return { changed: true, record };
      });
    },
  };
}

/* ── in-memory store (mock mode and unit tests) ───────────────────────────── */

export function createMemoryAgentEntryStore(): AgentEntryStore {
  const requests = new Map<string, AgentEntryRequestRecord>();
  const lanes = new Map<string, AgentSessionLane>();
  const events = new Map<string, AgentSessionEventContract[]>();
  const locks = new Map<string, Promise<unknown>>();
  const clone = <T>(value: T): T => structuredClone(value);
  const key = (actorId: string, id: string) => `${actorId}\u0000${id}`;

  const withLane: WithLane = async (actorId, sessionId, operation) => {
    const lockKey = key(actorId, sessionId);
    const previous = locks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chained = previous.then(() => current);
    locks.set(lockKey, chained);
    await previous;
    try {
      return await operation({
        addEvent: async (event) => { events.set(lockKey, [...(events.get(lockKey) ?? []), clone(event)]); },
        getLane: async () => clone(lanes.get(lockKey) ?? emptyLane(sessionId)),
        getRequest: async (requestId) => clone(requests.get(key(actorId, requestId)) ?? null),
        putLane: async (lane) => { lanes.set(lockKey, clone(lane)); },
        putRequest: async (record) => { requests.set(key(actorId, record.requestId), clone(record)); },
      });
    } finally {
      release();
      if (locks.get(lockKey) === chained) locks.delete(lockKey);
    }
  };
  const read = async (actorId: string, requestId: string) => clone(requests.get(key(actorId, requestId)) ?? null);
  return {
    ...createOperations(withLane, read),
    get: read,
    lane: async (actorId, sessionId) => clone(lanes.get(key(actorId, sessionId)) ?? null),
    listEvents: async (actorId, sessionId, afterSeq, limit) => (events.get(key(actorId, sessionId)) ?? []).filter((event) => event.seq > afterSeq).slice(0, limit).map(clone),
  };
}

/* ── Postgres store ───────────────────────────────────────────────────────── */

function laneRecordId(actorId: string, sessionId: string): string {
  return createHash("sha256").update(JSON.stringify(["agent-v1-lane", actorId, sessionId])).digest("hex");
}

function eventRecordId(actorId: string, sessionId: string, seq: number): string {
  return createHash("sha256").update(JSON.stringify(["agent-v1-event", actorId, sessionId, seq])).digest("hex");
}

export function createPostgresAgentEntryStore(input: { client: TransactionalPostgresClient; workspaceId: string }): AgentEntryStore {
  const { client, workspaceId } = input;

  async function readRequest(store: LiveRecordStoreLike<Record<string, unknown>>, actorId: string, requestId: string): Promise<AgentEntryRequestRecord | null> {
    const record = await store.getRecord({ collectionName: REQUEST_COLLECTION, includeDeleted: true, recordId: requestRecordId(actorId, requestId), workspaceId });
    // A protocol-2 record under the same id is not a protocol-3 request (accept refuses the id).
    if (!record || record.userId !== actorId || (record.payload as { protocolVersion?: unknown }).protocolVersion !== 3) return null;
    return record.payload as unknown as AgentEntryRequestRecord;
  }

  const withLane: WithLane = async (actorId, sessionId, operation) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await client.transaction(async (transaction) => {
          await transaction.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [JSON.stringify(["orbit-agent-v1", "session", workspaceId, actorId, sessionId])]);
          const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: transaction });
          const laneId = laneRecordId(actorId, sessionId);
          let laneCreatedAt: string | null = null;
          const createdAtByRequest = new Map<string, string>();
          const base = (recordId: string, at: string) => ({
            evidenceIds: [],
            lifecycleState: "active" as const,
            recordId,
            searchText: "",
            sourceType: "manual" as const,
            updatedAt: at,
            userId: actorId,
            workspaceId,
          });
          return operation({
            addEvent: async (event) => {
              const recordId = eventRecordId(actorId, sessionId, event.seq);
              await store.upsertRecord({ ...base(recordId, event.at), collectionName: EVENT_COLLECTION, createdAt: event.at, payload: event as unknown as Record<string, unknown>, sourceId: `agent-v1-event:${recordId}`, targetId: sessionId, targetType: SESSION_TARGET_TYPE });
            },
            getLane: async () => {
              const record = await store.getRecord({ collectionName: LANE_COLLECTION, includeDeleted: true, recordId: laneId, workspaceId });
              if (!record || record.userId !== actorId) return emptyLane(sessionId);
              laneCreatedAt = record.createdAt;
              return record.payload as unknown as AgentSessionLane;
            },
            getRequest: async (requestId) => {
              const record = await store.getRecord({ collectionName: REQUEST_COLLECTION, includeDeleted: true, recordId: requestRecordId(actorId, requestId), workspaceId });
              if (!record || record.userId !== actorId) return null;
              if ((record.payload as { protocolVersion?: unknown }).protocolVersion !== 3) throw new AgentEntryError("REQUEST_ID_REUSED");
              createdAtByRequest.set(requestId, record.createdAt);
              return record.payload as unknown as AgentEntryRequestRecord;
            },
            putLane: async (lane) => {
              const at = new Date().toISOString();
              await store.upsertRecord({ ...base(laneId, at), collectionName: LANE_COLLECTION, createdAt: laneCreatedAt ?? at, payload: lane as unknown as Record<string, unknown>, sourceId: `agent-v1-lane:${laneId}`, targetId: sessionId, targetType: SESSION_TARGET_TYPE });
            },
            putRequest: async (record) => {
              const recordId = requestRecordId(actorId, record.requestId);
              await store.upsertRecord({ ...base(recordId, record.document.updatedAt), collectionName: REQUEST_COLLECTION, createdAt: createdAtByRequest.get(record.requestId) ?? record.receivedAt, payload: record as unknown as Record<string, unknown>, sourceId: `orbit-agent-request:${recordId}`, targetId: sessionId, targetType: SESSION_TARGET_TYPE });
            },
          });
          // Every writer of a session takes the session lock first; read committed lets the
          // statements after the lock see what the previous holder committed (as sprint 0109's sends).
        }, { isolation: "read committed" });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
        if ((code === "40001" || code === "40P01") && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Agent entry transaction retry exhausted");
  };

  const read = (actorId: string, requestId: string) => readRequest(createPostgresLiveRecordStore<Record<string, unknown>>({ client }), actorId, requestId);

  return {
    ...createOperations(withLane, read),
    get: read,
    async lane(actorId, sessionId) {
      const record = await createPostgresLiveRecordStore<Record<string, unknown>>({ client }).getRecord({ collectionName: LANE_COLLECTION, includeDeleted: true, recordId: laneRecordId(actorId, sessionId), workspaceId });
      return record && record.userId === actorId ? (record.payload as unknown as AgentSessionLane) : null;
    },
    async listEvents(actorId, sessionId, afterSeq, limit) {
      const result = await client.query(
        `select payload from orbit_records
          where workspace_id = $1 and collection_name = $2 and user_id = $3 and target_type = $4 and target_id = $5
            and lifecycle_state <> 'deleted' and (payload ->> 'seq')::bigint > $6
          order by (payload ->> 'seq')::bigint asc
          limit $7`,
        [workspaceId, EVENT_COLLECTION, actorId, SESSION_TARGET_TYPE, sessionId, afterSeq, limit],
      );
      return (result.rows as { payload: unknown }[]).map((row) => (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as AgentSessionEventContract);
    },
  };
}
