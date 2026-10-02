/**
 * W0051：`contact-insights` 维护任务（每日 cron 与 600 s 心跳的每一轮都执行，照 `features/plans/match-maintenance-task.ts`）。
 *
 * 1. 进程中途退出（租约过期）的 started 行标 failed（不自动重调，等下一次待更新）；
 * 2. 按 actor 领取到期的待更新行（每批 ≤20 人，同一 actor 才合批），每批预留 1 次后台池操作、调用一次模型；
 *    额度不够整组顺延到下一东京日。每轮最多 `CONTACT_INSIGHTS_MAINTENANCE_BATCHES` 批。
 * 表还没迁移（42P01）时整轮 skipped，不报警。空闲时只有一条走部分索引的领取语句。
 */
import { randomUUID } from "node:crypto";

import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { CONTACT_INSIGHT_BATCH_LIMIT } from "./generator";
import { CONTACT_INSIGHT_LEASE_MS, processClaimedInsightBatch, type ContactInsightWorkerDeps } from "./worker";

export const CONTACT_INSIGHTS_MAINTENANCE_TASK = "contact-insights";
/** 每轮最多处理的批数（每批 ≤20 人、至多 1 次 AI 调用）。 */
export const CONTACT_INSIGHTS_MAINTENANCE_BATCHES = 10;

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createContactInsightsMaintenanceTask(input: {
  resolve: () => ContactInsightWorkerDeps | null;
  batches?: number;
}): MaintenanceTask {
  return {
    name: CONTACT_INSIGHTS_MAINTENANCE_TASK,
    async run({ deadline, now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const summary = { batches: 0, callsResponded: 0, contacts: 0, deferred: 0, failed: 0, interrupted: 0, noGoal: 0, unchanged: 0 };
      try {
        summary.interrupted = await deps.repository.sweepInterrupted(now());
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
      const owner = `contact-insights-maintenance:${randomUUID()}`;
      const limit = input.batches ?? CONTACT_INSIGHTS_MAINTENANCE_BATCHES;
      for (let index = 0; index < limit && Date.now() < deadline; index += 1) {
        const batch = await deps.repository.claimDirtyBatch({ leaseMs: CONTACT_INSIGHT_LEASE_MS, limit: CONTACT_INSIGHT_BATCH_LIMIT, now: now(), owner });
        if (!batch) break;
        summary.batches += 1;
        try {
          const outcome = await processClaimedInsightBatch({ ...deps, now }, batch);
          summary.callsResponded += outcome.callsResponded;
          summary.contacts += outcome.contacts;
          if (outcome.status === "deferred" || outcome.status === "unavailable") summary.deferred += 1;
          else if (outcome.status === "failed" || outcome.status === "not_owner") summary.failed += 1;
          else if (outcome.status === "no_goal") summary.noGoal += 1;
          else if (outcome.status === "nothing") summary.unchanged += 1;
        } catch (error) {
          summary.failed += 1;
          console.error(JSON.stringify({ actorId: batch.actorId, error: error instanceof Error ? error.name : "unknown", event: "contact_insights_batch_failed" }));
          // 租约留着：到期后由下一轮 sweep 标 failed（不自动重调）。
        }
      }
      return summary;
    },
  };
}
