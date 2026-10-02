/**
 * W0053：`contact-import` 维护任务（每日 cron 与心跳的每一轮都执行）。
 *
 * 1. 重试三层更新：入口失败（retry）或请求结束后的 after() 没跑完（pending 且租约空／过期）的批次，每轮 ≤10 批。
 *    入口按来源键幂等（补全操作键、待确认入队键），重试不会重复写联系人或重复计费；
 * 2. 删除过期批次的解析行（批次完成／取消后 7 天；未完成的从创建起 7 天），批次摘要保留（W53-6）。先 1 后 2：重试要读行里的联系人 id。
 * 表还没迁移（42P01）时整轮 skipped。
 */
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import type { ContactImportService } from "./service";

export const CONTACT_IMPORT_MAINTENANCE_TASK = "contact-import";
const PURGE_BATCHES_PER_PASS = 50;
const LAYER_BATCHES_PER_PASS = 10;

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
      // 先重试三层更新（需要读解析行里的联系人 id），再清理过期行。
      let due: { actorId: string; batchId: string }[];
      try {
        due = await service.repository.dueLayerBatches(client, now(), LAYER_BATCHES_PER_PASS);
      } catch (error) {
        if (isUndefinedTable(error)) return { skipped: "schema_missing" };
        throw error;
      }
      const summary = { busy: 0, done: 0, purged: 0, retry: 0 };
      for (const batch of due) {
        if (Date.now() >= deadline) break;
        summary[await service.runPendingLayers(batch.actorId, batch.batchId)] += 1;
      }
      summary.purged = await service.repository.purgeExpiredRows(client, now(), PURGE_BATCHES_PER_PASS);
      return summary;
    },
  };
}
