import type {
  RelationshipTargetType,
  SourceType,
} from "../domain/source-types";

export type LiveRecordLifecycleState = "active" | "archived" | "deleted";

export interface LiveRecord<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  userId?: string | null;
  sourceType: SourceType | string;
  sourceId: string;
  sourceLabel?: string | null;
  provider?: string | null;
  providerRecordId?: string | null;
  evidenceIds: readonly string[];
  targetType?: RelationshipTargetType | string | null;
  targetId?: string | null;
  occurredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  lifecycleState: LiveRecordLifecycleState;
  searchText?: string | null;
  payload: TPayload;
}

export interface LiveRecordListQuery {
  workspaceId: string;
  /** Exact persisted identity, filtered before payloads leave storage. */
  payloadId?: string;
  payloadAccountId?: string;
  collectionName?: string;
  includeDeleted?: boolean;
  lifecycleState?: LiveRecordLifecycleState;
  recordIds?: readonly string[];
  searchText?: string;
  sourceId?: string;
  sourceType?: SourceType | string;
  targetId?: string;
  targetType?: RelationshipTargetType | string;
  /**
   * Account owner for private records. Public/workspace-wide readers omit it;
   * authenticated feature providers must pass it before personal records leave
   * the storage boundary.
   */
  userId?: string;
}

export interface LiveRecordGetQuery {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  includeDeleted?: boolean;
  userId?: string;
}

export interface LiveRecordDeleteInput {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  deletedAt: string;
  userId?: string;
  expectedUpdatedAt?: string;
}

export interface LiveRecordWritePrecondition {
  userId: string | null;
  updatedAt: string;
}

export type LiveRecordStoreResult<TValue> = TValue | Promise<TValue>;

export interface LiveRecordStoreLike<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  /** Compare-and-swap: never inserts, transfers ownership, or revives a tombstone. */
  updateRecordIfCurrent?: (record: LiveRecord<TPayload>, expected: LiveRecordWritePrecondition) => LiveRecordStoreResult<LiveRecord<TPayload> | null>;
  /** Atomic insert only; conflicts (including tombstones) return null, never update. */
  insertRecordIfAbsent?: (
    record: LiveRecord<TPayload>,
  ) => LiveRecordStoreResult<LiveRecord<TPayload> | null>;
  deleteRecord: (
    input: LiveRecordDeleteInput,
  ) => LiveRecordStoreResult<LiveRecord<TPayload> | null>;
  getRecord: (
    query: LiveRecordGetQuery,
  ) => LiveRecordStoreResult<LiveRecord<TPayload> | null>;
  listRecords: (
    query: LiveRecordListQuery,
  ) => LiveRecordStoreResult<readonly LiveRecord<TPayload>[]>;
  upsertRecord: (
    record: LiveRecord<TPayload>,
  ) => LiveRecordStoreResult<LiveRecord<TPayload>>;
}

export interface LiveRecordStore<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  updateRecordIfCurrent?: (record: LiveRecord<TPayload>, expected: LiveRecordWritePrecondition) => LiveRecord<TPayload> | null;
  insertRecordIfAbsent?: (record: LiveRecord<TPayload>) => LiveRecord<TPayload> | null;
  deleteRecord: (
    input: LiveRecordDeleteInput,
  ) => LiveRecord<TPayload> | null;
  getRecord: (query: LiveRecordGetQuery) => LiveRecord<TPayload> | null;
  listRecords: (query: LiveRecordListQuery) => readonly LiveRecord<TPayload>[];
  upsertRecord: (record: LiveRecord<TPayload>) => LiveRecord<TPayload>;
}

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function recordKey(input: {
  collectionName: string;
  recordId: string;
  workspaceId: string;
}): string {
  return `${input.workspaceId}\u0000${input.collectionName}\u0000${input.recordId}`;
}

function includesSearchText(record: LiveRecord, searchText?: string): boolean {
  const query = searchText?.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return (record.searchText ?? "").toLowerCase().includes(query);
}

function isVisible(record: LiveRecord, includeDeleted?: boolean): boolean {
  return includeDeleted === true || record.lifecycleState !== "deleted";
}

function matchesListQuery(record: LiveRecord, query: LiveRecordListQuery): boolean {
  const recordIds = query.recordIds ? new Set(query.recordIds) : null;

  return (
    record.workspaceId === query.workspaceId &&
    (query.payloadId === undefined || record.payload.id === query.payloadId) &&
    (query.payloadAccountId === undefined || record.payload.accountId === query.payloadAccountId) &&
    (query.collectionName === undefined ||
      record.collectionName === query.collectionName) &&
    (query.lifecycleState === undefined ||
      record.lifecycleState === query.lifecycleState) &&
    (query.sourceType === undefined || record.sourceType === query.sourceType) &&
    (query.sourceId === undefined || record.sourceId === query.sourceId) &&
    (query.targetType === undefined || record.targetType === query.targetType) &&
    (query.targetId === undefined || record.targetId === query.targetId) &&
    (query.userId === undefined || record.userId === query.userId) &&
    (recordIds === null || recordIds.has(record.recordId)) &&
    isVisible(record, query.includeDeleted) &&
    includesSearchText(record, query.searchText)
  );
}

export function createMemoryLiveRecordStore<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
>(
  seed: readonly LiveRecord<TPayload>[] = [],
): LiveRecordStore<TPayload> & Required<Pick<LiveRecordStore<TPayload>, "insertRecordIfAbsent">> {
  const records = new Map<string, LiveRecord<TPayload>>();

  for (const record of seed) {
    records.set(recordKey(record), cloneJson(record));
  }

  return {
    updateRecordIfCurrent(record, expected) {
      const current = records.get(recordKey(record));
      if (!current || current.lifecycleState === "deleted" ||
          (current.userId ?? null) !== expected.userId ||
          (record.userId ?? null) !== expected.userId ||
          current.updatedAt !== expected.updatedAt) return null;
      records.set(recordKey(record), cloneJson(record));
      return cloneJson(record);
    },
    insertRecordIfAbsent(record) {
      const key = recordKey(record);
      if (records.has(key)) return null;
      records.set(key, cloneJson(record));
      return cloneJson(record);
    },
    deleteRecord(input) {
      const key = recordKey(input);
      const record = records.get(key);

      if (!record || (input.userId !== undefined && record.userId !== input.userId) ||
          (input.expectedUpdatedAt !== undefined && record.updatedAt !== input.expectedUpdatedAt)) {
        return null;
      }

      const deletedRecord: LiveRecord<TPayload> = {
        ...record,
        deletedAt: input.deletedAt,
        lifecycleState: "deleted",
        updatedAt: input.deletedAt,
      };

      records.set(key, cloneJson(deletedRecord));

      return cloneJson(deletedRecord);
    },
    getRecord(query) {
      const record = records.get(recordKey(query));

      if (!record || !isVisible(record, query.includeDeleted) ||
          (query.userId !== undefined && record.userId !== query.userId)) {
        return null;
      }

      return cloneJson(record);
    },
    listRecords(query) {
      return Array.from(records.values())
        .filter((record) => matchesListQuery(record, query))
        .map((record) => cloneJson(record));
    },
    upsertRecord(record) {
      const nextRecord = cloneJson(record);

      records.set(recordKey(nextRecord), nextRecord);

      return cloneJson(nextRecord);
    },
  };
}
