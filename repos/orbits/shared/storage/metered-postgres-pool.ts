import type { Pool, PoolClient } from "pg";

import {
  createPostgresReadMetricsRunner,
  type PostgresReadMetricsConfig,
  type PostgresReadMetricsEnv,
  type PostgresReadMetricsRunner,
} from "./postgres-read-metrics";

/**
 * The metering entry point for feature-owned `pg` pools.
 *
 * Wraps `pool.query` and the `query` of every client handed out by
 * `pool.connect()` with the shared read-metrics runner, so reads through the
 * pool reach the env log line and the request read receipt exactly like the
 * shared storage clients. Callback-style calls and streaming submittables are
 * passed through untouched. With metrics disabled the pool is returned as is.
 *
 * `tests/audits/postgres-pool-metering.test.ts` requires every runtime
 * pool constructor to go through this function (or one of the two shared clients
 * that meter at the client level).
 */

const METERED = Symbol.for("orbit.meteredPostgresQuery");

type QueryFunction = (...args: unknown[]) => unknown;

function rowsOf(result: unknown): readonly unknown[] {
  if (Array.isArray(result)) {
    return result.flatMap((item) => (Array.isArray((item as { rows?: unknown })?.rows) ? (item as { rows: unknown[] }).rows : []));
  }
  const rows = (result as { rows?: unknown } | null | undefined)?.rows;
  return Array.isArray(rows) ? rows : [];
}

function meteredQuery(runner: PostgresReadMetricsRunner, query: QueryFunction): QueryFunction {
  return (...args: unknown[]) => {
    if (typeof args[args.length - 1] === "function") return query(...args);
    const config = args[0] as { text?: unknown; submit?: unknown } | string | undefined;
    if (config && typeof config === "object" && typeof config.submit === "function") return query(...args);
    const text = typeof config === "string" ? config : config?.text;
    if (typeof text !== "string") return query(...args);
    let original: unknown;
    return runner(text, async () => {
      original = await (query(...args) as Promise<unknown>);
      return { rows: rowsOf(original) };
    }).then(() => original);
  };
}

function meterClient<TClient extends Pick<PoolClient, "query">>(client: TClient, runner: PostgresReadMetricsRunner): TClient {
  const marked = client as TClient & { [METERED]?: true };
  if (marked[METERED]) return client;
  const query = client.query.bind(client) as QueryFunction;
  (client as unknown as { query: QueryFunction }).query = meteredQuery(runner, query);
  marked[METERED] = true;
  return client;
}

export function meterPostgresPool<TPool extends Pool>(
  pool: TPool,
  readMetrics?: PostgresReadMetricsConfig,
  env: PostgresReadMetricsEnv = process.env,
): TPool {
  const runner = createPostgresReadMetricsRunner(readMetrics, env);
  if (!runner) return pool;
  const query = pool.query.bind(pool) as QueryFunction;
  (pool as unknown as { query: QueryFunction }).query = meteredQuery(runner, query);
  const connect = pool.connect.bind(pool) as (callback?: unknown) => unknown;
  (pool as unknown as { connect: (callback?: unknown) => unknown }).connect = (callback?: unknown) => {
    if (typeof callback === "function") {
      return connect((error: unknown, client: PoolClient | undefined, done: unknown) => {
        if (client) meterClient(client, runner);
        (callback as (...values: unknown[]) => void)(error, client, done);
      });
    }
    return (connect() as Promise<PoolClient>).then((client) => meterClient(client, runner));
  };
  return pool;
}
