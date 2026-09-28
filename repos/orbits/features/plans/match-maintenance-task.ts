/**
 * `plan-match` 维护任务（RW-11，Sprint W0010）：每日 `/api/internal/maintenance` 执行，
 * 有上限地领取到期的人脉需求匹配任务（用户关掉审阅页、请求中途消失、单张补录的当天任务到期）。
 * 不经过浏览器；执行逻辑与审阅页触发的是同一个 worker。
 */
import type { MaintenanceTask } from "../operations/maintenance/pass";
import { runDueMatchJobs, type PlanMatchWorkerDeps } from "./match-worker";

export const PLAN_MATCH_MAINTENANCE_TASK = "plan-match";
/** 每次维护最多执行的任务数（每个任务最多一次 AI 调用）。 */
export const PLAN_MATCH_MAINTENANCE_LIMIT = 20;

function isUndefinedTable(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "42P01";
}

export function createPlanMatchMaintenanceTask(input: {
  resolveWorker: () => PlanMatchWorkerDeps | null;
  limit?: number;
}): MaintenanceTask {
  return {
    name: PLAN_MATCH_MAINTENANCE_TASK,
    async run({ deadline, now }) {
      const worker = input.resolveWorker();
      if (!worker) return { skipped: "database_unconfigured" };
      try {
        return await runDueMatchJobs(worker, {
          deadline,
          limit: input.limit ?? PLAN_MATCH_MAINTENANCE_LIMIT,
          now: () => now().getTime(),
        });
      } catch (error) {
        // 匹配表的迁移还没在这个库上执行（需要授权）：跳过而不是每天报警。
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
