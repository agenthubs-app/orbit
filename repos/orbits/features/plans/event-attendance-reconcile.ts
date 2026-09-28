/**
 * `plan-event-attendance` 维护任务（RW-11，Sprint W0015）：活动归属的计划写入对账。
 *
 * 名片确认时联系人先提交（联系人是主数据），随后尽力把计划里的这场活动标为已参加；那一步失败
 * 或计划服务当时未配置时，这里兜底：找出本人已有联系人记着 `metEventId`、但生效计划里对应活动
 * （同一 `linkedEventId`）还没「已参加」的 (actor, 活动)，逐个调用幂等的 `markEventAttended`
 * （一条进展记录；已参加后不再出现在查询里）。有上限，到截止时间就停。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import type { PlanService } from "./contract";
import type { PlanMatchRepository } from "./matching-repository";

export const PLAN_EVENT_ATTENDANCE_TASK = "plan-event-attendance";
/** 每次维护最多处理的 (actor, 活动) 数。 */
export const PLAN_EVENT_ATTENDANCE_LIMIT = 50;

export interface PlanEventAttendanceDeps {
  repository: Pick<PlanMatchRepository, "listUnattendedAttributedEvents">;
  planServiceFor: (actorId: string) => PlanService;
}

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

export async function reconcileEventAttendance(
  deps: PlanEventAttendanceDeps,
  input: { limit: number; deadline?: number; now?: () => number },
): Promise<{ examined: number; marked: number; failed: number }> {
  const now = input.now ?? Date.now;
  const summary = { examined: 0, failed: 0, marked: 0 };
  const pending = await deps.repository.listUnattendedAttributedEvents({ limit: input.limit });
  for (const { actorId, eventId } of pending) {
    if (input.deadline !== undefined && now() >= input.deadline) break;
    summary.examined += 1;
    try {
      const result = await deps.planServiceFor(actorId).markEventAttended({ eventId });
      if (result.logs.length > 0) summary.marked += 1;
    } catch {
      // 单个 actor 失败不挡住其他人，下次维护再试。
      summary.failed += 1;
    }
  }
  return summary;
}

export function createPlanEventAttendanceMaintenanceTask(input: {
  resolve: () => PlanEventAttendanceDeps | null;
  limit?: number;
}): MaintenanceTask {
  return {
    name: PLAN_EVENT_ATTENDANCE_TASK,
    async run({ deadline, now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      try {
        return await reconcileEventAttendance(deps, {
          deadline,
          limit: input.limit ?? PLAN_EVENT_ATTENDANCE_LIMIT,
          now: () => now().getTime(),
        });
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
