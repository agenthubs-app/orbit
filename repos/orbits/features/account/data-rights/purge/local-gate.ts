import { AsyncLocalStorage } from "node:async_hooks";

import type { TransactionalSqlExecutor } from "../../../../shared/storage/transactional-postgres";

/**
 * Controlled one-account operations (features/account/controlled-ops) run the same purge steps outside the local test
 * database, but only inside this scope. The scope is entered only by `runInControlledAccountOpsScope`, which refuses
 * unless the process is the build-time operator script (never a serverless function or the Next.js server).
 * Outside the scope both checks below behave exactly as before.
 */
const controlledScope = new AsyncLocalStorage<symbol>();
const CONTROLLED_SCOPE = Symbol("controlled-account-ops");

/** The operator script sets ORBIT_ACCOUNT_OPS=build-only; a deployed function or the Next.js runtime never qualifies. */
export function assertControlledAccountOpsProcess(env: Record<string, string | undefined> = process.env): void {
  if (env.ORBIT_ACCOUNT_OPS !== "build-only" || env.AWS_LAMBDA_FUNCTION_NAME || env.NEXT_RUNTIME || env.NEXT_PHASE === "phase-production-server") {
    throw new Error("CONTROLLED_ACCOUNT_OPS_DISABLED");
  }
}

export function runInControlledAccountOpsScope<T>(work: () => Promise<T>): Promise<T> {
  assertControlledAccountOpsProcess();
  return controlledScope.run(CONTROLLED_SCOPE, work);
}

function inControlledScope(): boolean {
  if (controlledScope.getStore() !== CONTROLLED_SCOPE) return false;
  assertControlledAccountOpsProcess();
  return true;
}

export function assertLocalAccountPurgeTarget(env: Record<string, string | undefined> = process.env): void {
  if (inControlledScope()) return;
  if (env.ORBIT_DATABASE_TARGET !== "local" || env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    throw new Error("LOCAL_PURGE_DISABLED");
  }
  let url: URL;
  try { url = new URL(env.ORBIT_LOCAL_DATABASE_URL ?? ""); }
  catch { throw new Error("LOCAL_PURGE_DISABLED"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/orbit_line_c_test") {
    throw new Error("LOCAL_PURGE_DISABLED");
  }
}

/** Check the actual connection as well as the configured URL before deleting anything. */
export async function assertLocalAccountPurgeDatabase(sql: TransactionalSqlExecutor): Promise<void> {
  if (inControlledScope()) return;
  const result = await sql.query<{ database: string; address: string | null }>(
    "select current_database() as database, host(inet_server_addr()) as address",
  );
  const row = result.rows[0];
  if (row?.database !== "orbit_line_c_test" || !["127.0.0.1", "::1"].includes(row.address ?? "")) {
    throw new Error("LOCAL_PURGE_DISABLED");
  }
}
