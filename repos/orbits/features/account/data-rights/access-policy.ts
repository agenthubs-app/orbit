import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";

export type AccountRightsAccessState = "active" | "pending" | "purging" | "unavailable";

export function accountRightsAccessDecision(state: AccountRightsAccessState, method: string, pathname: string): "allow" | "reject-api" | "redirect-pending" {
  if (state === "active") return "allow";
  if (pathname.startsWith("/api/")) {
    if (pathname === "/api/account/status" && method === "GET" || pathname === "/api/app/version" && method === "GET") return "allow";
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

export async function readConfiguredAccountRightsAccessState(userId: string): Promise<AccountRightsAccessState> {
  try {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    if (!runtime) return process.env.VERCEL_ENV === "production" ? "unavailable" : "active";
    return readAccountRightsAccessState({ db: runtime.client, workspaceId: runtime.workspaceId, userId });
  } catch { return "unavailable"; }
}
