import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { aiSubspaceOf } from "../../../features/sync/ai-session-domain-reader";
import { resolveSharedReadBudgetGate } from "../../../features/sync/read-budget-gate";
import { failure, success } from "../../../shared/api/envelope";
import { AppError } from "../../../shared/errors/app-error";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import { readChangeTokens, type ChangeArea } from "../../../shared/storage/change-tokens";
import type { DomainWatermarkSqlClient } from "../../../shared/storage/domain-watermark";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";

/**
 * GET /api/changes — the Web's change cursor (shared/storage/change-tokens.ts): one opaque token per area.
 * The browser asks while a page is visible (every X-Poll-Interval seconds, on focus and when back online) and
 * reads an area again only when its token moved. ETag + If-None-Match: an unchanged answer is a 304 with no
 * body (the browser's own revalidation), as GitHub's notifications endpoint does.
 * private + no-cache + Vary: Cookie: only this person's browser keeps it, always revalidated; the sign-out
 * response clears the browser cache (Clear-Site-Data).
 */
export const CHANGES_POLL_SECONDS = 30;

export interface ChangesRouteDependencies {
  resolveActor?: ResolveAuthenticatedApiActor;
  storage?: () => { client: DomainWatermarkSqlClient; workspaceId: string } | null;
  readTokens?: typeof readChangeTokens;
}

export function createChangesGetHandler(dependencies: ChangesRouteDependencies = {}) {
  return async function GET(request: Request): Promise<Response> {
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const headers = { "Cache-Control": "private, no-cache", Vary: "Cookie", "X-Poll-Interval": String(CHANGES_POLL_SECONDS) };
    try {
      const store = (dependencies.storage ?? createConfiguredPostgresLiveRecordStore)();
      const workspaceId = actor.workspaceId ?? store?.workspaceId;
      if (!store || !workspaceId || (actor.workspaceId && actor.workspaceId !== store.workspaceId)) throw new Error("Storage scope unavailable");
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "changes" });
      const tokens: Record<ChangeArea, string> = await (dependencies.readTokens ?? readChangeTokens)({
        client: store.client, workspaceId, actorId: actor.id, accountId: actor.accountId ?? actor.id,
        agentWorkspaceId: aiSubspaceOf({ workspaceId, actorId: actor.id }),
      });
      const etag = `W/"${createHash("sha256").update(JSON.stringify(tokens)).digest("hex").slice(0, 32)}"`;
      const ifNoneMatch = request.headers.get("if-none-match");
      if (ifNoneMatch && ifNoneMatch.split(",").some((candidate) => candidate.trim() === etag)) {
        return new Response(null, { status: 304, headers: { ...headers, ETag: etag } });
      }
      return NextResponse.json(success({ tokens, pollAfterSeconds: CHANGES_POLL_SECONDS }), { headers: { ...headers, ETag: etag } });
    } catch {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Change tokens are temporarily unavailable.")), { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
  };
}
