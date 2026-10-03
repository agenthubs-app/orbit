import type {
  AiSyncVisibility,
  LocalSyncState,
  SyncEntityKind,
  SyncRecord,
} from "../../api/contract/sync";
import type {
  LocalSyncDatabase,
  LocalSyncSqlValue,
} from "./local-sync-database";
import { z } from "zod";
import type { DomainPage, ReadScope } from "../../api/contract/universal-read";
import { domainPageSchema, readScopeSchema } from "../../api/schema/universal-read";
import { IDENTITY_PAYLOAD_CODEC, type PayloadCodec } from "./payload-codec";
import { assertPageCopyKey, type PageCopy } from "./page-copies";

const LEGACY_DOMAINS: Record<SyncEntityKind, string> = {
  contact: "contacts", note: "notes", task: "tasks", relationship_followup: "followups",
  personal_schedule: "personal-schedule", inbox_item: "notifications",
  // Sprint 0115: the registered attendee's event day.
  event_registration: "event-registrations", registered_event: "registered-events", event_published_result: "event-published-results",
  // Sprint 0117: the account's dashboard graph (dashboard and contacts analysis computed on the device).
  dashboard_graph: "dashboard-graph",
  // Sprint 0118: the typed inbox, the AI session list and the messages of opened AI sessions.
  inbox_notification: "inbox-notifications", ai_session: "ai-sessions", ai_session_message: "ai-session-messages",
  // Sprint 0119: relationship conversations and their messages.
  relationship_conversation: "relationship-conversations", relationship_message: "relationship-messages",
};

const SYNC_ENTITY_KINDS = new Set<SyncEntityKind>([
  "contact",
  "note",
  "task",
  "relationship_followup",
  "personal_schedule",
  "inbox_item",
  "event_registration",
  "registered_event",
  "event_published_result",
  "dashboard_graph",
  "inbox_notification",
  "ai_session",
  "ai_session_message",
  "relationship_conversation",
  "relationship_message",
]);
const LOCAL_SYNC_STATES = new Set<LocalSyncState>([
  "synced",
  "pending",
  "conflicted",
  "failed",
]);
const AI_SYNC_VISIBILITIES = new Set<AiSyncVisibility>([
  "available_when_synced",
  "excluded",
]);
const BOOTSTRAP_STATES = new Set<LocalSyncBootstrapState>([
  "pending",
  "complete",
]);
const OUTBOX_OPERATIONS = new Set<LocalSyncOutboxOperation>([
  "create",
  "update",
  "delete",
  "complete",
  "reopen",
  "cancel",
  "send",
]);
const SYNC_TIMESTAMP = z.iso.datetime({ offset: true });
const PLAIN_JSON = z.json();
const LAST_SUCCESSFUL_WORKSPACE_KEY = "last_successful_workspace_id";
const OFFLINE_READ_LEASE_KEY = "offline_read_lease";
/** Sprint 0118: how many opened AI sessions a device keeps messages for (the server accepts no more in one request). */
export const AI_OPENED_SESSION_LIMIT = 20;
const AI_MESSAGES_DOMAIN = "ai-session-messages";
const aiOpenedKey = (workspaceId: string) => `ai_opened_sessions:${workspaceId}`;
const aiCardsKey = (workspaceId: string, sessionId: string) => `ai_session_cards:${workspaceId}:${sessionId}`;
/** Sprint 0119: a conversation that leaves the device takes its messages (row ids `${conversationId}/${seq}`) with it. */
const RELATIONSHIP_CONVERSATIONS_DOMAIN = "relationship-conversations";
const RELATIONSHIP_MESSAGES_DOMAIN = "relationship-messages";
/** Sprint 0131: page copies live in sync_meta under their lease binding (JSON keys keep ids with any characters unambiguous). */
const PAGE_COPY_PREFIX = "page_copy:";
const PAGE_COPY_INDEX_PREFIX = "page_copy_index:";
const OUTBOX_ALIAS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const pageCopyKey = (workspaceId: string, epoch: string, id: string, variant: string) => PAGE_COPY_PREFIX + JSON.stringify([workspaceId, epoch, id, variant]);
const pageCopyIndexKey = (workspaceId: string, epoch: string, id: string) => PAGE_COPY_INDEX_PREFIX + JSON.stringify([workspaceId, epoch, id]);
const partitionKeyOf = (scope: ReadScope) => `sync_partitions:${scope.workspaceId}:${scope.domainId}:${scope.authorizationEpoch}`;

export type LocalSyncBootstrapState = "pending" | "complete";
export type LocalSyncOutboxOperation = "create" | "update" | "delete" | "complete" | "reopen" | "cancel" | "send";
export type LocalSyncOutboxState = "queued" | "sending" | "conflict" | "failed";

export interface LocalSyncCursor {
  workspaceId: string;
  cursor: string;
  lastSyncedAt: string;
  bootstrapState: LocalSyncBootstrapState;
  /** Server generation the last page was issued under; null for legacy (v1) cursors. */
  generation: string | null;
  /** Server high watermark of the last page; null until a v3 page is applied. */
  highWatermark: string | null;
}

export interface LocalSyncOutboxMutation {
  actorId: string;
  workspaceId: string;
  domainId?: string;
  mutationId: string;
  kind: SyncEntityKind;
  id: string;
  operation: LocalSyncOutboxOperation;
  patch: unknown;
  requestJson?: string | null;
  baseRevision: string | null;
  dependsOn?: string | null;
  createdAt: string;
  retryCount: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  /** A native HTTP write may have reached the server before its response was lost. */
  requestAttemptedAt?: string | null;
}

export interface LocalSyncQueuedMutation extends LocalSyncOutboxMutation {
  domainId: string;
  requestJson: string | null;
  dependsOn: string | null;
  state: LocalSyncOutboxState;
  attemptCount: number;
  firstAttemptAt: string | null;
  serverSnapshot: unknown | null;
}

export interface ApplyLocalSyncPageInput {
  workspaceId: string;
  records: readonly SyncRecord[];
  cursor: string;
  syncedAt: string;
  bootstrapState: LocalSyncBootstrapState;
  canCommit?: () => boolean;
}

export interface ListLocalSyncRecordsInput {
  workspaceId: string;
  kind: SyncEntityKind;
  includeDeleted?: boolean;
}

export interface LocalSyncRecordKey {
  workspaceId: string;
  kind: SyncEntityKind;
  id: string;
}

interface SyncRecordRow {
  workspace_id: string;
  kind: SyncEntityKind;
  record_id: string;
  revision: string;
  updated_at: string;
  deleted_at: string | null;
  payload_json: string | null;
  sync_state: LocalSyncState;
  ai_visibility: AiSyncVisibility;
}

interface SyncCursorRow {
  workspace_id: string;
  cursor: string;
  last_successful_sync_at: string;
  bootstrap_state: LocalSyncBootstrapState;
  generation?: string | null;
  high_watermark?: string | null;
}

interface SyncOutboxRow {
  mutation_id: string;
  workspace_id: string;
  kind: SyncEntityKind;
  record_id: string;
  operation: LocalSyncOutboxOperation;
  patch_json: string | null;
  base_revision: string | null;
  created_at: string;
  retry_count: number;
  next_retry_at: string | null;
  last_error_code: string | null;
}

interface SyncQueuedMutationRow {
  mutation_id: string;
  workspace_id: string;
  domain_id: string;
  kind: SyncEntityKind;
  record_id: string;
  operation: LocalSyncOutboxOperation;
  state: LocalSyncOutboxState;
  request_json: string | null;
  depends_on: string | null;
  patch_json: string | null;
  base_revision: string | null;
  created_at: string;
  retry_count: number;
  next_retry_at: string | null;
  last_error_code: string | null;
  attempt_count: number;
  first_attempt_at: string | null;
  server_snapshot_json: string | null;
}

interface SerializedRecord {
  record: SyncRecord;
  payloadJson: string | null;
}

class LocalSyncPageSupersededError extends Error {}

const UPSERT_RECORD = `INSERT INTO sync_records (
  workspace_id,
  domain_id,
  authorization_epoch,
  kind,
  record_id,
  revision,
  updated_at,
  deleted_at,
  payload_json,
  sync_state,
  ai_visibility
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, domain_id, authorization_epoch, record_id) DO UPDATE SET
  revision = excluded.revision,
  updated_at = excluded.updated_at,
  deleted_at = excluded.deleted_at,
  payload_json = excluded.payload_json,
  sync_state = excluded.sync_state,
  ai_visibility = excluded.ai_visibility`;

const APPLY_CANONICAL_RECORD = `${UPSERT_RECORD}
WHERE sync_records.sync_state NOT IN ('pending', 'conflicted')
  AND sync_records.revision <> excluded.revision`;

