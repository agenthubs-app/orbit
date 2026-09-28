/**
 * 「我的计划」页 SSR 的计划读取（W0021 从 page.tsx 移出，便于与 API 入口对照测试）。
 *
 * 与 `GET /api/agent/plans/current` 同一个服务入口 `getCurrentView`：先判定（只在这一段还没记过时写）
 * 「进入新阶段」，失败不影响读取（每日 plan-phase 维护任务兜底），再读投影快照（计划页带进展记录）。
 */
import type { PlanService, PlanViewSnapshot } from "../../../../../features/plans/contract";
import { resolvePlanService } from "../../../../../features/plans/service-factory";
import type { ServiceResolution } from "../../../../../shared/services/module-mode";

/** 本人的当前生效计划；没有为 null，服务不可用或读取失败为 "unavailable"。 */
export async function readCurrentPlan(
  actorId: string,
  resolve: (input: { actorId: string }) => ServiceResolution<PlanService> = resolvePlanService,
): Promise<{ service: PlanService | null; snapshot: PlanViewSnapshot | null | "unavailable" }> {
  try {
    const resolution = resolve({ actorId });
    if (resolution.success === false) return { service: null, snapshot: "unavailable" };
    return { service: resolution.service, snapshot: await resolution.service.getCurrentView({ includeLog: true }) };
  } catch {
    return { service: null, snapshot: "unavailable" };
  }
}
