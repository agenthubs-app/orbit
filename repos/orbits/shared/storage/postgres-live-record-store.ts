import { Pool, type PoolConfig } from "pg";

import type {
  LiveRecord,
  LiveRecordDeleteInput,
  LiveRecordGetQuery,
  LiveRecordListQuery,
  LiveRecordStoreLike,
} from "./live-record-store";

export interface LiveRecordSqlResult<TRow = Record<string, unknown>> {
  rows: readonly TRow[];
}

export interface LiveRecordSqlClient {
  query: <TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<LiveRecordSqlResult<TRow>>;
}

export interface ClosableLiveRecordSqlClient extends LiveRecordSqlClient {
  close: () => Promise<void>;
}

export interface PostgresLiveRecordStoreOptions {
  client: LiveRecordSqlClient;
}

export interface PgLiveRecordSqlClientOptions {
  connectionString: string;
  max?: number;
  ssl?: PoolConfig["ssl"];
}

type PostgresLiveRecordRow = {
  collection_name: string;
  created_at: Date | string;
  deleted_at?: Date | string | null;
  evidence_ids?: readonly string[] | null;
  lifecycle_state: string;
  occurred_at?: Date | string | null;
  payload: Record<string, unknown> | string;
  provider?: string | null;
  provider_record_id?: string | null;
  record_id: string;
  search_text?: string | null;
  source_id: string;
  source_label?: string | null;
  source_type: string;
  target_id?: string | null;
  target_type?: string | null;
  updated_at: Date | string;
  user_id?: string | null;
  workspace_id: string;
};

const recordColumns = `
  workspace_id,
  collection_name,
  record_id,
  user_id,
  source_type,
  source_id,
  source_label,
  provider,
  provider_record_id,
  evidence_ids,
  target_type,
  target_id,
  occurred_at,
  lifecycle_state,
  search_text,
  payload,
  created_at,
  updated_at,
  deleted_at
`;

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function timestampToString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" && value.trim() ? value : null;
}

function requiredTimestamp(value: Date | string, fieldName: string): string {
  const timestamp = timestampToString(value);

  if (!timestamp) {
    throw new Error(`orbit_records.${fieldName} is required`);
  }

  return timestamp;
}

function payloadFromRow<TPayload extends Record<string, unknown>>(
  payload: Record<string, unknown> | string,
): TPayload {
  if (typeof payload === "string") {
    return JSON.parse(payload) as TPayload;
  }

  return cloneJson(payload) as TPayload;
}

function rowToRecord<TPayload extends Record<string, unknown>>(
  row: PostgresLiveRecordRow,
): LiveRecord<TPayload> {
  return {
    workspaceId: row.workspace_id,
    collectionName: row.collection_name,
    recordId: row.record_id,
    userId: row.user_id ?? null,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel: row.source_label ?? null,
    provider: row.provider ?? null,
    providerRecordId: row.provider_record_id ?? null,
    evidenceIds: row.evidence_ids ? [...row.evidence_ids] : [],
    targetType: row.target_type ?? null,
    targetId: row.target_id ?? null,
    occurredAt: timestampToString(row.occurred_at),
    createdAt: requiredTimestamp(row.created_at, "created_at"),
    updatedAt: requiredTimestamp(row.updated_at, "updated_at"),
    deletedAt: timestampToString(row.deleted_at),
    lifecycleState:
      row.lifecycle_state === "archived" || row.lifecycle_state === "deleted"
        ? row.lifecycle_state
        : "active",
    searchText: row.search_text ?? null,
    payload: payloadFromRow<TPayload>(row.payload),
  };
}

function recordValues(record: LiveRecord): readonly unknown[] {
  return [
    record.workspaceId,
    record.collectionName,
    record.recordId,
    record.userId ?? null,
    record.sourceType,
    record.sourceId,
    record.sourceLabel ?? null,
    record.provider ?? null,
    record.providerRecordId ?? null,
    [...record.evidenceIds],
    record.targetType ?? null,
    record.targetId ?? null,
    record.occurredAt ?? null,
    record.lifecycleState,
    record.searchText ?? "",
    record.payload,
    record.createdAt,
    record.updatedAt,
    record.deletedAt ?? null,
  ];
}

function addWhere(
  where: string[],
  values: unknown[],
  expression: (index: number) => string,
  value: unknown,
): void {
  values.push(value);
  where.push(expression(values.length));
}

