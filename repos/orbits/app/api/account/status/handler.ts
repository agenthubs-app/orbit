import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { getPasswordSessionStatus, type PasswordSessionStatus } from "../../../../features/auth/session-revocation";
import { createConfiguredTransactionalPostgresRuntime } from "../../../../shared/storage/transactional-postgres";

interface AccountStatusClaims {
  email: string;
  userId: string;
  authenticatedAt: number;
}

type ResolveClaims = (request: Request) => Promise<AccountStatusClaims | null>;
type GetStatus = (claims: AccountStatusClaims) => Promise<PasswordSessionStatus>;
type DeletionState = { status: "pending" | "purging" | "disabled"; accountId?: string } | null;

async function getDeletionState(claims: AccountStatusClaims): Promise<DeletionState> {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const found = await runtime.client.query<{ status: string; actor_id: string; requested_at: string }>(`select
    payload->>'status' as status,payload->>'actorId' as actor_id,payload->>'requestedAt' as requested_at
    from orbit_records where workspace_id=$1 and collection_name='account_deletion_requests'
    and payload->>'userId'=$2 and payload->>'status' in ('pending','purging')
    order by updated_at desc limit 1`, [runtime.workspaceId, claims.userId]);
  const row = found.rows[0];
  if (!row || row.status !== "pending" && row.status !== "purging") return null;
  if (!row.actor_id || !row.requested_at || Date.parse(row.requested_at) >= claims.authenticatedAt) return { status: "disabled" };
  return { status: row.status, accountId: row.actor_id };
}

async function resolveClaims(request: Request): Promise<AccountStatusClaims | null> {
  const token = await getToken({
    req: request as NextRequest,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: new URL(request.url).protocol === "https:",
  });
  if (!token || typeof token.email !== "string" || typeof token.sub !== "string") return null;
  const authenticatedAt = typeof token.authenticatedAt === "number"
    ? token.authenticatedAt
    : typeof token.iat === "number" ? token.iat * 1000 : NaN;
  if (!Number.isSafeInteger(authenticatedAt) || authenticatedAt < 0) return null;
  return { email: token.email, userId: token.sub, authenticatedAt };
}

export function createAccountStatusGetHandler(dependencies: {
  resolveClaims?: ResolveClaims;
  getStatus?: GetStatus;
  getDeletionState?: (claims: AccountStatusClaims) => Promise<DeletionState>;
} = {}) {
  const readClaims = dependencies.resolveClaims ?? resolveClaims;
  const getStatus = dependencies.getStatus ?? (claims => getPasswordSessionStatus(claims));
  return async function accountStatusGet(request: Request): Promise<Response> {
    try {
      const claims = await readClaims(request);
      if (!claims) return Response.json({ status: "rejected" }, { status: 401, headers: { "cache-control": "private, no-store" } });
      const status = await getStatus(claims);
      const deletion = status === "active" ? await (dependencies.getDeletionState ?? getDeletionState)(claims) : null;
      return Response.json(deletion ?? { status }, { status: 200, headers: { "cache-control": "private, no-store" } });
    } catch {
      return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "5" } });
    }
  };
}
