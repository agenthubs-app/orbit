import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "../../../../shared/storage/live-database-config";

export interface EventOperationsSqlResult<TRow = Record<string, unknown>> {
  rowCount: number;
  rows: readonly TRow[];
}

export interface EventOperationsSqlExecutor {
  query<TRow = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<EventOperationsSqlResult<TRow>>;
}

export type EventOperationsTransactionIsolation =
  | "read committed"
  | "repeatable read"
  | "serializable";

export interface EventOperationsTransactionOptions {
  isolation?: EventOperationsTransactionIsolation;
}

export interface EventOperationsPostgresClient extends EventOperationsSqlExecutor {
  close(): Promise<void>;
  transaction<TValue>(
    operation: (transaction: EventOperationsSqlExecutor) => Promise<TValue>,
    options?: EventOperationsTransactionOptions,
  ): Promise<TValue>;
}

export interface EventOperationsPostgresRuntime {
  client: EventOperationsPostgresClient;
  workspaceId: string;
}

export interface CreateEventOperationsPostgresClientOptions {
  connectionString: string;
  max?: number;
  pool?: Pick<Pool, "connect" | "end" | "query">;
  ssl?: PoolConfig["ssl"];
}

export interface CreateConfiguredEventOperationsPostgresRuntimeOptions {
  env?: LiveDatabaseEnv;
  max?: number;
}

const DEFAULT_POOL_MAX = 8;
const configuredRuntimes = new Map<string, EventOperationsPostgresRuntime>();

function resultFor<TRow>(result: {
  rowCount?: number | null;
  rows: readonly TRow[];
}): EventOperationsSqlResult<TRow> {
  return {
    rowCount: result.rowCount ?? result.rows.length,
    rows: result.rows,
  };
}

function executorFor(client: Pick<PoolClient, "query">): EventOperationsSqlExecutor {
  return {
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ) {
      const result = await client.query(
        text,
        values === undefined ? undefined : [...values],
      );
      return resultFor(result as { rowCount?: number | null; rows: TRow[] });
    },
  };
}

function beginStatement(isolation: EventOperationsTransactionIsolation): string {
  switch (isolation) {
    case "read committed":
      return "begin isolation level read committed";
    case "repeatable read":
      return "begin isolation level repeatable read";
    case "serializable":
    default:
      return "begin isolation level serializable";
  }
}

export function createEventOperationsPostgresClient({
  connectionString,
  max = DEFAULT_POOL_MAX,
  pool: suppliedPool,
  ssl,
}: CreateEventOperationsPostgresClientOptions): EventOperationsPostgresClient {
  if (!connectionString.trim()) {
    throw new Error("Event operations PostgreSQL requires a connection string.");
  }
  const pool =
    suppliedPool ??
    new Pool({
      connectionString,
      max,
      ssl,
    });

  return {
    close: () => pool.end(),
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ) {
      const result = await pool.query(
        text,
        values === undefined ? undefined : [...values],
      );
      return resultFor(result as { rowCount?: number | null; rows: TRow[] });
    },
    async transaction<TValue>(
      operation: (
        transaction: EventOperationsSqlExecutor,
      ) => Promise<TValue>,
      options: EventOperationsTransactionOptions = {},
    ) {
      const connection = await pool.connect();
      const transaction = executorFor(connection);
      let began = false;
      let releaseError: Error | undefined;
      try {
        await connection.query(
          beginStatement(options.isolation ?? "serializable"),
        );
        began = true;
        const value = await operation(transaction);
        await connection.query("commit");
        return value;
      } catch (error) {
        if (began) {
          try {
            await connection.query("rollback");
          } catch (rollbackError) {
            // Preserve the original transaction error. The pool discards a
            // broken connection after release; callers must never mistake a
            // rollback transport failure for a committed event operation.
            releaseError =
              rollbackError instanceof Error
                ? rollbackError
                : new Error("Event operations transaction rollback failed.");
          }
        }
        throw error;
      } finally {
        connection.release(releaseError);
      }
    },
  };
}

export function createConfiguredEventOperationsPostgresRuntime({
  env,
  max = DEFAULT_POOL_MAX,
}: CreateConfiguredEventOperationsPostgresRuntimeOptions = {}): EventOperationsPostgresRuntime | null {
  const configuration = resolveLiveDatabaseConnectionConfig(env);
  if (!configuration) return null;

  const cacheKey = `${configuration.connectionString}\u0000${configuration.workspaceId}\u0000${max}`;
  const cached = configuredRuntimes.get(cacheKey);
  if (cached) return cached;

  const runtime = {
    client: createEventOperationsPostgresClient({
      connectionString: configuration.connectionString,
      max,
    }),
    workspaceId: configuration.workspaceId,
  };
  configuredRuntimes.set(cacheKey, runtime);
  return runtime;
}
