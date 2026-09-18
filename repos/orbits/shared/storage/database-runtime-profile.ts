/**
 * Pool sizes and timeouts follow where the process runs. A Vercel function
 * shares Neon's pooler with many short-lived instances, so it keeps a small
 * pool and only a client-side query timeout (startup GUCs are not guaranteed
 * through PgBouncer). A long-lived worker or a local dev server connects
 * directly and can afford a wider pool plus a server-side statement_timeout.
 */
export type DatabaseRuntimeKind = "serverless" | "worker" | "local";

export interface DatabaseRuntimeProfile {
  kind: DatabaseRuntimeKind;
  poolMax: number;
  transactionalPoolMax: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  /** Client-side: the pg client gives up waiting and frees the pool slot. */
  queryTimeoutMillis: number;
  /** Server-side statement_timeout for direct connections; null when not applied. */
  statementTimeoutMillis: number | null;
}

export type DatabaseRuntimeEnv = Record<string, string | undefined>;

const PROFILES: Record<DatabaseRuntimeKind, DatabaseRuntimeProfile> = {
  serverless: { kind: "serverless", poolMax: 2, transactionalPoolMax: 2, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000, queryTimeoutMillis: 15_000, statementTimeoutMillis: null },
  worker: { kind: "worker", poolMax: 4, transactionalPoolMax: 4, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, queryTimeoutMillis: 60_000, statementTimeoutMillis: 60_000 },
  local: { kind: "local", poolMax: 4, transactionalPoolMax: 4, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000, queryTimeoutMillis: 30_000, statementTimeoutMillis: 30_000 },
};

function positiveInteger(env: DatabaseRuntimeEnv, key: string): number | undefined {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer, got "${raw}".`);
  }
  return value;
}

function runtimeKind(env: DatabaseRuntimeEnv): DatabaseRuntimeKind {
  const explicit = env.ORBIT_DB_RUNTIME?.trim().toLowerCase();
  if (explicit) {
    if (explicit === "serverless" || explicit === "worker" || explicit === "local") return explicit;
    throw new Error(`ORBIT_DB_RUNTIME must be serverless, worker or local, got "${explicit}".`);
  }
  return env.VERCEL === "1" ? "serverless" : "local";
}

export function resolveDatabaseRuntimeProfile(env: DatabaseRuntimeEnv = process.env): DatabaseRuntimeProfile {
  const base = PROFILES[runtimeKind(env)];
  return {
    ...base,
    poolMax: positiveInteger(env, "ORBIT_DB_POOL_MAX") ?? base.poolMax,
    transactionalPoolMax: positiveInteger(env, "ORBIT_DB_TX_POOL_MAX") ?? base.transactionalPoolMax,
    queryTimeoutMillis: positiveInteger(env, "ORBIT_DB_QUERY_TIMEOUT_MS") ?? base.queryTimeoutMillis,
    statementTimeoutMillis: positiveInteger(env, "ORBIT_DB_STATEMENT_TIMEOUT_MS") ?? base.statementTimeoutMillis,
  };
}

/** pg Pool/Client options derived from a profile. */
export function poolTimeoutOptions(profile: DatabaseRuntimeProfile): {
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  query_timeout: number;
  statement_timeout?: number;
} {
  return {
    connectionTimeoutMillis: profile.connectionTimeoutMillis,
    idleTimeoutMillis: profile.idleTimeoutMillis,
    query_timeout: profile.queryTimeoutMillis,
    ...(profile.statementTimeoutMillis === null ? {} : { statement_timeout: profile.statementTimeoutMillis }),
  };
}
