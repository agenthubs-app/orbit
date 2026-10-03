/**
 * W0051：`contact-insights` 维护任务（每日 cron 与 600 s 心跳的每一轮都执行，照 `features/plans/match-maintenance-task.ts`）。
 *
 * 1. 进程中途退出（租约过期）的 started 行标 failed（W0057：纳入自动重试排期，见 repository.ts）；
 * 1b. W0057（G-2）「缺行对账」：近 7 天创建／更新、已确认、还没有洞察行的联系人补行（每轮 ≤200 行），交给同一轮领取；
 * 2. 按 actor 领取到期的待更新行（每批 ≤20 人，同一 actor 才合批），每批预留 1 次后台池操作、调用一次模型；
 *    额度不够整组顺延到下一东京日。每轮最多 `CONTACT_INSIGHTS_MAINTENANCE_BATCHES` 批。
 * 3. W0058（G-3）：重放洞察行上待写回联系人的名片推测（`profile_apply_state = pending`，0 次模型调用，每轮 ≤50 行）。
 * 表还没迁移（42P01）时整轮 skipped，不报警。空闲时只有走部分索引的领取与重放语句。
 */
import { randomUUID } from "node:crypto";

import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { CONTACT_INSIGHT_BATCH_LIMIT } from "./generator";
import { reconcileMissingContactInsightRows, type InsightSqlExecutor } from "./repository";
import { CONTACT_INSIGHT_LEASE_MS, processClaimedInsightBatch, replayPendingProfileApplies, type ContactInsightWorkerDeps } from "./worker";

export const CONTACT_INSIGHTS_MAINTENANCE_TASK = "contact-insights";
/** 每轮最多处理的批数（每批 ≤20 人、至多 1 次 AI 调用）。 */
export const CONTACT_INSIGHTS_MAINTENANCE_BATCHES = 10;
/** W0057（G-2）：缺行对账的窗口与每轮上限。 */
export const CONTACT_INSIGHTS_RECONCILE_WINDOW_MS = 7 * 86_400_000;
export const CONTACT_INSIGHTS_RECONCILE_LIMIT = 200;
/** W0058：每轮重放推测写回的上限。 */
export const CONTACT_INSIGHTS_PROFILE_REPLAY_LIMIT = 50;

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createContactInsightsMaintenanceTask(input: {
  resolve: () => (ContactInsightWorkerDeps & { client?: InsightSqlExecutor; workspaceId?: string }) | null;
  batches?: number;
}): MaintenanceTask {
  return {
    name: CONTACT_INSIGHTS_MAINTENANCE_TASK,
    async run({ deadline, now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const summary = { backfilled: 0, batches: 0, callsResponded: 0, contacts: 0, deferred: 0, failed: 0, interrupted: 0, noGoal: 0, profileReplayed: 0, unchanged: 0 };
      try {
        summary.interrupted = await deps.repository.sweepInterrupted(now());
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
      if (deps.client && deps.workspaceId) {
        try {
          const current = now();
          const reconciled = await reconcileMissingContactInsightRows(deps.client, {
            limit: CONTACT_INSIGHTS_RECONCILE_LIMIT, now: current, readGoal: deps.readGoal,
            since: new Date(current.getTime() - CONTACT_INSIGHTS_RECONCILE_WINDOW_MS), workspaceId: deps.workspaceId,
          });
          summary.backfilled = reconciled.pending + reconciled.blocked;
        } catch (error) {
          console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "contact_insights_reconcile_failed" }));
        }
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
      if (Date.now() < deadline) {
        try {
          const replay = await replayPendingProfileApplies({ ...deps }, { limit: CONTACT_INSIGHTS_PROFILE_REPLAY_LIMIT, now: now() });
          summary.profileReplayed = replay.applied + replay.skipped;
        } catch (error) {
          // 表还没有 v4 列（42703）或其他错误：只记日志，不影响本轮洞察。
          console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event: "contact_insights_profile_replay_failed" }));
        }
      }
      return summary;
    },
  };
}
