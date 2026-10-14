/**
 * R26 评估处理器的兜底（events DESIGN §5「执行方式」，复核 M5）。Owner: 甲 (R26).
 * 维护任务每一轮（心跳约每分钟）：回收超过 2 分钟的 `reading`（→ failed / timeout，结算额度）→ 认领租约过期的 `reading`（≤20 条）→
 * 清理 7 天前的海报资产。请求里的 `after()` 是第一次处理；这里只兜底，不重复入队（租约保护）。
 */
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { POSTER_RETENTION_MS, type EventAssessmentService } from "./service";
import type { EventAssessmentRepository } from "./repository";

export const EVENT_ASSESSMENT_READING_TASK = "event_assessment_reading";
export const EVENT_ASSESSMENT_BATCH = 20;

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createEventAssessmentReadingMaintenanceTask(input: { resolve: () => { service: EventAssessmentService; repository: EventAssessmentRepository } | null }): MaintenanceTask {
  return {
    name: EVENT_ASSESSMENT_READING_TASK,
    async run({ now }) {
      const runtime = input.resolve();
      if (!runtime) return { skipped: "database_unconfigured" };
      try {
        const reclaimed = await runtime.service.reclaimStale({ limit: 50 });
        const processed = await runtime.service.processReading({ limit: EVENT_ASSESSMENT_BATCH });
        const posters = await runtime.repository.purgePostersBefore(new Date(now().getTime() - POSTER_RETENTION_MS).toISOString());
        return { posters, processed, reclaimed };
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
