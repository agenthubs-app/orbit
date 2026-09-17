import { NextResponse } from "next/server";
import { createRelationshipInitializationService, type RelationshipInitializationService } from "../../../../../features/connections/lifecycle/initialization";
import { createConfiguredTransactionalPostgresRuntime } from "../../../../../shared/storage/transactional-postgres";
import { relationshipInitializationSchema } from "../../../../../shared/api-schema/relationship-initialization";
import { success } from "../../../../../shared/api/envelope";
import { AppError } from "../../../../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";
import { lifecycleErrorResponse } from "../../../connections/[id]/lifecycle/handler";

type Context = { params: Promise<{ id: string }> };
export function createRelationshipInitializationHandlers(dependencies: { resolveActor?: ResolveAuthenticatedApiActor; service?: RelationshipInitializationService } = {}) {
  async function boundary(context: Context) {
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) throw new AppError("UNAUTHORIZED", "Sign in to access this resource.");
    const { id } = await context.params;
    if (!id.trim() || id.trim() !== id || id.length > 256 || id.includes("\0")) throw new AppError("VALIDATION_ERROR", "Invalid contact identifier.");
    const runtime = dependencies.service ? null : createConfiguredTransactionalPostgresRuntime();
    const service = dependencies.service ?? (runtime ? createRelationshipInitializationService(runtime) : null);
    if (!service) throw new AppError("SERVICE_UNAVAILABLE", "Relationship storage is not configured.");
    return { service, actorId: actor.id, contactId: id };
  }
  const headers = { "Cache-Control": "private, no-store" };
  return {
    async GET(_request: Request, context: Context) {
      try { const { service, actorId, contactId } = await boundary(context); return NextResponse.json(success(await service.read(actorId, contactId)), { headers }); }
      catch (error) { return lifecycleErrorResponse(error); }
    },
    async POST(request: Request, context: Context) {
      try {
        const { service, actorId, contactId } = await boundary(context);
        const parsed = relationshipInitializationSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) throw new AppError("VALIDATION_ERROR", "请选择本人明确的关系目标或下一步；待联系和维系需要标题及日期。");
        return NextResponse.json(success(await service.initialize(actorId, contactId, { ...parsed.data, choice: parsed.data.choice! })), { headers });
      } catch (error) { return lifecycleErrorResponse(error); }
    },
  };
}
