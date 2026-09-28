/**
 * `plan-event-registration` 维护任务（RW-12，Sprint W0012）：报名状态的计划写入对账。
 *
 * 报名／取消是主数据：路由在报名成功后尽力调用 `markEventRegistration`，那一步失败（计划库不可用、
 * 进程中断）时计划里的活动会停在旧状态。这里兜底：取生效计划里还没「已参加」的活动条目
 * （`listActiveEventItems`，按 actor，有上限），按本人读当前的报名状态（与活动页同一个读取入口），
 * 状态不一致的逐个用报名记录的版本重放幂等的 `markEventRegistration`：
 * - 报名有效（rsvped）而条目是「推荐」→ 已报名；
 * - 报名已取消而条目是「已报名」→ 推荐；
 * - 没有报名记录：不动（没有证据说明取消过）；已参加是终态，查询里就不出现。
 * 版本比较在服务里做，重放的是当前真实状态，不会被更早的请求覆盖。每次最多重放 50 条，
 * 单个 actor 失败不影响其他人，到截止时间就停。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import type { PlanService } from "./contract";

export const PLAN_EVENT_REGISTRATION_TASK = "plan-event-registration";
/** 每次维护最多重放的 (actor, 活动) 数。 */
export const PLAN_EVENT_REGISTRATION_LIMIT = 50;
/** 每次最多检查的计划活动条目数（查询按随机顺序取，多次维护后覆盖全部）。 */
export const PLAN_EVENT_REGISTRATION_SCAN = 200;

export interface PlanEventItemState {
  actorId: string;
  eventId: string;
  status: "recommended" | "registered";
}

export interface CurrentRegistration {
  eventId: string;
  status: "rsvped" | "cancelled";
  updatedAt: string;
}

export interface PlanEventRegistrationDeps {
  listActiveEventItems(input: { limit: number }): Promise<PlanEventItemState[]>;
  /** 本人在这些活动上的当前报名（只读本人）。 */
  readRegistrations(input: { actorId: string; eventIds: readonly string[] }): Promise<CurrentRegistration[]>;
  planServiceFor: (actorId: string) => PlanService;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

export async function reconcileEventRegistrations(
  deps: PlanEventRegistrationDeps,
  input: { limit: number; scan?: number; deadline?: number; now?: () => number },
): Promise<{ examined: number; replayed: number; failed: number }> {
  const now = input.now ?? Date.now;
  const summary = { examined: 0, failed: 0, replayed: 0 };
  const items = await deps.listActiveEventItems({ limit: input.scan ?? PLAN_EVENT_REGISTRATION_SCAN });
  const byActor = new Map<string, PlanEventItemState[]>();
  for (const item of items) byActor.set(item.actorId, [...(byActor.get(item.actorId) ?? []), item]);
  for (const [actorId, actorItems] of byActor) {
    if (summary.replayed + summary.failed >= input.limit) break;
    if (input.deadline !== undefined && now() >= input.deadline) break;
    let registrations: CurrentRegistration[];
    try {
      registrations = await deps.readRegistrations({ actorId, eventIds: actorItems.map((item) => item.eventId) });
    } catch {
      summary.failed += 1;
      continue;
    }
    const current = new Map(registrations.map((registration) => [registration.eventId, registration]));
    for (const item of actorItems) {
      if (summary.replayed + summary.failed >= input.limit) break;
      summary.examined += 1;
      const registration = current.get(item.eventId);
      if (!registration) continue;
      const registered = registration.status === "rsvped";
      if (registered === (item.status === "registered")) continue;
      try {
        const result = await deps.planServiceFor(actorId).markEventRegistration({
          eventId: item.eventId,
          registered,
          registrationVersion: registration.updatedAt,
        });
        if (result.log) summary.replayed += 1;
      } catch {
        summary.failed += 1;
      }
    }
  }
  return summary;
}

export function createPlanEventRegistrationMaintenanceTask(input: {
  resolve: () => PlanEventRegistrationDeps | null;
  limit?: number;
}): MaintenanceTask {
  return {
    name: PLAN_EVENT_REGISTRATION_TASK,
    async run({ deadline, now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      try {
        return await reconcileEventRegistrations(deps, {
          deadline,
          limit: input.limit ?? PLAN_EVENT_REGISTRATION_LIMIT,
          now: () => now().getTime(),
        });
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
