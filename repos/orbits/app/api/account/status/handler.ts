import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { getPasswordSessionStatus, type PasswordSessionStatus } from "../../../../features/auth/session-revocation";

interface AccountStatusClaims {
  email: string;
  userId: string;
  authenticatedAt: number;
}

type ResolveClaims = (request: Request) => Promise<AccountStatusClaims | null>;
type GetStatus = (claims: AccountStatusClaims) => Promise<PasswordSessionStatus>;

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
} = {}) {
  const readClaims = dependencies.resolveClaims ?? resolveClaims;
  const getStatus = dependencies.getStatus ?? (claims => getPasswordSessionStatus(claims));
  return async function accountStatusGet(request: Request): Promise<Response> {
    try {
      const claims = await readClaims(request);
      if (!claims) return Response.json({ status: "rejected" }, { status: 401, headers: { "cache-control": "private, no-store" } });
      const status = await getStatus(claims);
      return Response.json({ status }, { status: 200, headers: { "cache-control": "private, no-store" } });
    } catch {
      return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "5" } });
    }
  };
}
