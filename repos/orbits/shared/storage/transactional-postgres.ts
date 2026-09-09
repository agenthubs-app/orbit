import { Pool, type PoolConfig } from "pg";
import { resolveLiveDatabaseConnectionConfig, type LiveDatabaseEnv } from "./live-database-config";

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
}

function executor(connection: PoolQuery): TransactionalSqlExecutor {
  return {
    async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
      const result = await connection.query(text, values === undefined ? undefined : [...values]);
      return { rows: result.rows as TRow[] };
    },
  };
}

export function createTransactionalPostgresClient({ connectionString, max = 2, ssl, pool: providedPool }: TransactionalPostgresOptions): TransactionalPostgresClient {
  if (!connectionString?.trim()) throw new Error("A database connection string is required.");
  if (!Number.isSafeInteger(max) || max < 1) throw new Error("Pool size must be a positive integer.");
  const pool = providedPool ?? new Pool({ connectionString, max, ssl });
  return {
    ...executor(pool),
    close: () => pool.end(),
    async transaction<T>(operation: (client: TransactionalSqlExecutor) => Promise<T>): Promise<T> {
      const connection = await pool.connect();
      let failed = false;
      let destroy = false;
      try {
        await connection.query("begin isolation level serializable");
        const result = await operation(executor(connection));
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

export function createConfiguredTransactionalPostgresRuntime({
  env,
  max = 2,
  createClient = createTransactionalPostgresClient,
}: {
  env?: LiveDatabaseEnv;
  max?: number;
  createClient?: (options: TransactionalPostgresOptions) => TransactionalPostgresClient;
} = {}): ConfiguredTransactionalPostgresRuntime | null {
  const config = resolveLiveDatabaseConnectionConfig(env);
  if (!config) return null;
  const cacheKey = JSON.stringify([config.connectionString, config.workspaceId, max]);
  const cached = cachedRuntimes.get(cacheKey);
  if (cached) return cached;
  const original = createClient({ connectionString: config.connectionString, max });
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