function listQuery(input: LiveRecordListQuery): {
  text: string;
  values: readonly unknown[];
} {
  const values: unknown[] = [input.workspaceId];
  const where = ["workspace_id = $1"];
  const searchText = input.searchText?.trim();

  if (input.collectionName !== undefined) {
    addWhere(where, values, (index) => `collection_name = $${index}`, input.collectionName);
  }

  if (input.lifecycleState !== undefined) {
    addWhere(where, values, (index) => `lifecycle_state = $${index}`, input.lifecycleState);
  }

  if (input.includeDeleted !== true) {
    where.push("lifecycle_state <> 'deleted'");
  }

  if (input.sourceType !== undefined) {
    addWhere(where, values, (index) => `source_type = $${index}`, input.sourceType);
  }

  if (input.sourceId !== undefined) {
    addWhere(where, values, (index) => `source_id = $${index}`, input.sourceId);
  }

  if (input.targetType !== undefined) {
    addWhere(where, values, (index) => `target_type = $${index}`, input.targetType);
  }

  if (input.targetId !== undefined) {
    addWhere(where, values, (index) => `target_id = $${index}`, input.targetId);
  }

  if (input.recordIds !== undefined) {
    addWhere(
      where,
      values,
      (index) => `record_id = any($${index}::text[])`,
      [...input.recordIds],
    );
  }

  if (searchText) {
    addWhere(
      where,
      values,
      (index) => `search_text ilike $${index}`,
      `%${searchText}%`,
    );
  }

  return {
    text: `
      select ${recordColumns}
      from orbit_records
      where ${where.join(" and ")}
      order by coalesce(occurred_at, updated_at) desc, updated_at desc
    `,
    values,
  };
}

export function createPgLiveRecordSqlClient({
  connectionString,
  max,
  ssl,
}: PgLiveRecordSqlClientOptions): ClosableLiveRecordSqlClient {
  const pool = new Pool({
    connectionString,
    max,
    ssl,
  });

  return {
    close: () => pool.end(),
    async query<TRow = Record<string, unknown>>(text, values) {
      const result = await pool.query(
        text,
        values === undefined ? undefined : [...values],
      );

      return {
        rows: result.rows as TRow[],
      };
    },
  };
}

export function createPostgresLiveRecordStore<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
>({ client }: PostgresLiveRecordStoreOptions): LiveRecordStoreLike<TPayload> {
  return {
    async deleteRecord(
      input: LiveRecordDeleteInput,
    ): Promise<LiveRecord<TPayload> | null> {
      const result = await client.query<PostgresLiveRecordRow>(
        `
          update orbit_records
          set lifecycle_state = 'deleted',
            deleted_at = $4,
            updated_at = $4
          where workspace_id = $1
            and collection_name = $2
            and record_id = $3
          returning ${recordColumns}
        `,
        [
          input.workspaceId,
          input.collectionName,
          input.recordId,
          input.deletedAt,
        ],
      );

      return result.rows[0] ? rowToRecord<TPayload>(result.rows[0]) : null;
    },

    async getRecord(
      query: LiveRecordGetQuery,
    ): Promise<LiveRecord<TPayload> | null> {
      const where = [
        "workspace_id = $1",
        "collection_name = $2",
        "record_id = $3",
      ];

      if (query.includeDeleted !== true) {
        where.push("lifecycle_state <> 'deleted'");
      }

      const result = await client.query<PostgresLiveRecordRow>(
        `
          select ${recordColumns}
          from orbit_records
          where ${where.join(" and ")}
          limit 1
        `,
        [query.workspaceId, query.collectionName, query.recordId],
      );

      return result.rows[0] ? rowToRecord<TPayload>(result.rows[0]) : null;
    },

    async listRecords(
      query: LiveRecordListQuery,
    ): Promise<readonly LiveRecord<TPayload>[]> {
      const sql = listQuery(query);
      const result = await client.query<PostgresLiveRecordRow>(
        sql.text,
        sql.values,
      );

      return result.rows.map((row) => rowToRecord<TPayload>(row));
    },

    async upsertRecord(record: LiveRecord<TPayload>): Promise<LiveRecord<TPayload>> {
      const result = await client.query<PostgresLiveRecordRow>(
        `
          insert into orbit_records (${recordColumns})
          values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          on conflict (workspace_id, collection_name, record_id)
          do update set
            user_id = excluded.user_id,
            source_type = excluded.source_type,
            source_id = excluded.source_id,
            source_label = excluded.source_label,
            provider = excluded.provider,
            provider_record_id = excluded.provider_record_id,
            evidence_ids = excluded.evidence_ids,
            target_type = excluded.target_type,
            target_id = excluded.target_id,
            occurred_at = excluded.occurred_at,
            lifecycle_state = excluded.lifecycle_state,
            search_text = excluded.search_text,
            payload = excluded.payload,
            updated_at = excluded.updated_at,
            deleted_at = excluded.deleted_at
          returning ${recordColumns}
        `,
        recordValues(record),
      );

      if (!result.rows[0]) {
        throw new Error("orbit_records upsert returned no row");
      }

      return rowToRecord<TPayload>(result.rows[0]);
    },
  };
}