export function createLocalSyncRepository(input: {
  actorId: string;
  database: LocalSyncDatabase;
  baseUrl?: string;
  registeredDomainIds?: readonly string[];
  /** Trusted scope binding supplied by the caller, not a server authorizer. */
  activeReadScopes?: () => readonly ReadScope[];
  hashPayload?: (serialized: string) => Promise<string>;
  /** At-rest encoding of payload_json; native mirrors rely on SQLCipher and keep the identity default. */
  payloadCodec?: PayloadCodec;
  /** Called after an outbox transaction commits so its owner can schedule an online upload attempt. */
  onOutboxQueued?: () => void | Promise<void>;
  /** Isolated kinds registered only by tests; their ACKs never enter the product mirror. */
  testOnlyOutboxDomains?: readonly string[];
}) {
  assertNonEmptyString(input.actorId, "actorId");
  const { actorId, database } = input;
  const codec = input.payloadCodec ?? IDENTITY_PAYLOAD_CODEC;
  const registered = new Set(input.registeredDomainIds ?? []);
  const testOnlyOutboxDomains = new Set(input.testOnlyOutboxDomains ?? []);
  for (const domainId of testOnlyOutboxDomains) assertNonEmptyString(domainId, "testOnlyOutboxDomain");

  async function encoded(serialized: SerializedRecord): Promise<SerializedRecord> {
    return serialized.payloadJson === null ? serialized : { ...serialized, payloadJson: await codec.encode(serialized.payloadJson) };
  }

  async function recordFromStoredRow(row: SyncRecordRow): Promise<SyncRecord> {
    return recordFromRow({ ...row, payload_json: row.payload_json === null ? null : await codec.decode(row.payload_json) }, actorId);
  }

  function assertScope(value: ReadScope): ReadScope {
    readScopeSchema.parse(value);
    const scope = { ...value };
    if (scope.actorId !== actorId || scope.baseUrl !== input.baseUrl || !registered.has(scope.domainId)) {
      throw new TypeError("read scope does not match the authenticated database or registry");
    }
    const bound = input.activeReadScopes?.().some(candidate =>
      candidate.baseUrl === scope.baseUrl && candidate.actorId === scope.actorId &&
      candidate.workspaceId === scope.workspaceId && candidate.domainId === scope.domainId &&
      candidate.authorizationEpoch === scope.authorizationEpoch);
    if (!bound) throw new TypeError("read scope epoch is not bound");
    return scope;
  }

  function legacyScope(workspaceId: string, kind?: SyncEntityKind): ReadScope {
    const candidates = input.activeReadScopes?.().filter(scope => scope.workspaceId === workspaceId &&
      (kind === undefined || scope.domainId === LEGACY_DOMAINS[kind])) ?? [];
    if (candidates.length !== 1) throw new TypeError("legacy operation requires one explicit read scope");
    return assertScope(candidates[0]!);
  }

  const scopeParameters = (scope: ReadScope) => [scope.workspaceId, scope.domainId, scope.authorizationEpoch];

  function queueMutationFromRow(row: SyncQueuedMutationRow): LocalSyncQueuedMutation {
    return {
      actorId,
      workspaceId: row.workspace_id,
      domainId: row.domain_id,
      mutationId: row.mutation_id,
      kind: row.kind,
      id: row.record_id,
      operation: row.operation,
      patch: row.patch_json === null ? null : JSON.parse(row.patch_json),
      requestJson: row.request_json,
      baseRevision: row.base_revision,
      dependsOn: row.depends_on,
      createdAt: row.created_at,
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at,
      lastErrorCode: row.last_error_code,
      state: row.state,
      attemptCount: row.attempt_count,
      firstAttemptAt: row.first_attempt_at,
      serverSnapshot: row.server_snapshot_json === null ? null : JSON.parse(row.server_snapshot_json),
    };
  }

  /** Sprint 0118: every message row and cached card set of the given AI sessions, in every epoch. */
  async function deleteAiSessionRows(workspaceId: string, sessionIds: readonly string[]): Promise<void> {
    const rows = await database.all<{ authorization_epoch: string; record_id: string; payload_json: string | null }>(
      "SELECT authorization_epoch, record_id, payload_json FROM sync_records WHERE workspace_id = ? AND domain_id = ? AND sync_state = 'synced'",
      [workspaceId, AI_MESSAGES_DOMAIN],
    );
    for (const row of rows) {
      if (row.payload_json === null) continue;
      let sessionId: unknown;
      try { sessionId = (JSON.parse(await codec.decode(row.payload_json)) as { sessionId?: unknown }).sessionId; } catch { sessionId = null; }
      if (typeof sessionId === "string" && sessionIds.includes(sessionId)) {
        await database.run("DELETE FROM sync_records WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ? AND record_id = ?", [workspaceId, AI_MESSAGES_DOMAIN, row.authorization_epoch, row.record_id]);
      }
    }
    for (const sessionId of sessionIds) await database.run("DELETE FROM sync_meta WHERE key = ?", [aiCardsKey(workspaceId, sessionId)]);
  }
  async function isReadable(scope: ReadScope): Promise<boolean> {
    const row = await database.get<{ readable: number }>("SELECT readable FROM local_read_scope_state WHERE workspace_id=? AND domain_id=? AND authorization_epoch=?", scopeParameters(scope));
    return row?.readable !== 0;
  }

  return {
    async putRecord(record: SyncRecord): Promise<void> {
      const serialized = await encoded(validateAndSerializeRecord(record, actorId));
      const scope = legacyScope(record.workspaceId, record.kind);
      await database.run(UPSERT_RECORD, [...scopeParameters(scope), ...recordParameters(serialized).slice(1)]);
    },

    async applyPage(page: ApplyLocalSyncPageInput): Promise<boolean> {
      assertNonEmptyString(page.workspaceId, "workspaceId");
      assertNonEmptyString(page.cursor, "cursor");
      assertTimestamp(page.syncedAt, "syncedAt");
      if (!BOOTSTRAP_STATES.has(page.bootstrapState)) {
        throw new TypeError("bootstrapState is invalid");
      }
      if (!Array.isArray(page.records)) {
        throw new TypeError("records must be an array");
      }
      const records = await Promise.all(page.records.map((record) => {
        const serialized = validateAndSerializeRecord(
          record,
          actorId,
          page.workspaceId,
        );
        if (serialized.record.syncState !== "synced") {
          throw new TypeError("canonical page records must be synced");
        }
        return encoded(serialized);
      }));
      const scope = legacyScope(page.workspaceId, records[0]?.record.kind);
      if (records.some(({ record }) => LEGACY_DOMAINS[record.kind] !== scope.domainId)) throw new TypeError("legacy page spans domains");

      if (page.canCommit && !page.canCommit()) return false;
      try {
        await database.transaction(async () => {
          for (const record of records) {
            await database.run(APPLY_CANONICAL_RECORD, [...scopeParameters(scope), ...recordParameters(record).slice(1)]);
          }
          await database.run(
            `INSERT INTO sync_cursors (
              workspace_id, domain_id, authorization_epoch, cursor, last_successful_sync_at, bootstrap_state, completeness, generation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(workspace_id, domain_id, authorization_epoch) DO UPDATE SET
              cursor = excluded.cursor,
              last_successful_sync_at = excluded.last_successful_sync_at,
              bootstrap_state = excluded.bootstrap_state`,
            [...scopeParameters(scope), page.cursor, page.syncedAt, page.bootstrapState, page.bootstrapState === "complete" ? "complete" : "partial", "legacy-api"],
          );
          await database.run(
            `INSERT INTO sync_meta (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            [LAST_SUCCESSFUL_WORKSPACE_KEY, page.workspaceId],
          );
          // 取消检查放在事务最后：整页要么带着游标一起提交，要么整体回滚。
          if (page.canCommit && !page.canCommit()) {
            throw new LocalSyncPageSupersededError();
          }
        });
        return true;
      } catch (error) {
        if (error instanceof LocalSyncPageSupersededError) return false;
        throw error;
      }
    },

    /** Domain-scoped cursor (v2): read directly under an explicit, bound scope. */
    async getScopeCursor(value: ReadScope): Promise<LocalSyncCursor | null> {
      const scope = assertScope(value);
      const row = await database.get<SyncCursorRow>(
        `SELECT workspace_id, cursor, last_successful_sync_at, bootstrap_state, generation, high_watermark
         FROM sync_cursors WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ?`,
        scopeParameters(scope),
      );
      return row
        ? { workspaceId: row.workspace_id, cursor: row.cursor, lastSyncedAt: row.last_successful_sync_at, bootstrapState: row.bootstrap_state, generation: row.generation ?? null, highWatermark: row.high_watermark ?? null }
        : null;
    },

    /** A manifest proved the domain unchanged: the complete cursor is fresh as of now without a page. */
    async confirmScopeCursor(value: ReadScope, syncedAt: string): Promise<boolean> {
      const scope = assertScope(value);
      assertNonEmptyString(syncedAt, "syncedAt");
      const result = await database.run(
        `UPDATE sync_cursors SET last_successful_sync_at = ?
         WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ? AND bootstrap_state = 'complete' AND high_watermark IS NOT NULL`,
        [syncedAt, ...scopeParameters(scope)],
      );
      return result.changes === 1;
    },

    async rememberWorkspace(workspaceId: string): Promise<void> {
      assertNonEmptyString(workspaceId, "workspaceId");
      await database.run(
        `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [LAST_SUCCESSFUL_WORKSPACE_KEY, workspaceId],
      );
    },

    /** The last server-issued lease, kept with the mirror so an offline cold start can rebind its scopes. */
    async getLease(): Promise<unknown | null> {
      const row = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [OFFLINE_READ_LEASE_KEY]);
      if (!row) return null;
      try { return JSON.parse(row.value) as unknown; } catch { return null; }
    },

    async setLease(envelope: unknown | null): Promise<void> {
      if (envelope === null) {
        await database.run("DELETE FROM sync_meta WHERE key = ?", [OFFLINE_READ_LEASE_KEY]);
        return;
      }
      await database.run(
        `INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [OFFLINE_READ_LEASE_KEY, JSON.stringify(envelope)],
      );
    },

    /**
     * Sprint 0118: the AI sessions this device opened, most recent first. Their
     * messages sync (sync domain ai-session-messages names them); the rest stay
     * on the server.
     */
    async getOpenedAiSessions(workspaceId: string): Promise<string[]> {
      assertNonEmptyString(workspaceId, "workspaceId");
      const row = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [aiOpenedKey(workspaceId)]);
      if (!row) return [];
      try {
        const parsed = JSON.parse(row.value) as unknown;
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 160).slice(0, AI_OPENED_SESSION_LIMIT) : [];
      } catch { return []; }
    },

    /**
     * Opening a session moves it to the front. Beyond AI_OPENED_SESSION_LIMIT the
     * least recently opened one is evicted: its message rows and cached cards
     * are deleted from the device (the server stops sending it).
     */
    async openAiSession(workspaceId: string, sessionId: string): Promise<{ opened: string[]; evicted: string[]; added: boolean }> {
      assertNonEmptyString(sessionId, "sessionId");
      if (sessionId.length > 160) throw new TypeError("sessionId is invalid");
      const current = await this.getOpenedAiSessions(workspaceId);
      const next = [sessionId, ...current.filter((id) => id !== sessionId)];
      const opened = next.slice(0, AI_OPENED_SESSION_LIMIT);
      const evicted = next.slice(AI_OPENED_SESSION_LIMIT);
      const added = !current.includes(sessionId);
      if (current.length === opened.length && current.every((id, index) => id === opened[index])) return { opened, evicted, added };
      await database.transaction(async () => {
        await database.run(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [aiOpenedKey(workspaceId), JSON.stringify(opened)]);
        if (evicted.length) await deleteAiSessionRows(workspaceId, evicted);
      });
      return { opened, evicted, added };
    },

    /** Sprint 0118: the cards of an opened session's last online page read, for offline display (encoded like payloads). */
    async setAiSessionCards(workspaceId: string, sessionId: string, cards: unknown): Promise<void> {
      if (!(await this.getOpenedAiSessions(workspaceId)).includes(sessionId)) return;
      const encodedCards = await codec.encode(serializeJson(cards, "cards"));
      await database.run(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [aiCardsKey(workspaceId, sessionId), encodedCards]);
    },

    async getAiSessionCards(workspaceId: string, sessionId: string): Promise<unknown | null> {
      assertNonEmptyString(workspaceId, "workspaceId");
      const row = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [aiCardsKey(workspaceId, sessionId)]);
      if (!row) return null;
      try { return JSON.parse(await codec.decode(row.value)) as unknown; } catch { return null; }
    },

    /**
     * Sprint 0131: the last successful online read of a registered page, stored
     * under the accepted lease binding (workspace, authorization epoch) and
     * encoded like payloads (AES-GCM per value in the browser). A response
     * larger than the copy's maxBytes is not kept (an older copy is removed, so
     * a page never shows an outdated copy as current). Each copy keeps its
     * maxVariants most recently saved variants.
     */
    async setPageCopy(binding: { workspaceId: string; authorizationEpoch: string }, id: string, variant: string, copy: PageCopy): Promise<boolean> {
      assertNonEmptyString(binding.workspaceId, "workspaceId");
      assertNonEmptyString(binding.authorizationEpoch, "authorizationEpoch");
      const definition = assertPageCopyKey(id, variant);
      assertTimestamp(copy.syncedAt, "syncedAt");
      const parsed = PLAIN_JSON.safeParse(copy.data);
      if (!parsed.success) throw new TypeError("page copy must be plain JSON");
      const serialized = JSON.stringify({ syncedAt: copy.syncedAt, data: parsed.data });
      const key = pageCopyKey(binding.workspaceId, binding.authorizationEpoch, id, variant);
      const indexKey = pageCopyIndexKey(binding.workspaceId, binding.authorizationEpoch, id);
      const indexRow = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [indexKey]);
      let index: string[] = [];
      try { const value = indexRow ? JSON.parse(indexRow.value) as unknown : []; index = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; } catch { index = []; }
      if (new TextEncoder().encode(serialized).byteLength > definition.maxBytes) {
        await database.transaction(async () => {
          await database.run("DELETE FROM sync_meta WHERE key = ?", [key]);
          await database.run(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [indexKey, JSON.stringify(index.filter((entry) => entry !== variant))]);
        });
        return false;
      }
      const next = [variant, ...index.filter((entry) => entry !== variant)];
      const kept = next.slice(0, definition.maxVariants);
      const evicted = next.slice(definition.maxVariants);
      const encodedCopy = await codec.encode(serialized);
      await database.transaction(async () => {
        await database.run(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [key, encodedCopy]);
        await database.run(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [indexKey, JSON.stringify(kept)]);
        for (const old of evicted) await database.run("DELETE FROM sync_meta WHERE key = ?", [pageCopyKey(binding.workspaceId, binding.authorizationEpoch, id, old)]);
      });
      return true;
    },

    async getPageCopy(binding: { workspaceId: string; authorizationEpoch: string }, id: string, variant: string): Promise<PageCopy | null> {
      assertPageCopyKey(id, variant);
      const row = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [pageCopyKey(binding.workspaceId, binding.authorizationEpoch, id, variant)]);
      if (!row) return null;
      try {
        const value = JSON.parse(await codec.decode(row.value)) as { syncedAt?: unknown; data?: unknown };
        return typeof value.syncedAt === "string" && "data" in value ? { syncedAt: value.syncedAt, data: value.data } : null;
      } catch { return null; }
    },

    /** Sprint 0131: drop every page copy not bound to (workspaceId, keepAuthorizationEpoch); a revoked lease keeps none. */
    async retirePageCopies(keep: { workspaceId: string; authorizationEpoch: string } | null): Promise<number> {
      const rows = await database.all<{ key: string }>("SELECT key FROM sync_meta WHERE substr(key, 1, ?) = ? OR substr(key, 1, ?) = ?", [PAGE_COPY_PREFIX.length, PAGE_COPY_PREFIX, PAGE_COPY_INDEX_PREFIX.length, PAGE_COPY_INDEX_PREFIX]);
      let removed = 0;
      await database.transaction(async () => {
        for (const row of rows) {
          let binding: unknown;
          try { binding = JSON.parse(row.key.slice(row.key.startsWith(PAGE_COPY_INDEX_PREFIX) ? PAGE_COPY_INDEX_PREFIX.length : PAGE_COPY_PREFIX.length)); } catch { binding = null; }
          const bound = Array.isArray(binding) && keep !== null && binding[0] === keep.workspaceId && binding[1] === keep.authorizationEpoch;
          if (bound) continue;
          await database.run("DELETE FROM sync_meta WHERE key = ?", [row.key]);
          if (row.key.startsWith(PAGE_COPY_PREFIX)) removed += 1;
        }
      });
      return removed;
    },

    /** Sprint 0118: which partitions (opened sessions) the scope's last complete walk named. */
    async getPartitionKey(value: ReadScope): Promise<string | null> {
      const scope = assertScope(value);
      return (await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = ?", [partitionKeyOf(scope)]))?.value ?? null;
    },

    async setPartitionKey(value: ReadScope, key: string): Promise<void> {
      const scope = assertScope(value);
      await database.run(`INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [partitionKeyOf(scope), key]);
    },

    async getLastWorkspaceId(): Promise<string | null> {
      const row = await database.get<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = ?",
        [LAST_SUCCESSFUL_WORKSPACE_KEY],
      );
      return row && row.value.trim().length > 0 ? row.value : null;
    },

    // 整个 workspace 重新 bootstrap（不是撤权）：清掉已同步的 canonical 行、游标和
    // v2 的派生索引/资源清单，保留 pending/conflict 与 outbox；不改 local_read_scope_state，
    // 下一次 applyPage 会重新把作用域标为可读。
    async resetWorkspace(
      workspaceId: string,
      canCommit?: () => boolean,
    ): Promise<boolean> {
      assertNonEmptyString(workspaceId, "workspaceId");
      if (canCommit && !canCommit()) return false;
      try {
        await database.transaction(async () => {
          await database.run(
            `DELETE FROM sync_records
             WHERE workspace_id = ? AND sync_state = 'synced'`,
            [workspaceId],
          );
          await database.run(
            "DELETE FROM sync_cursors WHERE workspace_id = ?",
            [workspaceId],
          );
          await database.run(
            "DELETE FROM local_read_index WHERE workspace_id = ?",
            [workspaceId],
          );
          await database.run(
            "DELETE FROM local_read_assets WHERE workspace_id = ?",
            [workspaceId],
          );
          if (canCommit && !canCommit()) {
            throw new LocalSyncPageSupersededError();
          }
        });
        return true;
      } catch (error) {
        if (error instanceof LocalSyncPageSupersededError) return false;
        throw error;
      }
    },

    async getRecord(key: LocalSyncRecordKey): Promise<SyncRecord | null> {
      validateRecordKey(key);
      const scope = legacyScope(key.workspaceId, key.kind);
      if (!(await isReadable(scope))) return null;
      const row = await database.get<SyncRecordRow>(
        `SELECT workspace_id, kind, record_id, revision, updated_at, deleted_at,
                payload_json, sync_state, ai_visibility
         FROM sync_records
         WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ? AND kind = ? AND record_id = ? AND visible=1`,
        [...scopeParameters(scope), key.kind, key.id],
      );
      assertScope(scope);
      return row ? recordFromStoredRow(row) : null;
    },

    async listRecords(
      query: ListLocalSyncRecordsInput,
    ): Promise<SyncRecord[]> {
      assertNonEmptyString(query.workspaceId, "workspaceId");
      assertSyncEntityKind(query.kind);
      const scope = legacyScope(query.workspaceId, query.kind);
      if (!(await isReadable(scope))) return [];
      const deletedPredicate = query.includeDeleted
        ? ""
        : " AND deleted_at IS NULL";
      const rows = await database.all<SyncRecordRow>(
        `SELECT workspace_id, kind, record_id, revision, updated_at, deleted_at,
                payload_json, sync_state, ai_visibility
         FROM sync_records
         WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ? AND kind = ? AND visible=1${deletedPredicate}`,
        [...scopeParameters(scope), query.kind],
      );
      assertScope(scope);
      return (await Promise.all(rows.map((row) => recordFromStoredRow(row))))
        .sort(
          (left, right) =>
            compareSyncTimestamps(right.updatedAt, left.updatedAt) ||
            compareOpaqueStrings(left.id, right.id),
        );
    },

    /**
     * Sprint 0131: the named rows of one kind (at most 200), for pages the device reads by row id — a
     * relationship conversation's messages are `${conversationId}/${seq}`, so one page is one sequence
     * range — instead of loading and decoding the whole domain.
     */
    async listRecordsByIds(query: { workspaceId: string; kind: SyncEntityKind; ids: readonly string[] }): Promise<SyncRecord[]> {
      assertNonEmptyString(query.workspaceId, "workspaceId");
      assertSyncEntityKind(query.kind);
      if (query.ids.length > 200) throw new TypeError("row id reads take at most 200 ids");
      if (query.ids.length === 0) return [];
      for (const id of query.ids) assertNonEmptyString(id, "id");
      const scope = legacyScope(query.workspaceId, query.kind);
      if (!(await isReadable(scope))) return [];
      const rows = await database.all<SyncRecordRow>(
        `SELECT workspace_id, kind, record_id, revision, updated_at, deleted_at,
                payload_json, sync_state, ai_visibility
         FROM sync_records
         WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ? AND kind = ? AND visible=1 AND deleted_at IS NULL
           AND record_id IN (${query.ids.map(() => "?").join(", ")})`,
        [...scopeParameters(scope), query.kind, ...query.ids],
      );
      assertScope(scope);
      return Promise.all(rows.map((row) => recordFromStoredRow(row)));
    },

    async getCursor(workspaceId: string): Promise<LocalSyncCursor | null> {
      assertNonEmptyString(workspaceId, "workspaceId");
      const scope = legacyScope(workspaceId);
      const row = await database.get<SyncCursorRow>(
        `SELECT workspace_id, cursor, last_successful_sync_at, bootstrap_state
         FROM sync_cursors WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ?`,
        scopeParameters(scope),
      );
      assertScope(scope);
      return row
        ? {
            workspaceId: row.workspace_id,
            cursor: row.cursor,
            lastSyncedAt: row.last_successful_sync_at,
            bootstrapState: row.bootstrap_state,
            generation: null,
            highWatermark: null,
          }
        : null;
    },

    /**
     * Epoch rotation: every mirror row, cursor, index and readable flag issued under
     * another authorization epoch of this domain is dropped so the next pull is a
     * full rebuild. Local pending/conflicted evidence is kept, as in resetDomain.
     */
    async retireEpochs(workspaceId: string, domainId: string, keepAuthorizationEpoch: string): Promise<number> {
      assertNonEmptyString(workspaceId, "workspaceId");
      assertNonEmptyString(domainId, "domainId");
      assertNonEmptyString(keepAuthorizationEpoch, "authorizationEpoch");
      if (!registered.has(domainId)) throw new TypeError("domain is not registered");
      let retired = 0;
      await database.transaction(async () => {
        for (const table of ["sync_records", "sync_cursors", "local_read_assets", "local_read_index", "local_read_scope_state"]) {
          const canonical = table === "sync_records" ? " AND sync_state='synced'" : "";
          const result = await database.run(
            `DELETE FROM ${table} WHERE workspace_id=? AND domain_id=? AND authorization_epoch<>?${canonical}`,
            [workspaceId, domainId, keepAuthorizationEpoch],
          );
          if (table === "sync_records") retired = result.changes;
        }
        if (domainId === AI_MESSAGES_DOMAIN) {
          // Sprint 0118: another epoch's partition key means nothing now; a retired epoch takes its cached cards with it.
          await database.run(`DELETE FROM sync_meta WHERE key LIKE ? AND key <> ?`, [`sync_partitions:${workspaceId}:${domainId}:%`, `sync_partitions:${workspaceId}:${domainId}:${keepAuthorizationEpoch}`]);
          if (retired > 0) await database.run(`DELETE FROM sync_meta WHERE key LIKE ?`, [`ai_session_cards:${workspaceId}:%`]);
        }
      });
      return retired;
    },

    async resetDomain(value: ReadScope): Promise<void> {
      const scope = assertScope(value);
      await database.transaction(async () => {
        for (const table of ["sync_records", "sync_cursors", "local_read_assets", "local_read_index"]) {
          const canonical = table === "sync_records" ? " AND sync_state='synced'" : "";
          await database.run(`DELETE FROM ${table} WHERE workspace_id=? AND domain_id=? AND authorization_epoch=?${canonical}`, scopeParameters(scope));
        }
        await database.run(`INSERT INTO local_read_scope_state VALUES(?,?,?,0) ON CONFLICT(workspace_id,domain_id,authorization_epoch) DO UPDATE SET readable=0`, scopeParameters(scope));
        await database.run("DELETE FROM sync_meta WHERE key = ?", [partitionKeyOf(scope)]);
      });
    },

    async applyDomainPage(value: ReadScope, inputPage: DomainPage): Promise<void> {
      const scope = assertScope(value);
      const page = domainPageSchema.parse(inputPage);
      if (page.domainId !== scope.domainId || page.authorizationEpoch !== scope.authorizationEpoch) throw new TypeError("page scope mismatch");
      const changes = await Promise.all(page.changes.map(async change => {
        if ((change.operation === "upsert") !== (change.payload !== null)) throw new TypeError("change payload does not match operation");
        const json = change.payload === null ? null : JSON.stringify(PLAIN_JSON.parse(change.payload));
        const hash = json === null ? null : await input.hashPayload?.(json);
        if (json !== null && (!hash || !/^[a-f0-9]{64}$/u.test(hash))) throw new TypeError("payload SHA256 is unavailable");
        // The hash covers the plaintext; only the stored column is encoded.
        return { ...change, json: json === null ? null : await codec.encode(json), hash };
      }));
      assertScope(scope); // Hashing may await while the caller revokes a scope.
      await database.transaction(async () => {
        for (const change of changes) {
          if (change.operation !== "upsert") {
            // Preserve pending/conflict evidence while removing its readable overlay.
            await database.run(`UPDATE sync_records SET visible=0 WHERE workspace_id=? AND domain_id=? AND authorization_epoch=? AND record_id=?`, [...scopeParameters(scope), change.id]);
            await database.run(`DELETE FROM sync_records WHERE workspace_id=? AND domain_id=? AND authorization_epoch=? AND record_id=? AND sync_state='synced'`, [...scopeParameters(scope), change.id]);
            await database.run(`DELETE FROM local_read_index WHERE workspace_id=? AND domain_id=? AND authorization_epoch=? AND record_id=?`, [...scopeParameters(scope), change.id]);
            await database.run(`DELETE FROM local_read_assets WHERE workspace_id=? AND domain_id=? AND authorization_epoch=? AND record_id=?`, [...scopeParameters(scope), change.id]);
            if (scope.domainId === RELATIONSHIP_CONVERSATIONS_DOMAIN) {
              // The member row left (revocation): every message of the conversation leaves this device in the same transaction, in every epoch.
              const prefix = `${change.id}/`;
              for (const table of ["sync_records", "local_read_index", "local_read_assets"]) {
                await database.run(`DELETE FROM ${table} WHERE workspace_id=? AND domain_id=? AND substr(record_id, 1, ?)=?`, [scope.workspaceId, RELATIONSHIP_MESSAGES_DOMAIN, prefix.length, prefix]);
              }
            }
          } else {
            const kind = Object.entries(LEGACY_DOMAINS).find(([, domain]) => domain === scope.domainId)?.[0] ?? scope.domainId;
            await database.run(`INSERT INTO sync_records(workspace_id,domain_id,authorization_epoch,kind,record_id,revision,updated_at,payload_json,sync_state,ai_visibility,schema_version,payload_hash,generation)
              VALUES(?,?,?,?,?,?,?,?,'synced','excluded',?,?,?)
              ON CONFLICT(workspace_id,domain_id,authorization_epoch,record_id) DO UPDATE SET
              revision=excluded.revision,updated_at=excluded.updated_at,payload_json=excluded.payload_json,schema_version=excluded.schema_version,payload_hash=excluded.payload_hash,generation=excluded.generation,deleted_at=NULL,visible=1
              WHERE sync_records.sync_state NOT IN ('pending','conflicted') AND sync_records.revision<>excluded.revision`,
            [...scopeParameters(scope), kind, change.id, change.revision, page.serverTime, change.json, page.schemaVersion, change.hash!, page.generation]);
            await database.run(`UPDATE sync_records SET generation=? WHERE workspace_id=? AND domain_id=? AND authorization_epoch=? AND record_id=? AND revision=? AND sync_state='synced'`,
              [page.generation, ...scopeParameters(scope), change.id, change.revision]);
          }
        }
        await database.run(`INSERT INTO sync_cursors(workspace_id,domain_id,authorization_epoch,cursor,last_successful_sync_at,bootstrap_state,completeness,generation,high_watermark)
          VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,domain_id,authorization_epoch) DO UPDATE SET cursor=excluded.cursor,last_successful_sync_at=excluded.last_successful_sync_at,bootstrap_state=excluded.bootstrap_state,completeness=excluded.completeness,generation=excluded.generation,high_watermark=excluded.high_watermark`,
        [...scopeParameters(scope), page.nextCursor, page.serverTime, page.hasMore ? "pending" : "complete", page.hasMore ? "partial" : "complete", page.generation, page.highWatermark]);
        await database.run(`INSERT INTO local_read_scope_state VALUES(?,?,?,1) ON CONFLICT(workspace_id,domain_id,authorization_epoch) DO UPDATE SET readable=1`, scopeParameters(scope));
        assertScope(scope); // Roll back if revocation races the transaction.
      });
    },

    async enqueueOutboxMutation(
      mutation: LocalSyncOutboxMutation,
      options: { notify?: boolean } = {},
    ): Promise<void> {
      const patchJson = validateAndSerializeOutboxMutation(mutation, actorId);
      if (mutation.requestAttemptedAt !== undefined && mutation.requestAttemptedAt !== null) {
        assertTimestamp(mutation.requestAttemptedAt, "requestAttemptedAt");
      }
      await database.transaction(async () => {
        const domainId = mutation.domainId ?? localDomainForKind(mutation.kind);
        // Task and personal-schedule writes are never merged (each keeps its own receipt and server version).
        const unattempted = domainId === "tasks" || domainId === "personal-schedule" ? [] : await database.all<{
          mutation_id: string;
          operation: LocalSyncOutboxOperation;
          patch_json: string | null;
          request_json: string | null;
          base_revision: string | null;
        }>(`SELECT mutation_id, operation, patch_json, request_json, base_revision
            FROM sync_outbox
            WHERE workspace_id = ? AND domain_id = ? AND kind = ? AND record_id = ?
              AND state = 'queued' AND attempt_count = 0
              AND first_attempt_at IS NULL
            ORDER BY created_at ASC, mutation_id ASC LIMIT 1`,
        [mutation.workspaceId, domainId, mutation.kind, mutation.id]);
        const prior = unattempted[0];
        if (prior) {
          if (prior.operation === "create" && mutation.operation === "delete") {
            await database.run(`UPDATE sync_outbox SET state = 'failed', depends_on = NULL,
              next_retry_at = NULL, last_error_code = 'DEPENDENCY_CANCELLED'
              WHERE workspace_id = ? AND domain_id = ? AND depends_on = ?`,
            [mutation.workspaceId, domainId, prior.mutation_id]);
            await database.run("DELETE FROM sync_outbox WHERE mutation_id = ?", [prior.mutation_id]);
            return;
          }
          const operation = prior.operation === "create" && mutation.operation === "update"
            ? "create"
            : mutation.operation;
          const mergedPatch = mergeOutboxPatches(prior.patch_json, patchJson);
          const coalescedNoteCreate = domainId === "notes" && prior.operation === "create" && mutation.operation === "update" &&
            prior.request_json !== null && mutation.requestJson !== undefined && mutation.requestJson !== null;
          const coalescedNoteUpdate = domainId === "notes" && prior.operation === "update" && mutation.operation === "update" &&
            prior.request_json !== null && mutation.requestJson !== undefined && mutation.requestJson !== null;
          const mergeId = coalescedNoteCreate ? prior.mutation_id : mutation.requestJson ? mutation.mutationId : prior.mutation_id;
          let requestJson = mutation.requestJson ?? prior.request_json;
          if (coalescedNoteCreate) {
            const createBody: unknown = JSON.parse(prior.request_json!);
            const updateBody: unknown = JSON.parse(mutation.requestJson!);
            if (!isRecord(createBody) || !isRecord(updateBody) || createBody.idempotencyKey !== prior.mutation_id || updateBody.idempotencyKey !== mutation.mutationId) {
              throw new TypeError("note create request receipt does not match its queued mutation");
            }
            const mergedRequest: Record<string, unknown> = { ...createBody, ...updateBody, idempotencyKey: prior.mutation_id };
            delete mergedRequest.expectedVersion;
            requestJson = JSON.stringify(mergedRequest);
          } else if (coalescedNoteUpdate) {
            const firstRequest: unknown = JSON.parse(prior.request_json!);
            const latestRequest: unknown = JSON.parse(mutation.requestJson!);
            if (!isRecord(firstRequest) || !isRecord(latestRequest) ||
                firstRequest.idempotencyKey !== prior.mutation_id || latestRequest.idempotencyKey !== mutation.mutationId ||
                !Number.isSafeInteger(firstRequest.expectedVersion) || Number(firstRequest.expectedVersion) < 1 ||
                !Number.isSafeInteger(latestRequest.expectedVersion) || Number(latestRequest.expectedVersion) < 1) {
              throw new TypeError("note update request receipt or version does not match its queued mutation");
            }
            const mergedRequest: Record<string, unknown> = {
              ...firstRequest,
              ...latestRequest,
              expectedVersion: firstRequest.expectedVersion,
              idempotencyKey: mergeId,
            };
            requestJson = JSON.stringify(mergedRequest);
          }
          const dependsOn = mutation.dependsOn ?? null;
          if (mergeId !== prior.mutation_id) {
            await database.run("UPDATE sync_outbox SET depends_on = ? WHERE depends_on = ?", [mergeId, prior.mutation_id]);
          }
          await database.run(`UPDATE sync_outbox
            SET mutation_id = ?, operation = ?, patch_json = ?, request_json = ?,
              depends_on = COALESCE(depends_on, ?)
            WHERE mutation_id = ?`, [mergeId, operation, mergedPatch, requestJson, dependsOn, prior.mutation_id]);
          return;
        }
        await database.run(
          `INSERT INTO sync_outbox (
            mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
            patch_json, request_json, depends_on, base_revision, created_at,
            retry_count, next_retry_at, last_error_code, attempt_count, first_attempt_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(mutation_id) DO NOTHING`,
          [
            mutation.mutationId,
            mutation.workspaceId,
            domainId,
            mutation.kind,
            mutation.id,
            mutation.operation,
            patchJson,
            mutation.requestJson ?? null,
            mutation.dependsOn ?? null,
            mutation.baseRevision,
            mutation.createdAt,
            mutation.retryCount + (mutation.requestAttemptedAt ? 1 : 0),
            mutation.nextRetryAt,
            mutation.lastErrorCode ?? (mutation.requestAttemptedAt ? "NETWORK_ERROR" : null),
            mutation.requestAttemptedAt ? 1 : 0,
            mutation.requestAttemptedAt ?? null,
          ],
        );
      });
      if (options.notify !== false) await input.onOutboxQueued?.();
    },

    async beginOutboxMutationAttempt(input: {
      mutationId: string;
      attemptedAt: string;
    }): Promise<LocalSyncQueuedMutation | null> {
      assertNonEmptyString(input.mutationId, "mutationId");
      assertTimestamp(input.attemptedAt, "attemptedAt");
      return database.transaction(async () => {
        const current = await database.get<SyncQueuedMutationRow>(`SELECT
          mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
          request_json, depends_on, patch_json, base_revision, created_at, retry_count,
          next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
          FROM sync_outbox WHERE mutation_id = ?`, [input.mutationId]);
        if (!current || current.state !== "queued") return null;
        if (current.request_json === null) throw new Error("OUTBOX_REQUEST_MISSING");
        const claimed = await database.run(`UPDATE sync_outbox SET
          state = 'sending', attempt_count = attempt_count + 1,
          retry_count = retry_count + 1,
          first_attempt_at = COALESCE(first_attempt_at, ?)
          WHERE mutation_id = ? AND state = 'queued'`,
        [input.attemptedAt, input.mutationId]);
        if (claimed.changes !== 1) return null;
        const row = await database.get<SyncQueuedMutationRow>(`SELECT
          mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
          request_json, depends_on, patch_json, base_revision, created_at, retry_count,
          next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
          FROM sync_outbox WHERE mutation_id = ?`, [input.mutationId]);
        if (!row) return null;
        return {
          actorId,
          workspaceId: row.workspace_id,
          domainId: row.domain_id,
          mutationId: row.mutation_id,
          kind: row.kind,
          id: row.record_id,
          operation: row.operation,
          patch: row.patch_json === null ? null : JSON.parse(row.patch_json),
          requestJson: row.request_json,
          baseRevision: row.base_revision,
          dependsOn: row.depends_on,
          createdAt: row.created_at,
          retryCount: row.retry_count,
          nextRetryAt: row.next_retry_at,
          lastErrorCode: row.last_error_code,
          state: row.state,
          attemptCount: row.attempt_count,
          firstAttemptAt: row.first_attempt_at,
          serverSnapshot: row.server_snapshot_json === null ? null : JSON.parse(row.server_snapshot_json),
        };
      });
    },

    /** A process can die after claiming a row but before receiving a response; replay its frozen bytes on the next scope. */
    async recoverInterruptedOutboxAttempts(): Promise<number> {
      const recovered = await database.run(`UPDATE sync_outbox SET
        state = 'queued', next_retry_at = NULL,
        last_error_code = COALESCE(last_error_code, 'UPLOAD_INTERRUPTED')
        WHERE state = 'sending'`);
      return recovered.changes;
    },

    async markOutboxMutationFailure(input: {
      mutationId: string;
      state: "queued" | "conflict" | "failed";
      nextRetryAt: string | null;
      errorCode: string;
      serverSnapshot?: unknown;
    }): Promise<void> {
      assertNonEmptyString(input.mutationId, "mutationId");
      assertNullableTimestamp(input.nextRetryAt, "nextRetryAt");
      assertNonEmptyString(input.errorCode, "errorCode");
      const snapshotJson = input.serverSnapshot === undefined
        ? null
        : serializeJson(input.serverSnapshot, "serverSnapshot");
      await database.run(`UPDATE sync_outbox SET
        state = ?, next_retry_at = ?, last_error_code = ?, server_snapshot_json = ?
        WHERE mutation_id = ?`, [
        input.state,
        input.state === "queued" ? input.nextRetryAt : null,
        input.errorCode,
        snapshotJson,
        input.mutationId,
      ]);
    },

    /** Resolve one notes conflict without ever rewriting its attempted request in place. */
    async resolveNoteConflict(input: {
      workspaceId: string;
      mutationId: string;
      resolution: "server" | "replace";
      replacement?: LocalSyncOutboxMutation;
    }): Promise<void> {
      assertNonEmptyString(input.workspaceId, "workspaceId");
      assertNonEmptyString(input.mutationId, "mutationId");
      if (input.resolution === "replace" && !input.replacement) throw new TypeError("replacement note mutation is required");
      if (input.resolution === "server" && input.replacement) throw new TypeError("server resolution cannot include a replacement");
      const replacement = input.replacement;
      const patchJson = replacement ? validateAndSerializeOutboxMutation(replacement, actorId) : null;
      const replacementRequestJson = replacement?.requestJson;
      if (replacement && (replacement.workspaceId !== input.workspaceId || replacement.domainId !== "notes" ||
          replacement.kind !== "note" || (replacement.operation !== "create" && replacement.operation !== "update") ||
          replacement.mutationId === input.mutationId || replacementRequestJson === undefined || replacementRequestJson === null ||
          replacement.requestAttemptedAt)) {
        throw new TypeError("replacement note mutation is invalid");
      }
      await database.transaction(async () => {
        const conflict = await database.get<{ workspace_id: string; domain_id: string; kind: SyncEntityKind; state: string }>(
          "SELECT workspace_id, domain_id, kind, state FROM sync_outbox WHERE mutation_id = ?", [input.mutationId],
        );
        if (!conflict || conflict.workspace_id !== input.workspaceId || conflict.domain_id !== "notes" || conflict.kind !== "note" || conflict.state !== "conflict") {
          throw new Error("NOTE_CONFLICT_NOT_FOUND");
        }
        if (replacement) {
          if (replacement.actorId !== actorId) throw new TypeError("replacement note mutation is outside the actor scope");
          await database.run(`INSERT INTO sync_outbox (
            mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
            patch_json, request_json, depends_on, base_revision, created_at,
            retry_count, next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
          ) VALUES (?, ?, 'notes', 'note', ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`, [
            replacement.mutationId, replacement.workspaceId, replacement.id, replacement.operation, patchJson,
            replacementRequestJson!, replacement.dependsOn ?? null, replacement.baseRevision, replacement.createdAt,
            replacement.retryCount, replacement.nextRetryAt,
          ]);
          await database.run("UPDATE sync_outbox SET depends_on = ? WHERE workspace_id = ? AND domain_id = 'notes' AND depends_on = ?",
            [replacement.mutationId, input.workspaceId, input.mutationId]);
          await database.run("DELETE FROM sync_outbox WHERE mutation_id = ?", [input.mutationId]);
          return;
        }
        await database.run(`WITH RECURSIVE dependent_mutations(mutation_id) AS (
          SELECT ?
          UNION
          SELECT queued.mutation_id FROM sync_outbox AS queued
          JOIN dependent_mutations AS dependency ON queued.depends_on = dependency.mutation_id
        ) DELETE FROM sync_outbox WHERE mutation_id IN (SELECT mutation_id FROM dependent_mutations)`, [input.mutationId]);
      });
    },

    /** Replace or discard one task conflict without mutating an attempted request. */
    async resolveTaskConflict(input: {
      workspaceId: string;
      mutationId: string;
      resolution: "server" | "replace";
      replacement?: LocalSyncOutboxMutation;
    }): Promise<void> {
      assertNonEmptyString(input.workspaceId, "workspaceId");
      assertNonEmptyString(input.mutationId, "mutationId");
      if (input.resolution === "replace" && !input.replacement) throw new TypeError("replacement task mutation is required");
      if (input.resolution === "server" && input.replacement) throw new TypeError("server resolution cannot include a replacement");
      const replacement = input.replacement;
      const patchJson = replacement ? validateAndSerializeOutboxMutation(replacement, actorId) : null;
      if (replacement && (replacement.actorId !== actorId || replacement.workspaceId !== input.workspaceId || replacement.domainId !== "tasks" ||
          replacement.kind !== "task" || !["create", "update", "complete", "reopen", "cancel", "delete"].includes(replacement.operation) ||
          !replacement.requestJson || replacement.mutationId === input.mutationId || replacement.requestAttemptedAt)) {
        throw new TypeError("replacement task mutation is invalid");
      }
      await database.transaction(async () => {
        const conflict = await database.get<{ workspace_id: string; domain_id: string; kind: SyncEntityKind; state: string }>(
          "SELECT workspace_id, domain_id, kind, state FROM sync_outbox WHERE mutation_id = ?", [input.mutationId],
        );
        if (!conflict || conflict.workspace_id !== input.workspaceId || conflict.domain_id !== "tasks" || conflict.kind !== "task" || conflict.state !== "conflict") {
          throw new Error("TASK_CONFLICT_NOT_FOUND");
        }
        if (replacement) {
          await database.run(`INSERT INTO sync_outbox (
            mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
            patch_json, request_json, depends_on, base_revision, created_at,
            retry_count, next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
          ) VALUES (?, ?, 'tasks', 'task', ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`, [
            replacement.mutationId, replacement.workspaceId, replacement.id, replacement.operation, patchJson,
            replacement.requestJson!, replacement.dependsOn ?? null, replacement.baseRevision, replacement.createdAt,
            replacement.retryCount, replacement.nextRetryAt,
          ]);
          await database.run("UPDATE sync_outbox SET depends_on = ? WHERE workspace_id = ? AND domain_id = 'tasks' AND depends_on = ?",
            [replacement.mutationId, input.workspaceId, input.mutationId]);
          await database.run("DELETE FROM sync_outbox WHERE mutation_id = ?", [input.mutationId]);
          return;
        }
        await database.run(`WITH RECURSIVE dependent_mutations(mutation_id) AS (
          SELECT ?
          UNION
          SELECT queued.mutation_id FROM sync_outbox AS queued JOIN dependent_mutations AS dependency ON queued.depends_on = dependency.mutation_id
        ) DELETE FROM sync_outbox WHERE mutation_id IN (SELECT mutation_id FROM dependent_mutations)`, [input.mutationId]);
      });
    },

    /** Sprint 0134: replace or discard one personal-schedule conflict without mutating an attempted request. */
    async resolveScheduleConflict(input: {
      workspaceId: string;
      mutationId: string;
      resolution: "server" | "replace";
      replacement?: LocalSyncOutboxMutation;
    }): Promise<void> {
      assertNonEmptyString(input.workspaceId, "workspaceId");
      assertNonEmptyString(input.mutationId, "mutationId");
      if (input.resolution === "replace" && !input.replacement) throw new TypeError("replacement schedule mutation is required");
      if (input.resolution === "server" && input.replacement) throw new TypeError("server resolution cannot include a replacement");
      const replacement = input.replacement;
      const patchJson = replacement ? validateAndSerializeOutboxMutation(replacement, actorId) : null;
      if (replacement && (replacement.actorId !== actorId || replacement.workspaceId !== input.workspaceId || replacement.domainId !== "personal-schedule" ||
          replacement.kind !== "personal_schedule" || !["update", "delete"].includes(replacement.operation) ||
          !replacement.requestJson || replacement.mutationId === input.mutationId || replacement.requestAttemptedAt)) {
        throw new TypeError("replacement schedule mutation is invalid");
      }
      await database.transaction(async () => {
        const conflict = await database.get<{ workspace_id: string; domain_id: string; kind: SyncEntityKind; state: string; record_id: string }>(
          "SELECT workspace_id, domain_id, kind, state, record_id FROM sync_outbox WHERE mutation_id = ?", [input.mutationId],
        );
        if (!conflict || conflict.workspace_id !== input.workspaceId || conflict.domain_id !== "personal-schedule" || conflict.kind !== "personal_schedule" ||
            conflict.state !== "conflict" || (replacement && replacement.id !== conflict.record_id)) {
          throw new Error("SCHEDULE_CONFLICT_NOT_FOUND");
        }
        if (replacement) {
          await database.run(`INSERT INTO sync_outbox (
            mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
            patch_json, request_json, depends_on, base_revision, created_at,
            retry_count, next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
          ) VALUES (?, ?, 'personal-schedule', 'personal_schedule', ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL)`, [
            replacement.mutationId, replacement.workspaceId, replacement.id, replacement.operation, patchJson,
            replacement.requestJson!, replacement.dependsOn ?? null, replacement.baseRevision, replacement.createdAt,
            replacement.retryCount, replacement.nextRetryAt,
          ]);
          await database.run("UPDATE sync_outbox SET depends_on = ? WHERE workspace_id = ? AND domain_id = 'personal-schedule' AND depends_on = ?",
            [replacement.mutationId, input.workspaceId, input.mutationId]);
          await database.run("DELETE FROM sync_outbox WHERE mutation_id = ?", [input.mutationId]);
          return;
        }
        await database.run(`WITH RECURSIVE dependent_mutations(mutation_id) AS (
          SELECT ?
          UNION
          SELECT queued.mutation_id FROM sync_outbox AS queued JOIN dependent_mutations AS dependency ON queued.depends_on = dependency.mutation_id
        ) DELETE FROM sync_outbox WHERE mutation_id IN (SELECT mutation_id FROM dependent_mutations)`, [input.mutationId]);
      });
    },

    /** Commit a successful upload, its local-id alias, and dependent request rewrites together. */
    async acknowledgeOutboxMutation(input: {
      mutationId: string;
      record: SyncRecord;
      localId?: string;
      acknowledgedAt: string;
    }): Promise<void> {
      assertNonEmptyString(input.mutationId, "mutationId");
      assertTimestamp(input.acknowledgedAt, "acknowledgedAt");
      const serialized = await encoded(validateAndSerializeRecord(input.record, actorId));
      if (serialized.record.syncState !== "synced") throw new TypeError("acknowledged record must be synced");

      await database.transaction(async () => {
        const mutation = await database.get<{ workspace_id: string; domain_id: string; kind: SyncEntityKind; record_id: string }>(
          "SELECT workspace_id, domain_id, kind, record_id FROM sync_outbox WHERE mutation_id = ?",
          [input.mutationId],
        );
        if (!mutation) throw new Error("OUTBOX_MUTATION_NOT_FOUND");
        const testOnlyDomain = testOnlyOutboxDomains.has(mutation.domain_id);
        if (mutation.workspace_id !== serialized.record.workspaceId || mutation.kind !== serialized.record.kind ||
          (!testOnlyDomain && mutation.domain_id !== LEGACY_DOMAINS[serialized.record.kind])) {
          throw new TypeError("acknowledged record does not match the queued mutation scope");
        }
        if (!testOnlyDomain) {
          const scope = legacyScope(mutation.workspace_id, mutation.kind);
          if (scope.domainId !== mutation.domain_id) throw new TypeError("queued mutation domain is not bound");
          await database.run(UPSERT_RECORD, [...scopeParameters(scope), ...recordParameters(serialized).slice(1)]);
        }
        const localId = input.localId ?? mutation.record_id;
        if (localId !== serialized.record.id) {
          assertNonEmptyString(localId, "localId");
          const expiresAt = new Date(Date.parse(input.acknowledgedAt) + OUTBOX_ALIAS_TTL_MS).toISOString();
          await database.run(`INSERT INTO sync_aliases(workspace_id, domain_id, local_id, canonical_id, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(workspace_id, domain_id, local_id) DO UPDATE SET
              canonical_id = excluded.canonical_id, created_at = excluded.created_at, expires_at = excluded.expires_at`,
          [mutation.workspace_id, mutation.domain_id, localId, serialized.record.id, input.acknowledgedAt, expiresAt]);
        }
        const dependents = await database.all<{ mutation_id: string; operation: LocalSyncOutboxOperation; patch_json: string | null; request_json: string | null }>(
          `SELECT mutation_id, operation, patch_json, request_json FROM sync_outbox
           WHERE workspace_id = ? AND domain_id = ? AND depends_on = ?`,
          [mutation.workspace_id, mutation.domain_id, input.mutationId],
        );
        for (const dependent of dependents) {
          const patchJson = dependent.patch_json === null ? null : JSON.stringify(rewriteExactIdentifier(JSON.parse(dependent.patch_json), localId, serialized.record.id));
          const rewritten = dependent.request_json === null ? null : rewriteExactIdentifier(JSON.parse(dependent.request_json), localId, serialized.record.id);
          let requestJson = rewritten === null ? null : JSON.stringify(rewritten);
          // Tasks and (sprint 0134) personal schedules: a dependent edit/delete of a just-created row adopts its formal id and server version.
          const isTaskDomain = (mutation.domain_id === "tasks" && mutation.kind === "task" && serialized.record.kind === "task") ||
            (mutation.domain_id === "personal-schedule" && mutation.kind === "personal_schedule" && serialized.record.kind === "personal_schedule");
          const taskPayload = serialized.record.payload;
          const taskUpdatedAt = isTaskDomain && typeof taskPayload === "object" && taskPayload !== null && !Array.isArray(taskPayload) &&
            typeof (taskPayload as Record<string, unknown>).updatedAt === "string"
            ? (taskPayload as Record<string, unknown>).updatedAt as string : null;
          if (isTaskDomain && rewritten !== null && typeof rewritten === "object" && !Array.isArray(rewritten)) {
            const request = rewritten as Record<string, unknown>;
            if ((dependent.operation === "update" || dependent.operation === "delete") && taskUpdatedAt) {
              request.expectedUpdatedAt = taskUpdatedAt;
            }
            requestJson = JSON.stringify(request);
          }
          await database.run(`UPDATE sync_outbox SET patch_json = ?, request_json = ?, depends_on = NULL,
            record_id = CASE WHEN ? THEN ? ELSE record_id END,
            base_revision = CASE WHEN ? THEN ? ELSE base_revision END WHERE mutation_id = ?`,
          [patchJson, requestJson, isTaskDomain ? 1 : 0, serialized.record.id, isTaskDomain ? 1 : 0, serialized.record.revision, dependent.mutation_id]);
        }
        if (localId !== serialized.record.id) {
          // Sprint 0134 (design step 4): an unsent write of another kind that links this temporary id (a schedule
          // linking an offline note) is rewritten to the formal id in the same transaction, before its first attempt.
          const linked = await database.all<{ mutation_id: string; patch_json: string | null; request_json: string }>(
            `SELECT mutation_id, patch_json, request_json FROM sync_outbox
             WHERE workspace_id = ? AND domain_id <> ? AND state = 'queued' AND attempt_count = 0 AND first_attempt_at IS NULL
               AND request_json IS NOT NULL AND instr(request_json, ?) > 0`,
            [mutation.workspace_id, mutation.domain_id, JSON.stringify(localId)],
          );
          for (const row of linked) {
            const patchJson = row.patch_json === null ? null : JSON.stringify(rewriteExactIdentifier(JSON.parse(row.patch_json), localId, serialized.record.id));
            const requestJson = JSON.stringify(rewriteExactIdentifier(JSON.parse(row.request_json), localId, serialized.record.id));
            await database.run("UPDATE sync_outbox SET patch_json = ?, request_json = ? WHERE mutation_id = ?", [patchJson, requestJson, row.mutation_id]);
          }
        }
        await database.run("DELETE FROM sync_outbox WHERE mutation_id = ?", [input.mutationId]);
      });
    },

    async resolveAlias(input: { workspaceId: string; domainId: string; localId: string; now: string }): Promise<string | null> {
      assertNonEmptyString(input.workspaceId, "workspaceId");
      assertNonEmptyString(input.domainId, "domainId");
      assertNonEmptyString(input.localId, "localId");
      assertTimestamp(input.now, "now");
      const row = await database.get<{ canonical_id: string }>(`SELECT canonical_id FROM sync_aliases
        WHERE workspace_id = ? AND domain_id = ? AND local_id = ? AND expires_at > ?`,
      [input.workspaceId, input.domainId, input.localId, input.now]);
      return row?.canonical_id ?? null;
    },

    async listOutboxMutations(
      workspaceId: string,
    ): Promise<LocalSyncOutboxMutation[]> {
      assertNonEmptyString(workspaceId, "workspaceId");
      const rows = await database.all<SyncOutboxRow>(
        `SELECT mutation_id, workspace_id, kind, record_id, operation,
                patch_json, base_revision, created_at, retry_count,
                next_retry_at, last_error_code
         FROM sync_outbox
         WHERE workspace_id = ?`,
        [workspaceId],
      );
      return rows
        .map((row) => ({
          actorId,
          workspaceId: row.workspace_id,
          mutationId: row.mutation_id,
          kind: row.kind,
          id: row.record_id,
          operation: row.operation,
          patch: row.patch_json === null ? null : JSON.parse(row.patch_json),
          baseRevision: row.base_revision,
          createdAt: row.created_at,
          retryCount: row.retry_count,
          nextRetryAt: row.next_retry_at,
          lastErrorCode: row.last_error_code,
        }))
        .sort(
          (left, right) =>
            compareSyncTimestamps(left.createdAt, right.createdAt) ||
            compareOpaqueStrings(left.mutationId, right.mutationId),
        );
    },

    async listQueuedMutations(query: {
      workspaceId: string;
      domainId?: string;
      kind?: SyncEntityKind;
    }): Promise<LocalSyncQueuedMutation[]> {
      assertNonEmptyString(query.workspaceId, "workspaceId");
      if (query.domainId !== undefined) assertNonEmptyString(query.domainId, "domainId");
      if (query.kind !== undefined) assertSyncEntityKind(query.kind);
      const conditions = ["workspace_id = ?"];
      const parameters: LocalSyncSqlValue[] = [query.workspaceId];
      if (query.domainId !== undefined) {
        conditions.push("domain_id = ?");
        parameters.push(query.domainId);
      }
      if (query.kind !== undefined) {
        conditions.push("kind = ?");
        parameters.push(query.kind);
      }
      const rows = await database.all<SyncQueuedMutationRow>(`SELECT
        mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
        request_json, depends_on, patch_json, base_revision, created_at, retry_count,
        next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
        FROM sync_outbox WHERE ${conditions.join(" AND ")}`,
      parameters);
      return rows.map(queueMutationFromRow).sort(
        (left, right) => compareSyncTimestamps(left.createdAt, right.createdAt) ||
          compareOpaqueStrings(left.mutationId, right.mutationId),
      );
    },

    async readOutboxOverlay(query: {
      workspaceId: string;
      kind: SyncEntityKind;
    }): Promise<{ serverRecords: SyncRecord[]; queuedMutations: LocalSyncQueuedMutation[] }> {
      assertNonEmptyString(query.workspaceId, "workspaceId");
      assertSyncEntityKind(query.kind);
      const scope = legacyScope(query.workspaceId, query.kind);
      if (!(await isReadable(scope))) return { serverRecords: [], queuedMutations: [] };
      return database.transaction(async () => {
        const rows = await database.all<SyncRecordRow>(`SELECT workspace_id, kind, record_id,
          revision, updated_at, deleted_at, payload_json, sync_state, ai_visibility
          FROM sync_records WHERE workspace_id = ? AND domain_id = ? AND authorization_epoch = ?
            AND kind = ? AND visible = 1 AND deleted_at IS NULL AND sync_state = 'synced'`,
        [...scopeParameters(scope), query.kind]);
        const outboxRows = await database.all<SyncQueuedMutationRow>(`SELECT
          mutation_id, workspace_id, domain_id, kind, record_id, operation, state,
          request_json, depends_on, patch_json, base_revision, created_at, retry_count,
          next_retry_at, last_error_code, attempt_count, first_attempt_at, server_snapshot_json
          FROM sync_outbox WHERE workspace_id = ? AND domain_id = ? AND kind = ?`,
        [query.workspaceId, scope.domainId, query.kind]);
        assertScope(scope);
        return {
          serverRecords: await Promise.all(rows.map(row => recordFromStoredRow(row))),
          queuedMutations: outboxRows.map(queueMutationFromRow).sort(
            (left, right) => compareSyncTimestamps(left.createdAt, right.createdAt) ||
              compareOpaqueStrings(left.mutationId, right.mutationId),
          ),
        };
      });
    },

    async countOutboxMutationsByDomain(workspaceId: string): Promise<Record<string, number>> {
      assertNonEmptyString(workspaceId, "workspaceId");
      const rows = await database.all<{ domain_id: string; count: number }>(`SELECT domain_id, COUNT(*) AS count
        FROM sync_outbox WHERE workspace_id = ? GROUP BY domain_id ORDER BY domain_id`, [workspaceId]);
      return Object.fromEntries(rows.map(row => [row.domain_id, Number(row.count)]));
    },
  };
}

function validateAndSerializeRecord(
  value: SyncRecord,
  actorId: string,
  workspaceId?: string,
): SerializedRecord {
  if (!isRecord(value)) {
    throw new TypeError("record must be an object");
  }
  assertNonEmptyString(value.actorId, "actorId");
  if (value.actorId !== actorId) {
    throw new TypeError(
      "actorId does not match the authenticated database scope",
    );
  }
  assertNonEmptyString(value.workspaceId, "workspaceId");
  if (workspaceId !== undefined && value.workspaceId !== workspaceId) {
    throw new TypeError("record workspaceId does not match the page workspaceId");
  }
  assertSyncEntityKind(value.kind);
  assertNonEmptyString(value.id, "id");
  assertNonEmptyString(value.revision, "revision");
  assertTimestamp(value.updatedAt, "updatedAt");
  assertNullableTimestamp(value.deletedAt, "deletedAt");
  if (!LOCAL_SYNC_STATES.has(value.syncState)) {
    throw new TypeError("syncState is invalid");
  }
  if (!AI_SYNC_VISIBILITIES.has(value.aiVisibility)) {
    throw new TypeError("aiVisibility is invalid");
  }
  if (value.syncState !== "synced" && value.aiVisibility !== "excluded") {
    throw new TypeError("unsynced records must be excluded from AI");
  }
  if (value.deletedAt !== null && value.payload !== null) {
    throw new TypeError("tombstone payload must be null");
  }
  if (value.deletedAt === null && value.payload === null) {
    throw new TypeError("live record payload must not be null");
  }
  return {
    record: value,
    payloadJson:
      value.payload === null ? null : serializeJson(value.payload, "payload"),
  };
}

function validateRecordKey(key: LocalSyncRecordKey): void {
  if (!isRecord(key)) {
    throw new TypeError("record key must be an object");
  }
  assertNonEmptyString(key.workspaceId, "workspaceId");
  assertSyncEntityKind(key.kind);
  assertNonEmptyString(key.id, "id");
}

function validateAndSerializeOutboxMutation(
  value: LocalSyncOutboxMutation,
  actorId: string,
): string | null {
  if (!isRecord(value)) {
    throw new TypeError("outbox mutation must be an object");
  }
  assertNonEmptyString(value.actorId, "actorId");
  if (value.actorId !== actorId) {
    throw new TypeError(
      "actorId does not match the authenticated database scope",
    );
  }
  assertNonEmptyString(value.workspaceId, "workspaceId");
  assertNonEmptyString(value.mutationId, "mutationId");
  assertSyncEntityKind(value.kind);
  assertNonEmptyString(value.id, "id");
  if (!OUTBOX_OPERATIONS.has(value.operation)) {
    throw new TypeError("operation is invalid");
  }
  assertNullableString(value.baseRevision, "baseRevision");
  if (value.domainId !== undefined) assertNonEmptyString(value.domainId, "domainId");
  if (value.dependsOn !== undefined) assertNullableString(value.dependsOn, "dependsOn");
  if (value.requestJson !== undefined && value.requestJson !== null) {
    if (typeof value.requestJson !== "string") throw new TypeError("requestJson must be a string or null");
    try { JSON.parse(value.requestJson); } catch { throw new TypeError("requestJson must contain valid JSON"); }
  }
  assertTimestamp(value.createdAt, "createdAt");
  if (!Number.isSafeInteger(value.retryCount) || value.retryCount < 0) {
    throw new TypeError("retryCount must be a non-negative safe integer");
  }
  assertNullableTimestamp(value.nextRetryAt, "nextRetryAt");
  assertNullableString(value.lastErrorCode, "lastErrorCode");
  return value.patch === null ? null : serializeJson(value.patch, "patch");
}

function localDomainForKind(kind: SyncEntityKind): string {
  return LEGACY_DOMAINS[kind];
}

function mergeOutboxPatches(previous: string | null, next: string | null): string | null {
  if (previous === null || next === null) return next;
  const oldValue: unknown = JSON.parse(previous);
  const newValue: unknown = JSON.parse(next);
  if (isRecord(oldValue) && isRecord(newValue) && !Array.isArray(oldValue) && !Array.isArray(newValue)) {
    return JSON.stringify({ ...oldValue, ...newValue });
  }
  return next;
}

function rewriteExactIdentifier(value: unknown, from: string, to: string): unknown {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map(item => rewriteExactIdentifier(item, from, to));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteExactIdentifier(item, from, to)]));
  return value;
}

