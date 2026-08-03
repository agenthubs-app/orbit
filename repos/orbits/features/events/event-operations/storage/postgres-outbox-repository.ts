import { randomUUID } from "node:crypto";

import type {
  EventOperationsPostgresRuntime,
  EventOperationsSqlExecutor,
} from "./postgres-client";

type SqlRow = Record<string, unknown>;

export interface EventOperationsOutboxMessage {
  aggregateId: string;
  aggregateType: string;
  attempts: number;
  eventId: string;
  eventType: string;
  leaseEpoch: number;
  leaseExpiresAt: string;
  leaseToken: string;
  outboxId: string;
  payload: Readonly<Record<string, unknown>>;
  workerId: string;
}

export interface ClaimEventOperationsOutboxInput {
  leaseMs: number;
  limit: number;
  workerId: string;
}

export interface EventOperationsOutboxLeaseInput {
  leaseEpoch: number;
  leaseToken: string;
  outboxId: string;
}

export interface EventOperationsOutboxRepository {
  claim(
    input: ClaimEventOperationsOutboxInput,
  ): Promise<readonly EventOperationsOutboxMessage[]>;
  complete(
    input: EventOperationsOutboxLeaseInput & {
      completion: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean>;
  fail(
    input: EventOperationsOutboxLeaseInput & {
      code: string;
      message: string;
      retryDelayMs: number | null;
    },
  ): Promise<boolean>;
  heartbeat(
    input: EventOperationsOutboxLeaseInput & { leaseMs: number },
  ): Promise<boolean>;
}

function stringValue(row: SqlRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value) {
    throw new Error(`Event operations outbox row is missing ${key}.`);
  }
  return value;
}

function timestamp(row: SqlRow, key: string): string {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`Event operations outbox row has an invalid ${key}.`);
  }
  return new Date(parsed).toISOString();
}

function integer(row: SqlRow, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Event operations outbox row has an invalid ${key}.`);
  }
  return value;
}

function objectValue(
  value: unknown,
  key: string,
): Readonly<Record<string, unknown>> {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Event operations outbox row has an invalid ${key}.`);
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function messageFromRow(row: SqlRow): EventOperationsOutboxMessage {
  return {
    aggregateId: stringValue(row, "aggregate_id"),
    aggregateType: stringValue(row, "aggregate_type"),
    attempts: integer(row, "attempts"),
    eventId: stringValue(row, "event_id"),
    eventType: stringValue(row, "event_type"),
    leaseEpoch: integer(row, "lease_epoch"),
    leaseExpiresAt: timestamp(row, "lease_expires_at"),
    leaseToken: stringValue(row, "lease_token"),
    outboxId: stringValue(row, "outbox_id"),
    payload: objectValue(row.payload, "payload"),
    workerId: stringValue(row, "worker_id"),
  };
}

function boundedLimit(value: number): number {
  return Math.max(1, Math.min(64, Math.floor(value)));
}

async function requeueExpired(
  executor: EventOperationsSqlExecutor,
  workspaceId: string,
): Promise<void> {
  await executor.query(
    `
      update event_ops_outbox
      set
        status = case when attempts >= attempt_limit then 'failed' else 'pending' end,
        error_code = case
          when attempts >= attempt_limit then 'EVENT_OPERATIONS_OUTBOX_LEASE_EXHAUSTED'
          else 'EVENT_OPERATIONS_OUTBOX_LEASE_EXPIRED'
        end,
        error_message = 'The outbox worker lease expired before acknowledgement.',
        available_at = statement_timestamp(),
        lease_token = null,
        lease_expires_at = null,
        worker_id = null,
        updated_at = statement_timestamp()
      where workspace_id = $1
        and status = 'running'
        and lease_expires_at <= statement_timestamp()
    `,
    [workspaceId],
  );
}

export function createPostgresEventOperationsOutboxRepository({
  client,
  workspaceId,
}: EventOperationsPostgresRuntime): EventOperationsOutboxRepository {
  return {
    async claim(input) {
      return client.transaction(
        async (transaction) => {
          await requeueExpired(transaction, workspaceId);
          const tokenPrefix = randomUUID();
          const result = await transaction.query<SqlRow>(
            `
              with eligible as (
                select candidate.outbox_id
                from event_ops_outbox candidate
                where candidate.workspace_id = $1
                  and candidate.status = 'pending'
                  and candidate.available_at <= statement_timestamp()
                  and candidate.attempts < candidate.attempt_limit
                order by candidate.available_at, candidate.created_at,
                  candidate.outbox_id
                for update of candidate skip locked
                limit $2
              )
              update event_ops_outbox message
              set
                status = 'running',
                attempts = message.attempts + 1,
                lease_epoch = message.lease_epoch + 1,
                lease_token = concat($3::text, ':', message.outbox_id, ':', message.lease_epoch + 1),
                lease_expires_at = statement_timestamp()
                  + ($4::double precision * interval '1 millisecond'),
                worker_id = $5,
                error_code = null,
                error_message = null,
                updated_at = statement_timestamp()
              from eligible
              where message.workspace_id = $1
                and message.outbox_id = eligible.outbox_id
              returning message.*
            `,
            [
              workspaceId,
              boundedLimit(input.limit),
              tokenPrefix,
              input.leaseMs,
              input.workerId,
            ],
          );
          return result.rows.map(messageFromRow);
        },
        { isolation: "read committed" },
      );
    },

    async complete(input) {
      const result = await client.query(
        `
          update event_ops_outbox
          set status = 'completed', completed_at = statement_timestamp(),
            completion_payload = $5::jsonb, error_code = null,
            error_message = null, lease_token = null,
            lease_expires_at = null, worker_id = null,
            updated_at = statement_timestamp()
          where workspace_id = $1 and outbox_id = $2
            and status = 'running' and lease_token = $3
            and lease_epoch = $4
            and lease_expires_at > statement_timestamp()
        `,
        [
          workspaceId,
          input.outboxId,
          input.leaseToken,
          input.leaseEpoch,
          JSON.stringify(input.completion),
        ],
      );
      return result.rowCount === 1;
    },

    async fail(input) {
      const result = await client.query(
        `
          update event_ops_outbox
          set status = case
                when $7::double precision is not null and attempts < attempt_limit
                  then 'pending'
                else 'failed'
              end,
            available_at = case
              when $7::double precision is null then available_at
              else statement_timestamp()
                + ($7::double precision * interval '1 millisecond')
            end,
            error_code = $5, error_message = $6,
            lease_token = null, lease_expires_at = null, worker_id = null,
            completed_at = null, completion_payload = null,
            updated_at = statement_timestamp()
          where workspace_id = $1 and outbox_id = $2
            and status = 'running' and lease_token = $3
            and lease_epoch = $4
            and lease_expires_at > statement_timestamp()
        `,
        [
          workspaceId,
          input.outboxId,
          input.leaseToken,
          input.leaseEpoch,
          input.code,
          input.message,
          input.retryDelayMs,
        ],
      );
      return result.rowCount === 1;
    },

    async heartbeat(input) {
      const result = await client.query(
        `
          update event_ops_outbox
          set lease_expires_at = statement_timestamp()
                + ($5::double precision * interval '1 millisecond'),
            updated_at = statement_timestamp()
          where workspace_id = $1 and outbox_id = $2
            and status = 'running' and lease_token = $3
            and lease_epoch = $4
            and lease_expires_at > statement_timestamp()
        `,
        [
          workspaceId,
          input.outboxId,
          input.leaseToken,
          input.leaseEpoch,
          input.leaseMs,
        ],
      );
      return result.rowCount === 1;
    },
  };
}
