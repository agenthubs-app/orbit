import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { aiSessionOriginSchema } from "../../../shared/api-schema/ai-sessions";
import {
  AI_SESSION_MESSAGE_PAGE_DEFAULT_LIMIT,
  AI_SESSION_MESSAGE_PAGE_MAX_LIMIT,
} from "../../../shared/api-schema/ai-session-page";
import type { AiSessionEntryPointId, AiSessionOriginContract, AiSessionReferenceContract, StoredAiSessionOriginContract } from "../../../shared/contract/ai-sessions";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { AiSessionMessagePageContract, AiSessionSummaryPageContract } from "../../../shared/contract/ai-session-page";
import type { AiSessionOrganizationContract } from "../../../shared/contract/ai-sessions";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../shared/storage/live-database-config";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../../shared/storage/live-record-store";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalPostgresClient,
  type TransactionalSqlExecutor,
} from "../../../shared/storage/transactional-postgres";
import {
  createOrbitAgentChatSessionSummaryPageReader,
  pageOrbitAgentChatSessionSummaryCandidates,
  type OrbitAgentChatSessionSummaryQuery,
} from "./orbit-agent-chat-session-summary-page";

export const ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS = {
  messages: "orbit_agent_chat_messages",
  sessions: "orbit_agent_chat_sessions",
} as const;

/**
 * Sprint 0112: how many of the latest messages a reliable send hands the model
 * as conversation history. It matches the cap the route already applies to
 * client-supplied history; the planner and synthesis use the last 8 of them.
 */
export const ORBIT_AGENT_CHAT_HISTORY_WINDOW = 12;

export type OrbitAgentChatSessionMessageRole = "assistant" | "user";

export interface OrbitAgentChatSessionMessage
  extends Record<string, unknown> {
  id?: string;
  references?: readonly AiSessionReferenceContract[];
  role: OrbitAgentChatSessionMessageRole;
  text: string;
}

export class OrbitAgentChatSessionWriteError extends Error {
  constructor(
    readonly code:
      | "SESSION_DELETED"
      | "SESSION_MESSAGE_REFERENCES_IMMUTABLE"
      | "SESSION_NOT_FOUND"
      | "SESSION_ORIGIN_IMMUTABLE"
      | "SESSION_SNAPSHOT_STALE",
  ) {
    super(
      code === "SESSION_DELETED"
        ? "Deleted session cannot be restored by a late save"
        : code === "SESSION_MESSAGE_REFERENCES_IMMUTABLE"
          ? "Saved message references are immutable"
        : code === "SESSION_NOT_FOUND"
          ? "Session does not exist"
        : code === "SESSION_ORIGIN_IMMUTABLE"
          ? "Session origin is immutable after the first saved message"
        : "Stale session snapshot cannot replace newer history",
    );
  }
}

/** A page cursor that is malformed, forged, or issued for another session or account. */
export class OrbitAgentChatSessionCursorError extends Error {
  constructor() {
    super("SESSION_MESSAGE_CURSOR_INVALID");
  }
}

export interface OrbitAgentChatSessionSnapshot {
  createdAt: string;
  customTitle?: string;
  id: string;
  /** Messages stored for the session (server reads only; clients never set it). */
  messageCount?: number;
  messageRevision?: number;
  /**
   * On reads, the latest page of messages (oldest first), not the whole
   * session. On writes, the messages to add or update, merged by message id.
   */
  messages: readonly OrbitAgentChatSessionMessage[];
  organization?: {
    customTitle: string | null;
    groupId: string | null;
    pinned: boolean;
    revision: number;
  };
  origin?: StoredAiSessionOriginContract | undefined;
  panel?: Record<string, unknown> | null;
  pinned?: boolean;
  title: string;
  updatedAt: string;
}

export type OrbitAgentChatSessionHeader = Omit<OrbitAgentChatSessionSnapshot, "messages"> & {
  messageCount: number;
  messageRevision: number;
};

export interface OrbitAgentChatSessionPage {
  page: AiSessionMessagePageContract;
  /** The message just before the page, used to validate a turn split by the page edge. Never sent to clients. */
  precedingMessage: OrbitAgentChatSessionMessage | null;
  session: OrbitAgentChatSessionSnapshot;
}

type TrustedOriginVerification = NonNullable<AiSessionOriginContract["verification"]>;

export interface OrbitAgentChatSessionAppendInput {
  /** Used only when the session does not exist yet. */
  create?: {
    createdAt: string;
    origin?: StoredAiSessionOriginContract | undefined;
    title: string;
  };
  /** Each message needs an id; a message whose id is already stored is left as it is. */
  messages: readonly (OrbitAgentChatSessionMessage & { id: string })[];
  updatedAt: string;
  /** Server-trusted contacts-analysis marker, applied only to a verified first answer. */
  verification?: TrustedOriginVerification | undefined;
}

export interface OrbitAgentChatSessionProvider {
  source: string;
  sourceLabel: string;
  /** Appends messages at the end of the session without reading or rewriting earlier ones. */
  appendMessages: (
    sessionId: string,
    input: OrbitAgentChatSessionAppendInput,
  ) => Promise<OrbitAgentChatSessionHeader>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  /** The session with its latest page of messages (default 20). */
  getSession: (
    sessionId: string,
    options?: { limit?: number },
  ) => Promise<OrbitAgentChatSessionSnapshot | null>;
  getSessionHeader: (sessionId: string) => Promise<OrbitAgentChatSessionHeader | null>;
  getSessionPage: (
    sessionId: string,
    options?: { cursor?: string | null; limit?: number },
  ) => Promise<OrbitAgentChatSessionPage | null>;
  listSessionSummariesPage: (
    query: OrbitAgentChatSessionSummaryQuery,
    listOrganizations?: (sessionIds: readonly string[]) => Promise<ReadonlyMap<string, AiSessionOrganizationContract>>,
  ) => Promise<AiSessionSummaryPageContract>;
  /** The most recently updated sessions from one entry point, each with its first two messages only. */
  listSessionsByEntryPoint: (entryPointId: AiSessionEntryPointId) => Promise<
    readonly OrbitAgentChatSessionSnapshot[]
  >;
  /**
   * Client save (whole or partial snapshot). Messages are merged by id: a known
   * id updates that message in place, a new one is appended, and messages the
   * client did not send are never deleted or moved. Returns the header with the
   * messages as saved, in the order sent.
   */
  upsertSession: (
    session: OrbitAgentChatSessionSnapshot,
  ) => Promise<OrbitAgentChatSessionSnapshot>;
}

