import { NextResponse } from "next/server";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
  type ResolveAuthenticatedApiActor,
} from "../../_shared/authenticated-actor";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError } from "../../../../shared/errors/app-error";
import { isReadCostAdmin } from "../../../../features/operations/read-cost/config";
import { readReadCostOverview } from "../../../../features/operations/read-cost/overview";
import {
  createConfiguredTransactionalPostgresRuntime,
  type TransactionalSqlExecutor,
} from "../../../../shared/storage/transactional-postgres";

// GET /api/admin/read-cost[?route=<route template>]: the 读取量 admin read model.
// Only accounts listed in ORBIT_READ_COST_ADMIN_ACCOUNT_IDS get data; everyone
// else gets 403 before any rollup table is read.
export function createReadCostAdminHandler(options: {
  resolveActor?: ResolveAuthenticatedApiActor;
  env?: Record<string, string | undefined>;
  client?: () => TransactionalSqlExecutor | null;
  now?: () => Date;
} = {}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    if (!isReadCostAdmin(actor.id, options.env ?? process.env)) {
      return NextResponse.json(failure(new AppError("FORBIDDEN", "Read-cost monitoring is limited to configured admins.")), { status: 403, headers });
    }
    const client = (options.client ?? (() => createConfiguredTransactionalPostgresRuntime()?.client ?? null))();
    if (!client) {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Read-cost storage is not configured.")), { status: 503, headers });
    }
    const route = new URL(request.url).searchParams.get("route");
    try {
      const overview = await readReadCostOverview(client, { now: (options.now ?? (() => new Date()))(), route: route?.slice(0, 300) ?? null });
      return NextResponse.json(success(overview), { headers });
    } catch {
      return NextResponse.json(failure(new AppError("SERVICE_UNAVAILABLE", "Read-cost data is temporarily unavailable.")), { status: 503, headers });
    }
  };
}
