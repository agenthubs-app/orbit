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

const LEGACY_DOMAINS: Record<SyncEntityKind, string> = {
  contact: "contacts", note: "notes", task: "tasks", relationship_followup: "followups",
  personal_schedule: "personal-schedule", inbox_item: "notifications",
};

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
const SYNC_TIMESTAMP = z.iso.datetime({ offset: true });
const PLAIN_JSON = z.json();
const LAST_SUCCESSFUL_WORKSPACE_KEY = "last_successful_workspace_id";

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
}) {
  assertNonEmptyString(input.actorId, "actorId");
  const { actorId, database } = input;
  const registered = new Set(input.registeredDomainIds ?? []);

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
  async function isReadable(scope: ReadScope): Promise<boolean> {
    const row = await database.get<{ readable: number }>("SELECT readable FROM local_read_scope_state WHERE workspace_id=? AND domain_id=? AND authorization_epoch=?", scopeParameters(scope));
    return row?.readable !== 0;
  }

  return {
    async putRecord(record: SyncRecord): Promise<void> {
      const serialized = validateAndSerializeRecord(record, actorId);
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
      return row ? recordFromRow(row, actorId) : null;
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
      return rows
        .map((row) => recordFromRow(row, actorId))
        .sort(
          (left, right) =>
            compareSyncTimestamps(right.updatedAt, left.updatedAt) ||
            compareOpaqueStrings(left.id, right.id),
        );
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
          }
        : null;
    },

    async resetDomain(value: ReadScope): Promise<void> {
      const scope = assertScope(value);
      await database.transaction(async () => {
        for (const table of ["sync_records", "sync_cursors", "local_read_assets", "local_read_index"]) {
          const canonical = table === "sync_records" ? " AND sync_state='synced'" : "";
          await database.run(`DELETE FROM ${table} WHERE workspace_id=? AND domain_id=? AND authorization_epoch=?${canonical}`, scopeParameters(scope));
        }
        await database.run(`INSERT INTO local_read_scope_state VALUES(?,?,?,0) ON CONFLICT(workspace_id,domain_id,authorization_epoch) DO UPDATE SET readable=0`, scopeParameters(scope));
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
        return { ...change, json, hash };
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
        await database.run(`INSERT INTO sync_cursors(workspace_id,domain_id,authorization_epoch,cursor,last_successful_sync_at,bootstrap_state,completeness,generation)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,domain_id,authorization_epoch) DO UPDATE SET cursor=excluded.cursor,last_successful_sync_at=excluded.last_successful_sync_at,bootstrap_state=excluded.bootstrap_state,completeness=excluded.completeness,generation=excluded.generation`,
        [...scopeParameters(scope), page.nextCursor, page.serverTime, page.hasMore ? "pending" : "complete", page.hasMore ? "partial" : "complete", page.generation]);
        await database.run(`INSERT INTO local_read_scope_state VALUES(?,?,?,1) ON CONFLICT(workspace_id,domain_id,authorization_epoch) DO UPDATE SET readable=1`, scopeParameters(scope));
        assertScope(scope); // Roll back if revocation races the transaction.
      });
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
  assertTimestamp(value.createdAt, "createdAt");
  if (!Number.isSafeInteger(value.retryCount) || value.retryCount < 0) {
    throw new TypeError("retryCount must be a non-negative safe integer");
  }
  assertNullableTimestamp(value.nextRetryAt, "nextRetryAt");
  assertNullableString(value.lastErrorCode, "lastErrorCode");
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
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} is invalid`);
  }
}

function compareSyncTimestamps(left: string, right: string): number {
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