export interface StorageOrbitAgentChatSessionProviderOptions {
  actorId: string;
  source?: string;
  sourceLabel?: string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  /** SQL read client (Postgres). Pages messages and summaries by index; without it the provider is in-process only. */
  summaryPageClient?: LiveRecordSqlClient;
  summaryPageSecret?: string;
  /** Postgres transactions for writes; without it writes to one session are serialized in process. */
  transactionClient?: TransactionalPostgresClient;
}

export interface ConfiguredStorageOrbitAgentChatSessionProviderOptions {
  actorId: string;
  env?: LiveDatabaseEnv;
  sourceLabel?: string;
}

const MAX_MESSAGE_TEXT_LENGTH = 12000;
const MAX_SESSION_TITLE_LENGTH = 120;
/** Session search text stays bounded: its head (identity, title, first question) and its newest text. */
const SEARCH_TEXT_MAX_LENGTH = 8000;
const SEARCH_TEXT_HEAD_LENGTH = 2000;
/** An old client's whole-session save is merged over its newest messages only. */
const MERGE_WINDOW = 200;
const DELETE_BATCH = 200;
const ENTRY_POINT_SESSION_LIMIT = 50;
/**
 * In-process stores (mock mode, unit tests) cannot order or page in storage.
 * They scan at most this many rows and fail visibly beyond it.
 */
const IN_PROCESS_SCAN_LIMIT = 5000;
const MOCK_CURSOR_SECRET = "orbit-mock-session-message-cursor-secret-32-bytes";
const cachedDefaultProviders = new Map<
  string,
  OrbitAgentChatSessionProvider
>();

/** Message order column: payload.index, indexed by orbit_records_agent_chat_message_order_idx. */
export const ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL =
  "(case when jsonb_typeof(payload->'index')='number' then (payload->>'index')::numeric end)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function safeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

export function orbitAgentChatSessionActorWorkspaceId(
  workspaceId: string,
  actorId: string,
): string {
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) {
    throw new Error("Orbit Agent chat sessions require an authenticated actor");
  }

  return `${workspaceId}:actor:${encodeURIComponent(normalizedActorId)}`;
}

function validTimestamp(value: string): string {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function normalizeMessage(
  value: unknown,
): OrbitAgentChatSessionMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.role !== "user" && value.role !== "assistant") {
    return null;
  }

  const text = cleanString(value.text, MAX_MESSAGE_TEXT_LENGTH);
  if (!text) {
    return null;
  }

  const references: AiSessionReferenceContract[] = Array.isArray(value.references)
    ? value.references.flatMap((reference) => isRecord(reference)
      && (reference.type === "contact" || reference.type === "event" || reference.type === "note")
      && nonEmptyString(reference.id)
        ? [{ id: reference.id.trim().slice(0, 160), type: reference.type as AiSessionReferenceContract["type"] }]
        : []).slice(0, 20)
    : [];
  return {
    ...cloneJson(value),
    ...(references.length ? { references } : {}),
    role: value.role,
    text,
  };
}

export function normalizeOrbitAgentChatSessionSnapshot(
  value: unknown,
): OrbitAgentChatSessionSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = cleanString(value.id, 160);
  const createdAt = nonEmptyString(value.createdAt)
    ? validTimestamp(value.createdAt)
    : "";
  const title = cleanString(value.title, MAX_SESSION_TITLE_LENGTH);
  const customTitle = cleanString(value.customTitle, MAX_SESSION_TITLE_LENGTH);
  const updatedAt = nonEmptyString(value.updatedAt)
    ? validTimestamp(value.updatedAt)
    : "";
  const messages = Array.isArray(value.messages)
    ? value.messages.flatMap((message) => {
        const normalized = normalizeMessage(message);

        return normalized ? [normalized] : [];
      })
    : [];
  const messageRevision =
    typeof value.messageRevision === "number" &&
    Number.isSafeInteger(value.messageRevision) &&
    value.messageRevision >= messages.length
      ? value.messageRevision
      : messages.length;
  const parsedOrigin = aiSessionOriginSchema.safeParse(value.origin);

  if (!id || !title || !updatedAt || messages.length === 0) {
    return null;
  }

  return {
    createdAt: createdAt || updatedAt,
    customTitle: customTitle || undefined,
    id,
    messageRevision,
    messages,
    origin: parsedOrigin.success ? cloneJson(parsedOrigin.data) : undefined,
    panel: isRecord(value.panel) ? cloneJson(value.panel) : null,
    pinned: value.pinned === true,
    title,
    updatedAt,
  };
}

/**
 * Row key of a message. Messages saved without an id (the oldest clients) are
 * keyed by their position; reads expose them as `legacy-index:<position>`, which
 * maps back to the same row.
 */
function messageRecordId(sessionId: string, identity: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([sessionId, identity]))
    .digest("hex");
  return `${safeIdPart(sessionId)}:${digest}`;
}

function sourceIdFor(kind: "message" | "session", id: string): string {
  return `source:orbit-agent-chat:${kind}:${id}`;
}

function evidenceIdFor(kind: "message" | "session", id: string): string {
  return `evidence:orbit-agent-chat:${kind}:${id}`;
}

function originToken(origin: StoredAiSessionOriginContract | null | undefined): string | null {
  return origin && origin.entryClient !== "unknown"
    ? `orbit-origin-entry-point:${origin.entryPointId}`
    : null;
}

function boundedSearchText(value: string): string {
  if (value.length <= SEARCH_TEXT_MAX_LENGTH) return value;
  return `${value.slice(0, SEARCH_TEXT_HEAD_LENGTH)} ${value.slice(-(SEARCH_TEXT_MAX_LENGTH - SEARCH_TEXT_HEAD_LENGTH - 1))}`;
}

