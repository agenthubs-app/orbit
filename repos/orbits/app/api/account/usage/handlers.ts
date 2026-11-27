import { NextResponse } from "next/server";

import { readAccountUsage, accountUsageView } from "../../../../features/ai-quota/usage-read";
import { DEFAULT_ACCOUNT_TIER } from "../../../../features/ai-quota/tiers";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError } from "../../../../shared/errors/app-error";
import { createConfiguredTransactionalPostgresRuntime, type TransactionalPostgresClient } from "../../../../shared/storage/transactional-postgres";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

/**
 * GET /api/account/usage（2026-11-27 分档，只读）：当前用户的档位、三项本月已用 / 上限 / 恢复时间、两档对照表。
 * 没有库（本地 mock）时用量记 0。
 */
export function createAccountUsageRouteHandlers(dependencies: {
  resolveActor?: ResolveAuthenticatedApiActor;
  database?: () => { client: Pick<TransactionalPostgresClient, "query">; workspaceId: string } | null;
  now?: () => Date;
} = {}) {
  const resolveActor = dependencies.resolveActor ?? resolveAuthenticatedApiActor;
  const database = dependencies.database ?? (() => {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    return runtime ? { client: runtime.client, workspaceId: runtime.workspaceId } : null;
  });
  return {
    async GET(): Promise<Response> {
      const actor = await resolveActor();
      if (!actor?.id) return NextResponse.json(failure(new AppError("UNAUTHORIZED", "Sign in to see your usage.")), { status: 401 });
      const tier = actor.tier ?? DEFAULT_ACCOUNT_TIER;
      const now = (dependencies.now ?? (() => new Date()))();
      const target = database();
      try {
        const usage = target ? await readAccountUsage(target.client, { actorId: actor.id, now, tier, workspaceId: target.workspaceId }) : accountUsageView(tier, now, () => 0);
        return NextResponse.json(success(usage), { headers: { "Cache-Control": "private, no-store" }, status: 200 });
      } catch (error) {
        console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "account_usage_read_failed" }));
        return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Usage is temporarily unavailable.")), { status: 503 });
      }
    },
  };
}
