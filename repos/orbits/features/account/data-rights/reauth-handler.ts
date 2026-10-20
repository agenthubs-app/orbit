import { z } from "zod";

import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createConfiguredAccountDeletionStore } from "./deletion-handlers";
import { createPasswordDeletionReauth } from "./reauth";

const bodySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("password"), password: z.string().min(1).max(256) }).strict(),
  z.object({ method: z.literal("google") }).strict(),
]);

type Verify = ReturnType<typeof createPasswordDeletionReauth>;

export function createAccountDeletionReauthHandler(deps: {
  resolveActor?: ResolveAuthenticatedApiActor;
  verifyPassword?: Verify;
  issueReceipt?: (actorId: string, userId: string, purpose: "deletion-request", evidenceAt: Date) => Promise<string>;
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
      // The R18b broker must supply a fresh IdP auth_time proof before this branch can issue receipts.
      return Response.json({ error: "google_reauth_unavailable" }, { status: 503, headers });
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