function legacyOrigin(): StoredAiSessionOriginContract {
  return {
    entryClient: "unknown",
    entryPointId: "legacy.unknown",
    firstSentText: null,
    firstUserMessageId: null,
    initialGroupId: null,
    kind: "legacy_unknown",
    recordedAt: null,
    references: [],
    schemaVersion: 1,
    template: null,
  };
}

function storedOrigin(value: unknown): StoredAiSessionOriginContract | undefined {
  const parsed = aiSessionOriginSchema.safeParse(value);
  return parsed.success ? cloneJson(parsed.data) : undefined;
}

function headerFromRecord(record: LiveRecord<Record<string, unknown>>): OrbitAgentChatSessionHeader | null {
  const payload = record.payload;
  const id = nonEmptyString(payload.id) ? payload.id : record.recordId;
  const title = cleanString(payload.title, MAX_SESSION_TITLE_LENGTH);
  const updatedAt = nonEmptyString(payload.updatedAt) ? validTimestamp(payload.updatedAt) : record.updatedAt;
  if (!id || !title || !updatedAt) return null;
  const messageCount = typeof payload.messageCount === "number" && Number.isSafeInteger(payload.messageCount) && payload.messageCount >= 0
    ? payload.messageCount : 0;
  const messageRevision = typeof payload.messageRevision === "number" && Number.isSafeInteger(payload.messageRevision) && payload.messageRevision >= messageCount
    ? payload.messageRevision : messageCount;
  const customTitle = cleanString(payload.customTitle, MAX_SESSION_TITLE_LENGTH);
  return {
    createdAt: nonEmptyString(payload.createdAt) ? validTimestamp(payload.createdAt) : record.createdAt,
    customTitle: customTitle || undefined,
    id,
    messageCount,
    messageRevision,
    origin: storedOrigin(payload.origin) ?? legacyOrigin(),
    panel: isRecord(payload.panel) ? cloneJson(payload.panel) : null,
    pinned: payload.pinned === true,
    title,
    updatedAt,
  };
}

/** Next free position: explicit since 0112; before it, positions were 0..messageCount-1. */
function nextIndexOf(record: LiveRecord<Record<string, unknown>>): number {
  const payload = record.payload;
  if (typeof payload.nextMessageIndex === "number" && Number.isSafeInteger(payload.nextMessageIndex) && payload.nextMessageIndex >= 0) {
    return payload.nextMessageIndex;
  }
  return typeof payload.messageCount === "number" && Number.isSafeInteger(payload.messageCount) && payload.messageCount >= 0
    ? payload.messageCount : 0;
}

function messagePosition(record: { payload: Record<string, unknown> }): number | null {
  return typeof record.payload.index === "number" && Number.isFinite(record.payload.index) ? record.payload.index : null;
}

function messageFromRow(row: { payload: Record<string, unknown> }): OrbitAgentChatSessionMessage | null {
  const { index, sessionId: _sessionId, ...message } = row.payload;
  const normalized = normalizeMessage(message);
  if (!normalized) return null;
  return normalized.id || typeof index !== "number"
    ? normalized
    : { ...normalized, id: `legacy-index:${index}` };
}

interface MessageRow { recordId: string; payload: Record<string, unknown> }
interface Position { index: number; recordId: string }

/**
 * Ordered, bounded message reads. Postgres orders by the indexed position; an
 * in-process store scans a bounded number of rows and sorts them.
 */
interface MessageWindow {
  /** Up to `limit` rows before `before` (or from the end), newest first. */
  latest(workspaceId: string, sessionId: string, before: Position | null, limit: number): Promise<MessageRow[]>;
  /** Rows at positions 0 and 1 of each session. */
  opening(workspaceId: string, sessionIds: readonly string[]): Promise<Array<MessageRow & { sessionId: string }>>;
}

function comparePositionsDesc(left: Position, right: Position): number {
  return right.index - left.index || (left.recordId < right.recordId ? 1 : left.recordId > right.recordId ? -1 : 0);
}

function sqlMessageWindow(client: LiveRecordSqlClient): MessageWindow {
  return {
    async latest(workspaceId, sessionId, before, limit) {
      const { rows } = await client.query<{ record_id: string; payload: Record<string, unknown> }>(`
        select record_id, payload from orbit_records
        where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages' and target_id = $2
          and lifecycle_state <> 'deleted' and ${ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL} is not null
          and ($3::numeric is null or ${ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL} < $3::numeric
            or (${ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL} = $3::numeric and record_id < $4::text))
        order by ${ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL} desc, record_id desc
        limit $5
      `, [workspaceId, sessionId, before?.index ?? null, before?.recordId ?? null, limit]);
      return rows.map((row) => ({ recordId: row.record_id, payload: row.payload }));
    },
    async opening(workspaceId, sessionIds) {
      if (sessionIds.length === 0) return [];
      const { rows } = await client.query<{ record_id: string; target_id: string; payload: Record<string, unknown> }>(`
        select record_id, target_id, payload from orbit_records
        where workspace_id = $1 and collection_name = 'orbit_agent_chat_messages' and target_id = any($2::text[])
          and lifecycle_state <> 'deleted' and ${ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL} < 2
        order by target_id, ${ORBIT_AGENT_CHAT_MESSAGE_POSITION_SQL}, record_id
        limit $3
      `, [workspaceId, [...sessionIds], sessionIds.length * 4]);
      return rows.map((row) => ({ recordId: row.record_id, sessionId: row.target_id, payload: row.payload }));
    },
  };
}

async function scanInProcess(
  store: LiveRecordStoreLike<Record<string, unknown>>,
  query: Omit<Parameters<LiveRecordStoreLike<Record<string, unknown>>["listRecords"]>[0], "limit">,
): Promise<readonly LiveRecord<Record<string, unknown>>[]> {
  const records = await store.listRecords({ ...query, limit: IN_PROCESS_SCAN_LIMIT });
  if (records.length >= IN_PROCESS_SCAN_LIMIT) {
    throw new Error(`In-process chat session store reached its ${IN_PROCESS_SCAN_LIMIT}-row scan limit; configure Postgres`);
  }
  return records;
}

