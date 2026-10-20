import { z } from "zod";
import { getToken } from "next-auth/jwt";

import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createConfiguredAccountDeletionStore } from "./deletion-handlers";
import { createPasswordDeletionReauth } from "./reauth";
import { issueGoogleReauthChallenge, verifyGoogleReauthProof, type GoogleReauthProof } from "./google-reauth-proof";
import { readAccountDeletionMethod } from "./method-handler";

const bodySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("password"), password: z.string().min(1).max(256) }).strict(),
  z.object({ method: z.literal("google"), challenge: z.string().min(1).max(2048).optional() }).strict(),
]);
const GOOGLE_WEB_COOKIE = "orbit-deletion-google-reauth";
const googleWebCookie = (challenge: string, secure: boolean) =>
  `${GOOGLE_WEB_COOKIE}=${challenge}; Path=/api/account/deletion-request/reauth; HttpOnly; SameSite=Lax; Max-Age=300${secure ? "; Secure" : ""}`;
const clearGoogleWebCookie = (secure: boolean) =>
  `${GOOGLE_WEB_COOKIE}=; Path=/api/account/deletion-request/reauth; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
const readGoogleWebCookie = (request: Request) =>
  request.headers.get("cookie")?.match(/(?:^|;\s*)orbit-deletion-google-reauth=([^;]+)/u)?.[1] ?? null;

type Verify = ReturnType<typeof createPasswordDeletionReauth>;

export function createAccountDeletionReauthHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  verifyPassword?: Verify;
  issueReceipt?: (actorId: string, userId: string, purpose: "deletion-request", evidenceAt: Date) => Promise<string>;
  readGoogleProof?: (request: Request) => Promise<GoogleReauthProof | null>;
  googleSecret?: string;
} = {}) {
  const actor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "private, no-store" };
    let principal;
    try { principal = await actor(); }
    catch { return Response.json({ error: "unavailable" }, { status: 503, headers }); }
    if (!principal?.id || !principal.userId || !principal.email) return Response.json({ error: "unauthorized" }, { status: 401, headers });
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400, headers });
    if (parsed.data.method === "google") {
      // 主会话代定 §R18c-3: checked ID-token auth_time, original account and purpose.
      const cookieChallenge = readGoogleWebCookie(request);
      const challenge = cookieChallenge ?? parsed.data.challenge;
      if (!challenge) return Response.json({ error: "invalid_request" }, { status: 400, headers });
      const secret = deps.googleSecret ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
      const deletion = deps.issueReceipt ? null : createConfiguredAccountDeletionStore();
      const issue = deps.issueReceipt ?? deletion?.issueReceipt;
      if (!secret || !issue) return Response.json({ error: "unavailable" }, { status: 503, headers });
      const googleHeaders = cookieChallenge ? { ...headers, "set-cookie": clearGoogleWebCookie(new URL(request.url).protocol === "https:") } : headers;
      try {
        const proof = await (deps.readGoogleProof ?? readGoogleReauthSessionProof)(request);
        const evidenceAt = await verifyGoogleReauthProof({
          challenge, principal: { actorId: principal.id, userId: principal.userId, email: principal.email },
          proof, secret,
        });
        if (!evidenceAt) return Response.json({ error: "invalid_credentials" }, { status: 403, headers: googleHeaders });
        const receipt = await issue(principal.id, principal.userId, "deletion-request", evidenceAt);
        return Response.json({ reauthReceipt: receipt }, { status: 200, headers: googleHeaders });
      } catch { return Response.json({ error: "unavailable" }, { status: 503, headers: googleHeaders }); }
    }
    const runtime = deps.verifyPassword ? null : createConfiguredTransactionalPostgresRuntime();
    const verify = deps.verifyPassword ?? (runtime ? createPasswordDeletionReauth({ db: runtime.client, workspaceId: runtime.workspaceId }) : null);
    const deletion = deps.issueReceipt ? null : createConfiguredAccountDeletionStore();
    const issue = deps.issueReceipt ?? (deletion ? deletion.issueReceipt : null);
    if (!verify || !issue) return Response.json({ error: "unavailable" }, { status: 503, headers });
    try {
      const result = await verify(principal.id, principal.userId, principal.email, parsed.data.password);
      if (result === "limited") return Response.json({ error: "rate_limited" }, { status: 429, headers });
      if (result !== "verified") return Response.json({ error: "invalid_credentials" }, { status: 403, headers });
      const receipt = await issue(principal.id, principal.userId, "deletion-request", new Date());
      return Response.json({ reauthReceipt: receipt }, { status: 200, headers });
    } catch {
      return Response.json({ error: "unavailable" }, { status: 503, headers });
    }
  };
}

async function readGoogleReauthSessionProof(request: Request): Promise<GoogleReauthProof | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const cookie = request.headers.get("cookie") ?? "";
  const cookieName = cookie.includes("__Secure-authjs.session-token=") ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await getToken({ req: request, secret, cookieName });
  return token ? { sub: token.sub, email: token.email, googleAuthTime: token.googleAuthTime } : null;
}

export function createAccountDeletionGoogleStartHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  readMethod?: (actorId: string, userId: string) => Promise<"credentials" | "google" | null>;
  secret?: string;
} = {}) {
  return async (request?: Request): Promise<Response> => {
    const headers = { "cache-control": "private, no-store" };
    try {
      const principal = await (deps.resolveActor ?? resolveAuthenticatedApiActor)();
      if (!principal?.id || !principal.userId || !principal.email) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      const runtime = deps.readMethod ? null : createConfiguredTransactionalPostgresRuntime();
      const method = deps.readMethod ?? (runtime ? (actorId: string, userId: string) => readAccountDeletionMethod(runtime.client, runtime.workspaceId, actorId, userId) : null);
      const secret = deps.secret ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
      if (!method || !secret) return Response.json({ error: "unavailable" }, { status: 503, headers });
      if (await method(principal.id, principal.userId) !== "google") return Response.json({ error: "invalid_method" }, { status: 403, headers });
      const challenge = await issueGoogleReauthChallenge({ actorId: principal.id, userId: principal.userId, email: principal.email, secret });
      if (request && (await request.json().catch(() => null) as { channel?: unknown } | null)?.channel === "web") {
        return Response.json({ started: true }, { status: 200, headers: { ...headers,
          "set-cookie": googleWebCookie(challenge, new URL(request.url).protocol === "https:") } });
      }
      return Response.json({ challenge }, { status: 200, headers });
    } catch { return Response.json({ error: "unavailable" }, { status: 503, headers }); }
  };
}
