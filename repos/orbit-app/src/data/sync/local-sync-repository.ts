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

const SYNC_ENTITY_KINDS = new Set<SyncEntityKind>([
  "contact",
  "note",
  "task",
  "relationship_followup",
  "personal_schedule",
  "inbox_item",
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
]);

export type LocalSyncBootstrapState = "pending" | "complete";
export type LocalSyncOutboxOperation = "create" | "update" | "delete";

export interface LocalSyncCursor {
  workspaceId: string;
  cursor: string;
  lastSyncedAt: string;
  bootstrapState: LocalSyncBootstrapState;
}

export interface LocalSyncOutboxMutation {
  actorId: string;
  workspaceId: string;
  mutationId: string;
  kind: SyncEntityKind;
  id: string;
  operation: LocalSyncOutboxOperation;
  patch: unknown;
  baseRevision: string | null;
  createdAt: string;
  retryCount: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
}

export interface ApplyLocalSyncPageInput {
  workspaceId: string;
  records: readonly SyncRecord[];
  cursor: string;
  syncedAt: string;
  bootstrapState: LocalSyncBootstrapState;
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

interface SerializedRecord {
  record: SyncRecord;
  payloadJson: string | null;
}

const UPSERT_RECORD = `INSERT INTO sync_records (
  workspace_id,
  kind,
  record_id,
  revision,
  updated_at,
  deleted_at,
  payload_json,
  sync_state,
  ai_visibility
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(workspace_id, kind, record_id) DO UPDATE SET
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
}) {
  assertNonEmptyString(input.actorId, "actorId");
  const { actorId, database } = input;

  return {
    async putRecord(record: SyncRecord): Promise<void> {
      const serialized = validateAndSerializeRecord(record, actorId);
      await database.run(UPSERT_RECORD, recordParameters(serialized));
    },

    async applyPage(page: ApplyLocalSyncPageInput): Promise<void> {
      assertNonEmptyString(page.workspaceId, "workspaceId");
      assertNonEmptyString(page.cursor, "cursor");
      assertNonEmptyString(page.syncedAt, "syncedAt");
      if (!BOOTSTRAP_STATES.has(page.bootstrapState)) {
        throw new TypeError("bootstrapState is invalid");
      }
      if (!Array.isArray(page.records)) {
        throw new TypeError("records must be an array");
      }
      const records = page.records.map((record) => {
        const serialized = validateAndSerializeRecord(
          record,
          actorId,
          page.workspaceId,
        );
        if (serialized.record.syncState !== "synced") {
          throw new TypeError("canonical page records must be synced");
        }
        return serialized;
      });

      await database.transaction(async () => {
        for (const record of records) {
          await database.run(APPLY_CANONICAL_RECORD, recordParameters(record));
        }
        await database.run(
          `INSERT INTO sync_cursors (
            workspace_id, cursor, last_successful_sync_at, bootstrap_state
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(workspace_id) DO UPDATE SET
            cursor = excluded.cursor,
            last_successful_sync_at = excluded.last_successful_sync_at,
            bootstrap_state = excluded.bootstrap_state`,
          [page.workspaceId, page.cursor, page.syncedAt, page.bootstrapState],
        );
      });
    },

    async getRecord(key: LocalSyncRecordKey): Promise<SyncRecord | null> {
      validateRecordKey(key);
      const row = await database.get<SyncRecordRow>(
        `SELECT workspace_id, kind, record_id, revision, updated_at, deleted_at,
                payload_json, sync_state, ai_visibility
         FROM sync_records
         WHERE workspace_id = ? AND kind = ? AND record_id = ?`,
        [key.workspaceId, key.kind, key.id],
      );
      return row ? recordFromRow(row, actorId) : null;
    },

    async listRecords(
      query: ListLocalSyncRecordsInput,
    ): Promise<SyncRecord[]> {
      assertNonEmptyString(query.workspaceId, "workspaceId");
      assertSyncEntityKind(query.kind);
      const deletedPredicate = query.includeDeleted
        ? ""
        : " AND deleted_at IS NULL";
      const rows = await database.all<SyncRecordRow>(
        `SELECT workspace_id, kind, record_id, revision, updated_at, deleted_at,
                payload_json, sync_state, ai_visibility
         FROM sync_records
         WHERE workspace_id = ? AND kind = ?${deletedPredicate}
         ORDER BY updated_at DESC, record_id ASC`,
        [query.workspaceId, query.kind],
      );
      return rows.map((row) => recordFromRow(row, actorId));
    },

    async getCursor(workspaceId: string): Promise<LocalSyncCursor | null> {
      assertNonEmptyString(workspaceId, "workspaceId");
      const row = await database.get<SyncCursorRow>(
        `SELECT workspace_id, cursor, last_successful_sync_at, bootstrap_state
         FROM sync_cursors WHERE workspace_id = ?`,
        [workspaceId],
      );
      return row
        ? {
            workspaceId: row.workspace_id,
            cursor: row.cursor,
            lastSyncedAt: row.last_successful_sync_at,
            bootstrapState: row.bootstrap_state,
          }
        : null;
    },

    async enqueueOutboxMutation(
      mutation: LocalSyncOutboxMutation,
    ): Promise<void> {
      const patchJson = validateAndSerializeOutboxMutation(mutation, actorId);
      await database.run(
        `INSERT INTO sync_outbox (
          mutation_id,
          workspace_id,
          kind,
          record_id,
          operation,
          patch_json,
          base_revision,
          created_at,
          retry_count,
          next_retry_at,
          last_error_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mutation_id) DO NOTHING`,
        [
          mutation.mutationId,
          mutation.workspaceId,
          mutation.kind,
          mutation.id,
          mutation.operation,
          patchJson,
          mutation.baseRevision,
          mutation.createdAt,
          mutation.retryCount,
          mutation.nextRetryAt,
          mutation.lastErrorCode,
        ],
      );
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
         WHERE workspace_id = ?
         ORDER BY created_at ASC, mutation_id ASC`,
        [workspaceId],
      );
      return rows.map((row) => ({
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
      }));
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
  assertNonEmptyString(value.updatedAt, "updatedAt");
  assertNullableString(value.deletedAt, "deletedAt");
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
  assertNoActorIdentity(value.payload, "payload");

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
  assertNonEmptyString(value.createdAt, "createdAt");
  if (!Number.isSafeInteger(value.retryCount) || value.retryCount < 0) {
    throw new TypeError("retryCount must be a non-negative safe integer");
  }
  assertNullableString(value.nextRetryAt, "nextRetryAt");
  assertNullableString(value.lastErrorCode, "lastErrorCode");
  assertNoActorIdentity(value.patch, "patch");
  return value.patch === null ? null : serializeJson(value.patch, "patch");
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
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function assertNullableString(
  value: unknown,
  field: string,
): asserts value is string | null {
  if (value !== null) {
    assertNonEmptyString(value, field);
  }
}

function serializeJson(value: unknown, field: string): string {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError(`${field} must be JSON-serializable`);
  }
  if (serialized === undefined) {
    throw new TypeError(`${field} must be JSON-serializable`);
  }
  return serialized;
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