function recordParameters(serialized: SerializedRecord): LocalSyncSqlValue[] {
  const { record, payloadJson } = serialized;
  return [
    record.workspaceId,
    record.kind,
    record.id,
    record.revision,
    record.updatedAt,
    record.deletedAt,
    payloadJson,
    record.syncState,
    record.aiVisibility,
  ];
}

function recordFromRow(row: SyncRecordRow, actorId: string): SyncRecord {
  return {
    actorId,
    workspaceId: row.workspace_id,
    kind: row.kind,
    id: row.record_id,
    revision: row.revision,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    payload: row.payload_json === null ? null : JSON.parse(row.payload_json),
    syncState: row.sync_state,
    aiVisibility: row.ai_visibility,
  };
}

function assertSyncEntityKind(value: unknown): asserts value is SyncEntityKind {
  if (!SYNC_ENTITY_KINDS.has(value as SyncEntityKind)) {
    throw new TypeError("kind is invalid");
  }
}

function assertNonEmptyString(
  value: unknown,
  field: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} is invalid`);
  }
}

export function compareSyncTimestamps(left: string, right: string): number {
  const leftParts = timestampParts(left);
  const rightParts = timestampParts(right);
  if (leftParts.wholeSecond !== rightParts.wholeSecond) {
    return leftParts.wholeSecond < rightParts.wholeSecond ? -1 : 1;
  }
  const width = Math.max(
    leftParts.fraction.length,
    rightParts.fraction.length,
  );
  for (let index = 0; index < width; index += 1) {
    const leftDigit = leftParts.fraction[index] ?? "0";
    const rightDigit = rightParts.fraction[index] ?? "0";
    if (leftDigit !== rightDigit) {
      return leftDigit < rightDigit ? -1 : 1;
    }
  }
  return 0;
}

function timestampParts(value: string): {
  wholeSecond: number;
  fraction: string;
} {
  const fractionMatch = /\.(\d+)(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  const timestampWithoutFraction = fractionMatch
    ? `${value.slice(0, fractionMatch.index)}${fractionMatch[2]}`
    : value;
  return {
    wholeSecond: Date.parse(timestampWithoutFraction) / 1_000,
    fraction: fractionMatch?.[1] ?? "",
  };
}

function compareOpaqueStrings(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function assertNullableString(
  value: unknown,
  field: string,
): asserts value is string | null {
  if (value !== null) {
    assertNonEmptyString(value, field);
  }
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
  if (!SYNC_TIMESTAMP.safeParse(value).success) {
    throw new TypeError(`${field} is invalid`);
  }
}

function assertNullableTimestamp(
  value: unknown,
  field: string,
): asserts value is string | null {
  if (value !== null) {
    assertTimestamp(value, field);
  }
}

function serializeJson(value: unknown, field: string): string {
  const parsed = PLAIN_JSON.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(`${field} must be plain JSON`);
  }
  assertNoActorIdentity(parsed.data, field);
  return JSON.stringify(parsed.data);
}

function assertNoActorIdentity(
  value: unknown,
  field: string,
  visited = new WeakSet<object>(),
): void {
  if (typeof value !== "object" || value === null || visited.has(value)) {
    return;
  }
  visited.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertNoActorIdentity(item, field, visited));
    return;
  }
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key
      .toLowerCase()
      .replaceAll("_", "")
      .replaceAll("-", "");
    if (normalizedKey === "actorid") {
      throw new TypeError(`${field} must not contain actor identity`);
    }
    assertNoActorIdentity(nestedValue, field, visited);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
