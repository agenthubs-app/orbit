import { Pool, type PoolConfig } from "pg";
import { resolveSharedReadBudgetGate } from "../../features/sync/read-budget-gate";
import { poolTimeoutOptions, resolveDatabaseRuntimeProfile } from "./database-runtime-profile";
import { resolveLiveDatabaseConnectionConfig, type LiveDatabaseEnv } from "./live-database-config";
import type { PgPoolTimeoutOptions } from "./postgres-live-record-store";
import {
  createEnvReadMetricsObserver,
  createPostgresReadMetricsRunner,
  type PostgresReadMetricsConfig,
  type PostgresReadMetricsRunner,
} from "./postgres-read-metrics";

export interface TransactionalSqlExecutor {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

export interface TransactionalPostgresClient extends TransactionalSqlExecutor {
  transaction<T>(operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

interface PoolQuery {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface TransactionalPostgresPool extends PoolQuery {
  connect(): Promise<PoolQuery & { release(destroy?: boolean): void }>;
  end(): Promise<void>;
}

interface TransactionalPostgresOptions {
  connectionString: string;
  max?: number;
  ssl?: PoolConfig["ssl"];
  pool?: TransactionalPostgresPool;
  readMetrics?: PostgresReadMetricsConfig;
  timeouts?: PgPoolTimeoutOptions;
}

function executor(
  connection: PoolQuery,
  measureRead: PostgresReadMetricsRunner | undefined,
): TransactionalSqlExecutor {
  return {
    async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      const result = measureRead
        ? await measureRead(
            text,
            () => connection.query(text, values === undefined ? undefined : [...values]),
          )
        : await connection.query(text, values === undefined ? undefined : [...values]);
      return { rows: result.rows as TRow[] };
    },
  };
}

export function createTransactionalPostgresClient({ connectionString, max = 2, ssl, pool: providedPool, readMetrics, timeouts }: TransactionalPostgresOptions): TransactionalPostgresClient {
  if (!connectionString?.trim()) throw new Error("A database connection string is required.");
  if (!Number.isSafeInteger(max) || max < 1) throw new Error("Pool size must be a positive integer.");
  const pool = providedPool ?? new Pool({ connectionString, max, ssl, ...(timeouts ?? {}) });
  const measureRead = createPostgresReadMetricsRunner(readMetrics);
  return {
    ...executor(pool, measureRead),
    close: () => pool.end(),
    async transaction<T>(operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
      const connection = await pool.connect();
      let failed = false;
      let destroy = false;
      try {
        await connection.query("begin isolation level serializable");
        const result = await operation(executor(connection, measureRead));
        await connection.query("commit");
        return result;
      } catch (error) {
        failed = true;
        try {
          await connection.query("rollback");
        } catch {
          // A failed rollback makes this connection unsafe to reuse.
          destroy = true;
        }
        throw error;
      } finally {
        try {
          connection.release(destroy);
        } catch (error) {
          if (!failed) throw error;
        }
      }
    },
  };
}

interface ConfiguredTransactionalPostgresRuntime {
  client: TransactionalPostgresClient;
  workspaceId: string;
}

const cachedRuntimes = new Map<string, ConfiguredTransactionalPostgresRuntime>();

/** Gate accounting plus the env console line, composed so neither replaces the other. */
export function configuredReadMetrics(env: LiveDatabaseEnv = process.env): PostgresReadMetricsConfig | undefined {
  const gate = resolveSharedReadBudgetGate(env);
  const console = createEnvReadMetricsObserver(env);
  if (!gate) return console;
  return { observer: (metric) => { gate.observe(metric); console?.(metric); } };
}

export function createConfiguredTransactionalPostgresRuntime({
  env,
  max,
  createClient = createTransactionalPostgresClient,
}: {
  env?: LiveDatabaseEnv;
  max?: number;
  createClient?: (options: TransactionalPostgresOptions) => TransactionalPostgresClient;
} = {}): ConfiguredTransactionalPostgresRuntime | null {
  const config = resolveLiveDatabaseConnectionConfig(env);
  if (!config) return null;
  const profile = resolveDatabaseRuntimeProfile(env);
  const poolMax = max ?? profile.transactionalPoolMax;
  const cacheKey = JSON.stringify([config.connectionString, config.workspaceId, poolMax]);
  const cached = cachedRuntimes.get(cacheKey);
  if (cached) return cached;
  const original = createClient({
    connectionString: config.connectionString,
    max: poolMax,
    timeouts: poolTimeoutOptions(profile),
    readMetrics: configuredReadMetrics(env),
  });
  const runtime = {
    workspaceId: config.workspaceId,
    client: {
      ...original,
      async close() {
        if (cachedRuntimes.get(cacheKey) === runtime) cachedRuntimes.delete(cacheKey);
        await original.close();
      },
    },
  };
  cachedRuntimes.set(cacheKey, runtime);
  return runtime;
}