function inProcessMessageWindow(store: LiveRecordStoreLike<Record<string, unknown>>): MessageWindow {
  async function rowsFor(workspaceId: string, sessionId: string): Promise<MessageRow[]> {
    const records = await scanInProcess(store, {
      collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
      targetId: sessionId,
      targetType: "conversation",
      workspaceId,
    });
    return records.flatMap((record) => messagePosition(record) === null ? [] : [{ recordId: record.recordId, payload: record.payload }])
      .sort((left, right) => comparePositionsDesc(
        { index: messagePosition(left)!, recordId: left.recordId },
        { index: messagePosition(right)!, recordId: right.recordId },
      ));
  }
  return {
    async latest(workspaceId, sessionId, before, limit) {
      const rows = await rowsFor(workspaceId, sessionId);
      return (before
        ? rows.filter((row) => comparePositionsDesc(before, { index: messagePosition(row)!, recordId: row.recordId }) < 0)
        : rows).slice(0, limit);
    },
    async opening(workspaceId, sessionIds) {
      const result: Array<MessageRow & { sessionId: string }> = [];
      for (const sessionId of sessionIds) {
        const rows = await rowsFor(workspaceId, sessionId);
        result.push(...rows.filter((row) => messagePosition(row)! < 2).reverse().map((row) => ({ ...row, sessionId })));
      }
      return result;
    },
  };
}

function cursorCodec(secret: string, binding: string) {
  const sign = (encoded: string) => {
    if (Buffer.byteLength(secret) < 32) throw new Error("READ_CURSOR_SECRET_MISSING");
    return createHmac("sha256", secret).update(binding).update(encoded).digest();
  };
  return {
    open(token: string): Position {
      try {
        if (token.length > 8000) throw new Error();
        const [encoded, signature, ...extra] = token.split(".");
        if (!encoded || !signature || extra.length) throw new Error();
        const expected = sign(encoded);
        const actual = Buffer.from(signature, "base64url");
        if (actual.length !== expected.length || actual.toString("base64url") !== signature || !timingSafeEqual(actual, expected)) throw new Error();
        const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { pos?: Partial<Position> };
        const position = claims.pos;
        if (!position || typeof position.index !== "number" || !Number.isFinite(position.index)
          || typeof position.recordId !== "string" || position.recordId.length < 1 || position.recordId.length > 400) throw new Error();
        return { index: position.index, recordId: position.recordId };
      } catch (error) {
        if (error instanceof Error && error.message === "READ_CURSOR_SECRET_MISSING") throw error;
        throw new OrbitAgentChatSessionCursorError();
      }
    },
    seal(position: Position): string {
      const encoded = Buffer.from(JSON.stringify({ pos: position }), "utf8").toString("base64url");
      return `${encoded}.${sign(encoded).toString("base64url")}`;
    },
  };
}

type SessionTransaction = <T>(
  sessionId: string,
  operation: (store: LiveRecordStoreLike<Record<string, unknown>>, sql: TransactionalSqlExecutor | null) => Promise<T>,
) => Promise<T>;

const inProcessQueues = new WeakMap<object, Map<string, Promise<unknown>>>();

function inProcessTransaction(store: LiveRecordStoreLike<Record<string, unknown>>, actorWorkspaceId: string): SessionTransaction {
  return async (sessionId, operation) => {
    const queues = inProcessQueues.get(store) ?? new Map<string, Promise<unknown>>();
    inProcessQueues.set(store, queues);
    const key = `${actorWorkspaceId}\u0000${sessionId}`;
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => operation(store, null));
    queues.set(key, run);
    try {
      return await run;
    } finally {
      if (queues.get(key) === run) queues.delete(key);
    }
  };
}

function postgresTransaction(client: TransactionalPostgresClient, actorWorkspaceId: string): SessionTransaction {
  return async (sessionId, operation) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await client.transaction(async (transaction) => {
          await transaction.query(
            "select pg_advisory_xact_lock(hashtextextended($1, 0))",
            [JSON.stringify(["orbit-agent-chat-session", actorWorkspaceId, sessionId])],
          );
          return operation(createPostgresLiveRecordStore<Record<string, unknown>>({ client: transaction }), transaction);
        }, { isolation: "read committed" });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : null;
        if ((code === "40001" || code === "40P01") && attempt < 2) continue;
        throw error;
      }
    }
    throw new Error("Orbit Agent chat session transaction retry exhausted");
  };
}

interface MessageWrite {
  identity: string;
  message: OrbitAgentChatSessionMessage;
}

interface CommitPlan {
  create?: {
    createdAt: string;
    messageRevision?: number;
    origin?: StoredAiSessionOriginContract | undefined;
    title: string;
  };
  /** Client metadata saved with a snapshot (legacy behaviour of whole-session saves). */
  metadata?: {
    customTitle?: string | undefined;
    panel?: Record<string, unknown> | null;
    pinned?: boolean;
    title?: string;
  };
  mode: "append" | "merge";
  /** Origin the client claims; it must match the stored one. */
  requestedOrigin?: StoredAiSessionOriginContract | undefined;
  /** Refuse a snapshot older than the stored session (client saves). */
  rejectStale?: boolean;
  updatedAt: string;
  verification?: TrustedOriginVerification | undefined;
  writes: readonly MessageWrite[];
}

function originBase(origin: StoredAiSessionOriginContract): unknown {
  return origin.entryClient === "unknown" ? origin : { ...origin, verification: undefined };
}

