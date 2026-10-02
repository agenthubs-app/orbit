/**
 * W0053：`contact-import` 维护任务（每日 cron 与心跳的每一轮都执行）。
 *
 * 1. 续写中断的提交（review P1-1）：committing 且 5 分钟没推进的批次，按已持久化的决定逐事务写完（批次行锁下
 *    只处理还没写的行，重复执行不会重复建联系人），再跑它的三层更新；每轮 ≤5 批。
 * 2. 三层更新任务（review P1-2／P2-3）：`contact_import_followups` 里待处理或租约过期的任务逐条领取（带令牌），
 *    每轮 ≤20 条。任务行自带联系人 id，与解析行清理无关；入口按来源键幂等，重试不会重复计费。
 * 3. 删除过期批次的解析行（批次结束后 7 天；未完成的从创建起 7 天），批次摘要保留（W53-6）；
 *    到期时仍没写完的批次转终态 failed（interrupted_expired）。
 * 表还没迁移（42P01）时整轮 skipped。
 */
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import type { ContactImportService } from "./service";

export const CONTACT_IMPORT_MAINTENANCE_TASK = "contact-import";
const PURGE_BATCHES_PER_PASS = 50;
const FOLLOWUPS_PER_PASS = 20;
const RESUME_BATCHES_PER_PASS = 5;
export const CONTACT_IMPORT_STALE_COMMIT_MS = 5 * 60 * 1000;

function isUndefinedTable(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "42P01";
}

export function createContactImportMaintenanceTask(input: {
  resolve: () => { service: ContactImportService; client: Parameters<ContactImportService["repository"]["purgeExpiredRows"]>[0] } | null;
}): MaintenanceTask {
  return {
    name: CONTACT_IMPORT_MAINTENANCE_TASK,
    async run({ deadline, now }) {
      const resolved = input.resolve();
      if (!resolved) return { skipped: "database_unconfigured" };
      const { client, service } = resolved;
      let resumed: number;
      try {
        resumed = await service.resumeStaleCommits(CONTACT_IMPORT_STALE_COMMIT_MS, RESUME_BATCHES_PER_PASS, deadline);
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
      const followups = await service.runDueFollowups(FOLLOWUPS_PER_PASS, deadline);
      const purged = await service.repository.purgeExpiredRows(client, now(), PURGE_BATCHES_PER_PASS);
      return { done: followups.done, purged, resumed, retry: followups.retry };
    },
  };
}
