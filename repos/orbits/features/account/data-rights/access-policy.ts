import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";

export type AccountRightsAccessState = "active" | "pending" | "purging" | "unavailable";

export function accountRightsAccessDecision(state: AccountRightsAccessState, method: string, pathname: string): "allow" | "reject-api" | "redirect-pending" {
  if (state === "active") return "allow";
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/account/status" && method === "GET" || pathname === "/api/app/version" && method === "GET") return "allow";
    if (pathname === "/api/account/session/sign-out" && method === "POST") return "allow";
    if (pathname.startsWith("/api/auth/")) return "allow";
    if (state === "pending") {
      if (pathname === "/api/account/deletion-request" && (method === "GET" || method === "DELETE")) return "allow";
      if (method === "GET" && /^\/api\/account\/exports\/[^/]+(?:\/download)?$/u.test(pathname)) return "allow";
    }
    return "reject-api";
  }
  if (pathname.startsWith("/app/")) {
    if (pathname === "/app/account/pending" || pathname === "/app/account/deleted" || pathname === "/app/account/login") return "allow";
    return "redirect-pending";
  }
  return "allow";
}

export async function readAccountRightsAccessState(input: {
  db: TransactionalSqlExecutor;
  workspaceId: string;
  userId: string;
}): Promise<AccountRightsAccessState> {
  const found = await input.db.query<{ status: string }>(`select payload->>'status' as status from orbit_records
    where workspace_id=$1 and collection_name='account_deletion_requests' and payload->>'userId'=$2
    order by updated_at desc limit 1`, [input.workspaceId, input.userId]);
  const status = found.rows[0]?.status;
  return status === "pending" || status === "purging" ? status : "active";
}

/** LF4: how long one server instance reuses a user's state for the per-request gate (proxy). */
export const ACCOUNT_RIGHTS_GATE_CACHE_MS = 15_000;
const gateCache = new Map<string, { state: AccountRightsAccessState; at: number }>();
const GATE_CACHE_MAX = 10_000;

/** A deletion request, cancellation or purge step on this instance ends the cached state at once. */
export function invalidateAccountRightsAccessState(userId?: string): void {
  if (userId === undefined) gateCache.clear(); else gateCache.delete(userId);
}

/**
 * The authoritative read (fresh, fail closed): account provisioning uses it, so purging can never be raced by a
 * re-registration (R18c). `unavailable` when the store cannot be read.
 */
export async function readConfiguredAccountRightsAccessState(userId: string): Promise<AccountRightsAccessState> {
  try {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    if (!runtime) return process.env.VERCEL_ENV === "production" ? "unavailable" : "active";
    return await readAccountRightsAccessState({ db: runtime.client, workspaceId: runtime.workspaceId, userId });
  } catch { return "unavailable"; }
}

/**
 * LF4: the per-request gate (proxy.ts). One read per user per instance every ACCOUNT_RIGHTS_GATE_CACHE_MS instead
 * of one per request; a store that cannot be read lets the request through (the handlers behind it read the same
 * store and fail on their own) instead of answering 503 to every API — the deletion request already revoked the
 * account's sessions, so this gate is defence in depth. A missing store configuration counts as active.
 */
export async function readAccountRightsGateState(userId: string, now: number = Date.now()): Promise<AccountRightsAccessState> {
  const cached = gateCache.get(userId);
  if (cached && now - cached.at < ACCOUNT_RIGHTS_GATE_CACHE_MS) return cached.state;
  let state: AccountRightsAccessState = "active";
  try {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    if (runtime) state = await readAccountRightsAccessState({ db: runtime.client, workspaceId: runtime.workspaceId, userId });
  } catch {
    console.warn(JSON.stringify({ event: "account_rights_gate_unreadable" }));
    return "active";
  }
  if (gateCache.size >= GATE_CACHE_MAX) gateCache.clear();
  gateCache.set(userId, { state, at: now });
  return state;
}