export function createStorageOrbitAgentChatSessionProvider({
  actorId,
  source,
  sourceLabel = "Orbit Agent chat session live storage",
  store,
  workspaceId,
  summaryPageClient,
  summaryPageSecret,
  transactionClient,
}: StorageOrbitAgentChatSessionProviderOptions): OrbitAgentChatSessionProvider {
  const actorWorkspaceId = orbitAgentChatSessionActorWorkspaceId(
    workspaceId,
    actorId,
  );
  const cursorSecret = summaryPageSecret ?? process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    ?? (summaryPageClient ? "" : MOCK_CURSOR_SECRET);
  const summaryPageReader = summaryPageClient
    ? createOrbitAgentChatSessionSummaryPageReader({
        actorId,
        actorWorkspaceId,
        baseWorkspaceId: workspaceId,
        client: summaryPageClient,
        secret: summaryPageSecret ?? process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
      })
    : null;
  const window = summaryPageClient ? sqlMessageWindow(summaryPageClient) : inProcessMessageWindow(store);
  const inSession = transactionClient
    ? postgresTransaction(transactionClient, actorWorkspaceId)
    : inProcessTransaction(store, actorWorkspaceId);
  const codecFor = (sessionId: string) => cursorCodec(
    cursorSecret,
    JSON.stringify(["orbit-agent-session-messages:v1", workspaceId, actorWorkspaceId, actorId, sessionId]),
  );

  function messageRecord(input: {
    createdAt: string;
    identity: string;
    index: number;
    message: OrbitAgentChatSessionMessage;
    sessionId: string;
    updatedAt: string;
  }): LiveRecord<Record<string, unknown>> {
    const recordId = messageRecordId(input.sessionId, input.identity);
    return {
      collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
      createdAt: input.createdAt,
      evidenceIds: [evidenceIdFor("message", recordId)],
      lifecycleState: "active",
      occurredAt: input.updatedAt,
      payload: { ...input.message, index: input.index, sessionId: input.sessionId },
      provider: "orbit-agent-chat-message",
      providerRecordId: recordId,
      recordId,
      searchText: [input.sessionId, input.message.role, input.message.text].join(" "),
      sourceId: sourceIdFor("message", recordId),
      sourceLabel,
      sourceType: "system",
      targetId: input.sessionId,
      targetType: "conversation",
      updatedAt: input.updatedAt,
      workspaceId: actorWorkspaceId,
    };
  }

  /**
   * Adds and updates messages of one session under its lock. Reads the session
   * row and the rows of the messages being written, nothing else; writes those
   * messages and the session row. Cost does not depend on the session length.
   */
  function commit(sessionId: string, plan: CommitPlan): Promise<{ header: OrbitAgentChatSessionHeader; saved: Map<string, OrbitAgentChatSessionMessage> }> {
    return inSession(sessionId, async (tx, sql) => {
      const existing = sql
        ? await readSessionRowForWrite(sql, sessionId)
        : await tx.getRecord({
            collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
            includeDeleted: true,
            recordId: sessionId,
            workspaceId: actorWorkspaceId,
          });
      if (existing?.lifecycleState === "deleted") throw new OrbitAgentChatSessionWriteError("SESSION_DELETED");
      if (!existing && !plan.create) throw new OrbitAgentChatSessionWriteError("SESSION_NOT_FOUND");
      const header = existing ? headerFromRecord(existing) : null;
      if (existing && !header) throw new Error("Stored Orbit Agent chat session is unreadable");
      if (plan.rejectStale && header && plan.updatedAt < header.updatedAt) {
        throw new OrbitAgentChatSessionWriteError("SESSION_SNAPSHOT_STALE");
      }
      const storedRaw = existing ? storedOrigin(existing.payload.origin) : undefined;
      const rawOrigin = existing ? storedRaw : plan.create?.origin;
      const requested = plan.requestedOrigin;
      const requestedVerification = requested && requested.entryClient !== "unknown" ? requested.verification : undefined;
      const existingVerification = storedRaw && storedRaw.entryClient !== "unknown" ? storedRaw.verification : undefined;
      // Only the server sets verification (plan.verification); a client may repeat, never introduce, it.
      if (requestedVerification && !existingVerification) throw new OrbitAgentChatSessionWriteError("SESSION_ORIGIN_IMMUTABLE");
      if (existing && requested) {
        const current = rawOrigin ?? legacyOrigin();
        if (JSON.stringify(originBase(current)) !== JSON.stringify(originBase(requested))) {
          throw new OrbitAgentChatSessionWriteError("SESSION_ORIGIN_IMMUTABLE");
        }
      }

      const firstUserId = rawOrigin && rawOrigin.entryClient !== "unknown" ? rawOrigin.firstUserMessageId : null;
      const verifying = plan.verification && !(existingVerification
        && JSON.stringify(existingVerification) === JSON.stringify(plan.verification));
      const recordIds = [...new Set([
        ...plan.writes.map((write) => messageRecordId(sessionId, write.identity)),
        ...(verifying && firstUserId ? [messageRecordId(sessionId, firstUserId)] : []),
      ])];
      const stored = recordIds.length
        ? await tx.listRecords({
            collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
            includeDeleted: true,
            limit: recordIds.length,
            recordIds,
            workspaceId: actorWorkspaceId,
          })
        : [];
      const storedById = new Map(stored.map((record) => [record.recordId, record]));

      let nextIndex = existing ? nextIndexOf(existing) : 0;
      let messageCount = header?.messageCount ?? 0;
      let appended = 0;
      let lastText: string | null = null;
      let firstUserText: string | null = null;
      const newTexts: string[] = [];
      const saved = new Map<string, OrbitAgentChatSessionMessage>();
      const pendingWrites: LiveRecord<Record<string, unknown>>[] = [];
      const createdAt = existing?.createdAt ?? plan.create!.createdAt;
      const seen = new Set<string>();
      for (const write of plan.writes) {
        const recordId = messageRecordId(sessionId, write.identity);
        if (seen.has(recordId)) continue;
        seen.add(recordId);
        const current = storedById.get(recordId);
        if (current && current.lifecycleState !== "deleted") {
          const position = messagePosition(current) ?? 0;
          const currentMessage = messageFromRow(current);
          // A message row the session row does not count yet (a write that failed
          // halfway without a transaction) is adopted instead of appended twice.
          if (position >= nextIndex) {
            nextIndex = position + 1;
            messageCount += 1;
            appended += 1;
            lastText = currentMessage?.text ?? lastText;
            if (currentMessage) newTexts.push(currentMessage.text);
          }
          if (plan.mode === "append" || !currentMessage) {
            saved.set(write.identity, currentMessage ?? write.message);
            continue;
          }
          let incoming = write.message;
          if (currentMessage.references?.length) {
            if (incoming.references?.length && JSON.stringify(incoming.references) !== JSON.stringify(currentMessage.references)) {
              throw new OrbitAgentChatSessionWriteError("SESSION_MESSAGE_REFERENCES_IMMUTABLE");
            }
            incoming = { ...incoming, references: currentMessage.references.map((reference) => ({ ...reference })) };
          }
          const { index: _index, sessionId: _sessionId, ...currentPayload } = current.payload;
          const { id: _incomingId, ...incomingRest } = incoming;
          const nextPayload = { ...incomingRest, ...(typeof currentPayload.id === "string" ? { id: currentPayload.id } : {}) };
          saved.set(write.identity, incoming);
          if (JSON.stringify(nextPayload) === JSON.stringify(currentPayload)) continue;
          pendingWrites.push(messageRecord({
            createdAt: current.createdAt, identity: write.identity, index: position,
            message: nextPayload as OrbitAgentChatSessionMessage, sessionId, updatedAt: plan.updatedAt,
          }));
          if (position === nextIndex - 1) lastText = incoming.text;
          continue;
        }
        const index = nextIndex;
        nextIndex += 1;
        messageCount += 1;
        appended += 1;
        const message = write.identity.startsWith("legacy-index:") ? (() => {
          const { id: _id, ...rest } = write.message;
          return rest as OrbitAgentChatSessionMessage;
        })() : { ...write.message, id: write.message.id ?? write.identity };
        pendingWrites.push(messageRecord({ createdAt, identity: write.identity, index, message, sessionId, updatedAt: plan.updatedAt }));
        saved.set(write.identity, write.message);
        lastText = write.message.text;
        newTexts.push(write.message.text);
        if (write.message.role === "user" && firstUserText === null) firstUserText = write.message.text;
      }

      let origin = rawOrigin;
      if (verifying && plan.verification) {
        const firstRecord = firstUserId ? storedById.get(messageRecordId(sessionId, firstUserId)) : undefined;
        const assistantWrite = plan.writes.at(-1);
        const assistantRecord = assistantWrite ? storedById.get(messageRecordId(sessionId, assistantWrite.identity)) : undefined;
        const assistantIndex = assistantRecord ? messagePosition(assistantRecord) : nextIndex - 1;
        if (
          !origin || origin.entryClient === "unknown" || origin.entryPointId !== "contacts.analysis" ||
          origin.sourceDataVersion !== plan.verification.sourceDataVersion ||
          messageCount !== 2 || !firstRecord || messagePosition(firstRecord) !== 0 || firstRecord.payload.role !== "user" ||
          assistantWrite?.message.role !== "assistant" || assistantIndex !== 1
        ) {
          throw new OrbitAgentChatSessionWriteError("SESSION_ORIGIN_IMMUTABLE");
        }
        origin = { ...origin, verification: plan.verification };
      }

      const payload = existing?.payload ?? {};
      const title = plan.metadata?.title ?? header?.title ?? plan.create!.title;
      const customTitle = plan.metadata && "customTitle" in plan.metadata ? plan.metadata.customTitle ?? null : (payload.customTitle ?? null);
      const panel = plan.metadata && "panel" in plan.metadata ? plan.metadata.panel ?? null : (isRecord(payload.panel) ? payload.panel : null);
      const pinned = plan.metadata && "pinned" in plan.metadata ? plan.metadata.pinned === true : payload.pinned === true;
      const messageRevision = header
        ? header.messageRevision + appended
        : Math.max(plan.create?.messageRevision ?? 0, appended);
      const nextSessionPayload: Record<string, unknown> = {
        ...payload,
        createdAt: header?.createdAt ?? plan.create!.createdAt,
        customTitle,
        firstUserMessage: typeof payload.firstUserMessage === "string" && payload.firstUserMessage ? payload.firstUserMessage : firstUserText ?? "",
        id: sessionId,
        lastMessagePreview: lastText ?? (typeof payload.lastMessagePreview === "string" ? payload.lastMessagePreview : ""),
        messageCount,
        messageRevision,
        nextMessageIndex: nextIndex,
        origin: origin ?? null,
        panel,
        pinned,
        title,
        updatedAt: header && plan.updatedAt < header.updatedAt ? header.updatedAt : plan.updatedAt,
      };
      const changed = !existing || pendingWrites.length > 0 || origin !== rawOrigin
        || JSON.stringify(nextSessionPayload) !== JSON.stringify({ ...payload, updatedAt: nextSessionPayload.updatedAt });
      if (changed) {
        const searchHead = existing?.searchText ?? [originToken(origin), sessionId, title, customTitle].filter(nonEmptyString).join(" ");
        const sessionUpdatedAt = nextSessionPayload.updatedAt as string;
        for (const record of pendingWrites) await tx.upsertRecord(record);
        await tx.upsertRecord({
          collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
          createdAt,
          evidenceIds: [evidenceIdFor("session", sessionId)],
          lifecycleState: "active",
          occurredAt: sessionUpdatedAt,
          payload: nextSessionPayload,
          provider: "orbit-agent-chat-session",
          providerRecordId: sessionId,
          recordId: sessionId,
          searchText: boundedSearchText([searchHead, ...newTexts].filter(nonEmptyString).join(" ")),
          sourceId: sourceIdFor("session", sessionId),
          sourceLabel,
          sourceType: "system",
          targetId: sessionId,
          targetType: "conversation",
          updatedAt: sessionUpdatedAt,
          workspaceId: actorWorkspaceId,
        });
      }
      const nextHeader = headerFromRecord({
        ...(existing ?? { createdAt, recordId: sessionId, updatedAt: nextSessionPayload.updatedAt as string } as LiveRecord<Record<string, unknown>>),
        payload: nextSessionPayload,
      })!;
      return { header: nextHeader, saved };
    });
  }

  /**
   * The session row as a write needs it, with its search text already cut to
   * the bounded head and tail, so a legacy row holding every message's text is
   * never shipped whole.
   */
  async function readSessionRowForWrite(sql: TransactionalSqlExecutor, sessionId: string): Promise<LiveRecord<Record<string, unknown>> | null> {
    const { rows } = await sql.query<{ payload: Record<string, unknown>; lifecycle_state: LiveRecord["lifecycleState"]; created_at: string | Date; updated_at: string | Date; search_text: string }>(`
      select payload, lifecycle_state, created_at, updated_at,
        case when length(search_text) <= $4 then search_text
          else left(search_text, $5) || ' ' || right(search_text, $4 - $5 - 1) end as search_text
      from orbit_records
      where workspace_id = $1 and collection_name = $2 and record_id = $3
      limit 1
    `, [actorWorkspaceId, ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions, sessionId, SEARCH_TEXT_MAX_LENGTH, SEARCH_TEXT_HEAD_LENGTH]);
    const row = rows[0];
    return row ? {
      collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
      createdAt: new Date(row.created_at).toISOString(),
      evidenceIds: [],
      lifecycleState: row.lifecycle_state,
      payload: row.payload,
      recordId: sessionId,
      searchText: row.search_text,
      sourceId: sourceIdFor("session", sessionId),
      sourceType: "system",
      updatedAt: new Date(row.updated_at).toISOString(),
      workspaceId: actorWorkspaceId,
    } : null;
  }

  async function readHeader(sessionId: string): Promise<{ record: LiveRecord<Record<string, unknown>>; header: OrbitAgentChatSessionHeader } | null> {
    // A primary-key read without the search text: a header is a few hundred bytes whatever the session length.
    const [record] = await store.listRecords({
      collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
      limit: 1,
      omitSearchText: true,
      recordIds: [sessionId],
      workspaceId: actorWorkspaceId,
    });
    const header = record ? headerFromRecord(record) : null;
    return record && header ? { record, header } : null;
  }

  async function readPage(sessionId: string, options: { cursor?: string | null; limit?: number } = {}): Promise<OrbitAgentChatSessionPage | null> {
    const limit = options.limit ?? AI_SESSION_MESSAGE_PAGE_DEFAULT_LIMIT;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > AI_SESSION_MESSAGE_PAGE_MAX_LIMIT) {
      throw new RangeError("AI session message page limit must be between 1 and 50");
    }
    const codec = codecFor(sessionId);
    const before = options.cursor ? codec.open(options.cursor) : null;
    const found = await readHeader(sessionId);
    if (!found) return null;
    const rows = await window.latest(actorWorkspaceId, sessionId, before, limit + 1);
    const pageRows = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const oldest = pageRows.at(-1);
    const messages = [...pageRows].reverse().flatMap((row) => {
      const message = messageFromRow(row);
      return message ? [message] : [];
    });
    if (messages.length === 0 && !before) return null;
    const preceding = hasMore ? messageFromRow(rows[limit]!) : null;
    return {
      page: {
        hasMore,
        limit,
        nextCursor: hasMore && oldest ? codec.seal({ index: messagePosition(oldest) ?? 0, recordId: oldest.recordId }) : null,
      },
      precedingMessage: preceding,
      session: { ...found.header, messages },
    };
  }

  return {
    source:
      source ??
      `live-record-store:orbit-agent-chat-session:${actorWorkspaceId}`,
    sourceLabel,

    async appendMessages(sessionId, input) {
      const { header } = await commit(sessionId, {
        create: input.create,
        mode: "append",
        updatedAt: input.updatedAt,
        verification: input.verification,
        writes: input.messages.flatMap((message) => {
          const normalized = normalizeMessage(message);
          return normalized && nonEmptyString(message.id) ? [{ identity: message.id.trim(), message: { ...normalized, id: message.id.trim() } }] : [];
        }),
      });
      return header;
    },

    async deleteSession(sessionId) {
      const deletedAt = new Date().toISOString();
      const activeSession = await store.getRecord({
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        includeDeleted: true,
        recordId: sessionId,
        workspaceId: actorWorkspaceId,
      });
      const deletedSession = activeSession?.lifecycleState === "active"
        ? await store.deleteRecord({
            collectionName:
              ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
            deletedAt,
            recordId: sessionId,
            workspaceId: actorWorkspaceId,
          })
        : null;
      // Tombstone the messages a bounded batch at a time; each batch removes what it read.
      for (;;) {
        const batch = await store.listRecords({
          limit: DELETE_BATCH,
          collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
          targetId: sessionId,
          targetType: "conversation",
          workspaceId: actorWorkspaceId,
        });
        if (batch.length === 0) break;
        const results = await Promise.all(batch.map((message) =>
          store.deleteRecord({
            collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
            deletedAt,
            recordId: message.recordId,
            workspaceId: actorWorkspaceId,
          })));
        if (results.some((result) => result === null)) {
          throw new Error("Orbit Agent chat message deletion made no progress");
        }
        if (batch.length < DELETE_BATCH) break;
      }

      return Boolean(activeSession ?? deletedSession);
    },

    async getSession(sessionId, options = {}) {
      return (await readPage(sessionId, { limit: options.limit }))?.session ?? null;
    },

    async getSessionHeader(sessionId) {
      return (await readHeader(sessionId))?.header ?? null;
    },

    getSessionPage: readPage,

    async listSessionSummariesPage(query, listOrganizations) {
      if (summaryPageReader) return summaryPageReader.read(query);
      const records = await scanInProcess(store, {
        collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
        workspaceId: actorWorkspaceId,
      });
      const candidates = records.flatMap((record) => {
        const payload = record.payload;
        const id = typeof payload.id === "string" ? payload.id : record.recordId;
        const title = typeof payload.title === "string" ? payload.title.trim().slice(0, MAX_SESSION_TITLE_LENGTH) : "";
        const createdAt = typeof payload.createdAt === "string" ? validTimestamp(payload.createdAt) : record.createdAt;
        const updatedAt = typeof payload.updatedAt === "string" ? validTimestamp(payload.updatedAt) : record.updatedAt;
        if (!id || id !== record.recordId || !title) return [];
        return [{
          id,
          title,
          firstUserText: typeof payload.firstUserMessage === "string" ? payload.firstUserMessage : "",
          lastMessagePreview: typeof payload.lastMessagePreview === "string" ? payload.lastMessagePreview : "",
          createdAt,
          updatedAt,
          messageRevision: typeof payload.messageRevision === "number" && Number.isSafeInteger(payload.messageRevision) && payload.messageRevision >= 0 ? payload.messageRevision : 0,
          searchText: record.searchText ?? "",
          sessionCustomTitle: typeof payload.customTitle === "string" ? payload.customTitle : null,
          pinned: payload.pinned === true,
        }];
      });
      const organizations = listOrganizations ? await listOrganizations(candidates.map((candidate) => candidate.id)) : new Map<string, AiSessionOrganizationContract>();
      return pageOrbitAgentChatSessionSummaryCandidates({
        actorId,
        actorWorkspaceId,
        baseWorkspaceId: workspaceId,
        candidates: candidates.map((candidate) => ({ ...candidate, organization: organizations.get(candidate.id) })),
        query,
        secret: summaryPageSecret ?? (summaryPageClient ? "" : "orbit-mock-session-summary-cursor-secret-32-bytes"),
      });
    },

    async listSessionsByEntryPoint(entryPointId) {
      let records: readonly LiveRecord<Record<string, unknown>>[];
      if (summaryPageClient) {
        const { rows } = await summaryPageClient.query<{ record_id: string; payload: Record<string, unknown>; created_at: string | Date; updated_at: string | Date }>(`
          select record_id, payload, created_at, updated_at from orbit_records
          where workspace_id = $1 and collection_name = 'orbit_agent_chat_sessions' and lifecycle_state <> 'deleted'
            and payload->'origin'->>'entryPointId' = $2
          order by updated_at desc, record_id
          limit $3
        `, [actorWorkspaceId, entryPointId, ENTRY_POINT_SESSION_LIMIT]);
        records = rows.map((row) => ({
          collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
          createdAt: new Date(row.created_at).toISOString(),
          evidenceIds: [],
          lifecycleState: "active",
          payload: row.payload,
          recordId: row.record_id,
          sourceId: sourceIdFor("session", row.record_id),
          sourceType: "system",
          updatedAt: new Date(row.updated_at).toISOString(),
          workspaceId: actorWorkspaceId,
        }));
      } else {
        records = [...await scanInProcess(store, {
          collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.sessions,
          searchText: `orbit-origin-entry-point:${entryPointId}`,
          workspaceId: actorWorkspaceId,
        })].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, ENTRY_POINT_SESSION_LIMIT);
      }
      const headers = records.flatMap((record) => {
        const header = headerFromRecord(record);
        return header && header.origin?.entryPointId === entryPointId ? [header] : [];
      });
      const opening = await window.opening(actorWorkspaceId, headers.map((header) => header.id));
      return headers.flatMap((header) => {
        const messages = opening
          .filter((row) => row.sessionId === header.id)
          .sort((left, right) => (messagePosition(left) ?? 0) - (messagePosition(right) ?? 0))
          .flatMap((row) => {
            const message = messageFromRow(row);
            return message ? [message] : [];
          });
        return messages.length ? [{ ...header, messages }] : [];
      });
    },

    async upsertSession(sessionInput) {
      const session = normalizeOrbitAgentChatSessionSnapshot(sessionInput);
      if (!session) throw new Error("Invalid Orbit Agent chat session snapshot");
      const offset = Math.max(0, session.messages.length - MERGE_WINDOW);
      const windowed = session.messages.slice(offset);
      const header = await readHeader(session.id);
      // Id-less messages are addressed by position only when the snapshot provably
      // starts at the session's first message (an old client's full snapshot).
      let anchored = !header;
      if (header && offset === 0 && windowed.some((message) => !message.id)) {
        const first = windowed[0]!;
        const [row] = await store.listRecords({
          collectionName: ORBIT_AGENT_CHAT_SESSION_LIVE_RECORD_COLLECTIONS.messages,
          limit: 1,
          recordIds: [messageRecordId(session.id, first.id?.trim() || "legacy-index:0")],
          workspaceId: actorWorkspaceId,
        });
        anchored = Boolean(row && messagePosition(row) === 0);
      }
      let previousIdentity = "start";
      let sincePrevious = 0;
      const writes: MessageWrite[] = windowed.map((message, windowIndex) => {
        const id = message.id?.trim();
        if (id) {
          previousIdentity = id;
          sincePrevious = 0;
          return { identity: id, message };
        }
        sincePrevious += 1;
        const identity = anchored
          ? `legacy-index:${offset + windowIndex}`
          : `client-content:${createHash("sha256").update(JSON.stringify([previousIdentity, sincePrevious, message.role, message.text])).digest("hex").slice(0, 32)}`;
        return { identity, message };
      });
      const { header: saved, saved: savedMessages } = await commit(session.id, {
        create: { createdAt: session.createdAt, messageRevision: session.messageRevision, origin: session.origin, title: session.title },
        metadata: {
          customTitle: session.customTitle,
          panel: session.panel ?? null,
          pinned: session.pinned === true,
          title: session.title,
        },
        mode: "merge",
        rejectStale: true,
        requestedOrigin: session.origin,
        updatedAt: session.updatedAt,
        writes,
      });
      const { messageCount: _count, ...savedHeader } = saved;
      return {
        ...savedHeader,
        messages: [...session.messages.slice(0, offset), ...writes.map((write) => savedMessages.get(write.identity) ?? write.message)],
      };
    },
  };
}

export function createConfiguredStorageOrbitAgentChatSessionProvider({
  actorId,
  env,
  sourceLabel = "Orbit Agent chat session Postgres live storage",
}: ConfiguredStorageOrbitAgentChatSessionProviderOptions): OrbitAgentChatSessionProvider | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const key = [
    config.connectionString,
    config.workspaceId,
    actorId.trim(),
    sourceLabel,
  ].join("\u0000");

  const cachedProvider = cachedDefaultProviders.get(key);
  if (cachedProvider) {
    return cachedProvider;
  }

  const configuredStore = createConfiguredPostgresLiveRecordStore({
    env,
  });

  if (!configuredStore) {
    return null;
  }

  const provider = createStorageOrbitAgentChatSessionProvider({
    actorId,
    source: `postgres-live-record-store:orbit-agent-chat-session:${configuredStore.workspaceId}`,
    sourceLabel,
    store: configuredStore.store,
    summaryPageClient: configuredStore.client,
    transactionClient: createConfiguredTransactionalPostgresRuntime({ env })?.client,
    workspaceId: configuredStore.workspaceId,
  });

  cachedDefaultProviders.set(key, provider);

  return provider;
}
