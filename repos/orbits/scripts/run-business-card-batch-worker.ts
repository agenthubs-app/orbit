import { loadEnvConfig } from "@next/env";

import { createConfiguredBusinessCardBatchService } from "../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchWorker } from "../features/acquisition/business-card-batch-worker";
import { createConfiguredBusinessCardCloudOcrProvider } from "../features/acquisition/business-card-ocr-provider-selection";
import { createBusinessCardBatchImageStore } from "../features/acquisition/storage/business-card-batch-image-store";
import { createNotificationDeliveryService } from "../features/notifications/delivery-service";

loadEnvConfig(process.cwd());

const pollIntervalMs = Math.max(
  1_000,
  Number.parseInt(process.env.ORBIT_BATCH_WORKER_POLL_MS ?? "3000", 10) || 3_000,
);
const workerId =
  process.env.ORBIT_BATCH_WORKER_ID?.trim() ??
  `business-card-batch-worker:${process.pid}`;

async function main(): Promise<void> {
  const service = createConfiguredBusinessCardBatchService();
  const provider = createConfiguredBusinessCardCloudOcrProvider();

  if (!service) {
    throw new Error("A configured live database is required for the batch worker.");
  }

  if (!provider) {
    throw new Error(
      "A configured business-card OCR provider is required for the batch worker.",
    );
  }

  const worker = createBusinessCardBatchWorker({
    imageStore: createBusinessCardBatchImageStore(),
    notify: async ({ actorId, batchId, now }) => {
      await createNotificationDeliveryService({ actorId }).materialize({
        body: "名片批次识别完成，请回到导入中心逐张确认。",
        channel: "in_app",
        data: { batchId },
        phase: "commitment",
        scheduledFor: now,
        signalId: `signal:business-card-batch:${batchId}`,
        signalRevision: "1",
        title: "名片批量识别完成",
      });
    },
    provider,
    service,
  });

  while (true) {
    const result = await worker.runOnce({ now: new Date().toISOString(), workerId });

    if (result.claimed > 0 || result.swept > 0) {
      process.stdout.write(`${JSON.stringify({ result, workerId })}\n`);
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
