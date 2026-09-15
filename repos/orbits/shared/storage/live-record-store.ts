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
}

export interface LiveRecordDeleteInput {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  deletedAt: string;
}

export type LiveRecordStoreResult<TValue> = TValue | Promise<TValue>;

export type LiveRecordCompareAndSwapExpected =
  | { kind: "absent" }
  | {
    kind: "match";
    lifecycleState: LiveRecordLifecycleState;
    payloadPath: readonly string[];
    payloadValue: boolean | number | string | null;
  };

export interface LiveRecordCompareAndSwapInput<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  expected: LiveRecordCompareAndSwapExpected;
  record: LiveRecord<TPayload>;
}

export interface LiveRecordStoreLike<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  compareAndSwapRecord?: (
    input: LiveRecordCompareAndSwapInput<TPayload>,
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
  compareAndSwapRecord: (
    input: LiveRecordCompareAndSwapInput<TPayload>,
  ) => LiveRecord<TPayload> | null;
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

function valueAtPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function matchesListQuery(record: LiveRecord, query: LiveRecordListQuery): boolean {
  const recordIds = query.recordIds ? new Set(query.recordIds) : null;

  return (
    record.workspaceId === query.workspaceId &&
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
): LiveRecordStore<TPayload> {
  const records = new Map<string, LiveRecord<TPayload>>();

  for (const record of seed) {
    records.set(recordKey(record), cloneJson(record));
  }

  return {
    compareAndSwapRecord(input) {
      const key = recordKey(input.record);
      const current = records.get(key);
      if (input.expected.kind === "absent") {
        if (current) return null;
      } else if (
        !current ||
        current.userId !== input.record.userId ||
        current.lifecycleState !== input.expected.lifecycleState ||
        valueAtPath(current.payload, input.expected.payloadPath) !== input.expected.payloadValue
      ) {
        return null;
      }
      const nextRecord = cloneJson(input.record);
      records.set(key, nextRecord);
      return cloneJson(nextRecord);
    },
    deleteRecord(input) {
      const key = recordKey(input);
      const record = records.get(key);

      if (!record) {
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

      if (!record || !isVisible(record, query.includeDeleted)) {
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
