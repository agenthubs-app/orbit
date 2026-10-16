/**
 * R17 主催的维护任务（host/DESIGN.md §2.2 第 6 条、§2.10）。Owner: 甲 (R17).
 * - 定型通知投递：每次心跳最多 50 条（outbox → 收件箱 + 邮件，非生产邮件强制重定向）。
 * - 会后 30 天自动归档：每小时最多一次，只动主办方在 Orbit 里建的活动。
 */
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";

export const HOST_NOTICE_TASK = "host-notice-delivery";
export const HOST_ARCHIVE_TASK = "host-event-auto-archive";
export const HOST_MATCHING_USAGE_TASK = "host-matching-usage-ledger";
const ARCHIVE_THROTTLE_MS = 60 * 60_000;
const throttle = globalThis as typeof globalThis & { __orbitR17ArchiveAt?: number };

export function createHostNoticeMaintenanceTask(): MaintenanceTask {
  return {
    name: HOST_NOTICE_TASK,
    async run({ now }) {
      const runtime = createConfiguredEventOperationsPostgresRuntime();
      if (!runtime) return { skipped: "database_unconfigured" };
      const { deliverHostNotices } = await import("./notices/worker");
      const { createTransactionalMailer } = await import("../../mail/transactional");
      const { createDeliveryPolicyRepository } = await import("../../notifications/delivery-policy-repository");
      const policy = createDeliveryPolicyRepository({ client: runtime.client as never, workspaceId: runtime.workspaceId });
      const result = await deliverHostNotices({
        appOrigin: process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined,
        client: runtime.client,
        // R13 通知设置：关掉「更新」类通知的人不收邮件（收件箱照写）。
        emailAllowed: async (actorId) => (await policy.preferences(actorId)).updateEnabled !== false,
        mailer: createTransactionalMailer(),
        now,
        workspaceId: runtime.workspaceId,
      });
      return { ...result };
    },
  };
}

export function createHostArchiveMaintenanceTask(): MaintenanceTask {
  return {
    name: HOST_ARCHIVE_TASK,
    async run({ now }) {
      const at = now();
      if (throttle.__orbitR17ArchiveAt && at.getTime() - throttle.__orbitR17ArchiveAt < ARCHIVE_THROTTLE_MS) return { skipped: "throttled" };
      const runtime = createConfiguredEventOperationsPostgresRuntime();
      if (!runtime) return { skipped: "database_unconfigured" };
      throttle.__orbitR17ArchiveAt = at.getTime();
      const { createHostLifecycle } = await import("./storage/lifecycle");
      return { archived: await createHostLifecycle({ client: runtime.client, workspaceId: runtime.workspaceId }).archiveEnded(at) };
    },
  };
}

/** A6：编组 AI 的用量补记进账本（每次心跳 ≤200 条尝试；只记账）。 */
export function createHostMatchingUsageMaintenanceTask(): MaintenanceTask {
  return {
    name: HOST_MATCHING_USAGE_TASK,
    async run({ now }) {
      const runtime = createConfiguredEventOperationsPostgresRuntime();
      if (!runtime) return { skipped: "database_unconfigured" };
      const { createPostgresAiUsageLedger } = await import("../../ai-quota/ledger");
      const { ledgerMatchingUsage } = await import("./matching-usage");
      try {
        return await ledgerMatchingUsage({ executor: runtime.client, ledger: createPostgresAiUsageLedger({ client: runtime.client as never, workspaceId: runtime.workspaceId }), now: now(), workspaceId: runtime.workspaceId });
      } catch (error) {
        // 账本迁移（v5 ai-usage-event-matching）未执行时 CHECK 会拒绝：跳过，不影响编组本身。
        if ((error as { code?: string }).code === "23514" || (error as { code?: string }).code === "42P01") return { skipped: "ledger_not_ready" };
        throw error;
      }
    },
  };
}
