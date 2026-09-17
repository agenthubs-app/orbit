import { NextResponse } from "next/server";
import { createConfiguredRelationshipLifecycleApiRuntime } from "../../../../../features/connections/lifecycle/api-runtime";
import { createRelationshipLifecycleService, type RelationshipLifecycleService } from "../../../../../features/connections/lifecycle/service";
import { RelationshipLifecycleError } from "../../../../../features/connections/lifecycle/contract";
import type { RelationshipLifecycleRepository } from "../../../../../features/connections/lifecycle/repository";
import { relationshipCompletionSchema } from "../../../../../shared/api-schema/relationship-lifecycle";
import { failure, success } from "../../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";

interface Dependencies { resolveActor?: ResolveAuthenticatedApiActor; repository?: RelationshipLifecycleRepository; service?: RelationshipLifecycleService }
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export function lifecycleErrorResponse(error: unknown): Response {
  const appError = error instanceof AppError ? error : error instanceof RelationshipLifecycleError
    ? new AppError(error.code === "NOT_FOUND" || error.code === "FORBIDDEN" ? "NOT_FOUND" : error.code === "CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" ? "CONFLICT" : "VALIDATION_ERROR", error.code === "NOT_FOUND" || error.code === "FORBIDDEN" ? "Relationship not found." : error.code === "CONFLICT" || error.code === "IDEMPOTENCY_CONFLICT" ? "关系已变更或重复请求不一致，请刷新后核对。" : "跟进处理不符合当前关系状态，请检查下一步。")
    : new AppError("INTERNAL_ERROR", "Unable to access relationship lifecycle.");
  return NextResponse.json(failure(appError), { status: getHttpStatusForAppErrorCode(appError.code), headers });
}
export function createRelationshipLifecycleHandlers(dependencies: Dependencies = {}) {
  async function boundary(context: Context) {
    const actor = await (dependencies.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) throw new AppError("UNAUTHORIZED", "Sign in to access this resource.");
    const { id } = await context.params;
    if (!id.trim() || id !== id.trim() || id.length > 256 || id.includes("\0")) throw new AppError("VALIDATION_ERROR", "Invalid relationship identifier.");
    const runtime = dependencies.repository ? null : createConfiguredRelationshipLifecycleApiRuntime();
    const repository = dependencies.repository ?? runtime?.repository;
    if (!repository) throw new AppError("SERVICE_UNAVAILABLE", "Relationship storage is not configured.");
    return { actorId: actor.id, id, repository };
  }
  return {
    async GET(_request: Request, context: Context): Promise<Response> {
      try {
        const { actorId, id, repository } = await boundary(context);
        const snapshot = await repository.read(actorId, id);
        if (!snapshot) throw new AppError("NOT_FOUND", "Relationship not found.");
        return NextResponse.json(success({ snapshot }), { headers });
      } catch (error) { return lifecycleErrorResponse(error); }
    },
    async POST(request: Request, context: Context): Promise<Response> {
      try {
        const { actorId, id, repository } = await boundary(context);
        const body = relationshipCompletionSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) throw new AppError("VALIDATION_ERROR", "请提供跟进、版本和完整的下一步信息。");
        const service = dependencies.service ?? createRelationshipLifecycleService(repository);
        const result = await service.completeTask({ ...body.data, outcome: body.data.outcome!, actorId, connectionId: id });
        return NextResponse.json(success({ snapshot: result.snapshot, replayed: result.replayed }), { headers });
      } catch (error) { return lifecycleErrorResponse(error); }
    },
  };
}
