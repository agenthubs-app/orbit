import { NextResponse } from "next/server";
import { success, failure } from "../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { contactGoalRelatedIdsSchema } from "../../../../shared/api-schema/contact-goal-related";
import type { ContactGoalRelatedIdsDTO } from "../../../../shared/contract/contact-goal-related";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { resolveSharedReadBudgetGate } from "../../../../features/sync/read-budget-gate";

/**
 * R11a：GET /api/contacts/goal-related-ids（只读、要登录）。live 读本人生效计划；mock 模式返回演示世界。
 * 读预算闸门检查 plans 集合；计划读失败时报 SERVICE_UNAVAILABLE（App 用上次缓存，界面退回不含计划的浓度）。
 */
export function createContactGoalRelatedGetHandler(options: {
  resolveActor?: ResolveAuthenticatedApiActor;
  read?: (actorId: string) => Promise<ContactGoalRelatedIdsDTO>;
  readFollowUps?: (actorId: string) => Promise<string[]>;
  mode?: () => string;
} = {}) {
  return async function GET(): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const headers = { "Cache-Control": "private, no-store" };
    try {
      if ((options.mode ?? resolveModuleMode)() !== "live" && !options.read) {
        const { DEMO_GOAL_RELATED } = await import("../../../../shared/mock/demo-world/network");
        return NextResponse.json(success(contactGoalRelatedIdsSchema.parse({ ...DEMO_GOAL_RELATED, asOf: new Date().toISOString() })), { headers });
      }
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "plans" });
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "tasks" });
      const read = options.read ?? (async (actorId: string) => (await import("../../../../features/contacts/goal-related")).readContactGoalRelated(actorId));
      const readFollowUps = options.readFollowUps ?? (options.read ? async () => [] : async (actorId: string) => (await import("../../../../features/contacts/goal-related")).readConfiguredOpenFollowUpIds(actorId));
      const [goal, followUpContactIds] = await Promise.all([read(actor.id), readFollowUps(actor.id)]);
      return NextResponse.json(success(contactGoalRelatedIdsSchema.parse({ ...goal, followUpContactIds })), { headers });
    } catch (error) {
      const safe = error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "目標に関係する人を読み込めませんでした。");
      return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
