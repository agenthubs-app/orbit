import { loadEnvConfig } from "@next/env";

import { getConfiguredIngestV2 } from "../features/acquisition/business-card-ingest-v2/configured";
import { createIngestV2Worker } from "../features/acquisition/business-card-ingest-v2/worker";
import { createConfiguredBusinessCardCloudOcrProvider } from "../features/acquisition/business-card-ocr-provider-selection";
import { createNotificationDeliveryService } from "../features/notifications/delivery-service";

loadEnvConfig(process.cwd());

const pollIntervalMs = Math.max(
  1_000,
  Number.parseInt(process.env.ORBIT_BATCH_WORKER_POLL_MS ?? "3000", 10) || 3_000,
);

async function main(): Promise<void> {
  const configured = getConfiguredIngestV2();
  if (!configured) {
    throw new Error("A configured live database is required for the ingest v2 worker.");
  }
  // provider readiness 检查（方案 §四.5）：worker 与 API 的环境配置可能不一致。
  const provider = createConfiguredBusinessCardCloudOcrProvider();
  if (!provider) {
    throw new Error(
      "A configured business-card OCR provider is required for the ingest v2 worker.",
    );
  }
  await configured.ready;

  const worker = createIngestV2Worker({
    repository: configured.repository,
    store: configured.store,
    provider,
    notify: async ({ actorId, batchId, reviewGeneration }) => {
      await createNotificationDeliveryService({ actorId }).materialize({
        body: "名片批次状态有更新，请回到导入中心查看最新进度。",
        channel: "in_app",
        data: { batchId, ingestVersion: "v2" },
        phase: "commitment",
        scheduledFor: new Date().toISOString(),
        signalId: `signal:business-card-ingest-v2:${batchId}`,
        // 事件代际即幂等修订号（方案 §六）：复核回转后的再次通知携带新 generation。
        signalRevision: String(reviewGeneration),
        title: "名片批量识别有更新",
      });
    },
  });

  for (;;) {
    const result = await worker.runOnce();
    if (
      result.claimed > 0 ||
      result.sweptBatches > 0 ||
      result.reapedItems > 0 ||
      result.notificationsSent > 0 ||
      result.notificationFailures > 0 ||
      result.cleanupDeleted > 0
    ) {
      process.stdout.write(`${JSON.stringify({ result })}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
