import type { BusinessCardBatchItemErrorCode } from "./business-card-batch-contract";
import type { BusinessCardBatchService } from "./business-card-batch-service";
import {
  normalizeBusinessCardExtraction,
  reviewIssuesForBusinessCard,
  type BusinessCardCloudOcrProvider,
} from "./business-card-cloud-ocr";
import { BusinessCardCloudOcrProviderError } from "./business-card-ocr-validation";
import type { BusinessCardBatchImageStore } from "./storage/business-card-batch-image-store";

export interface BusinessCardBatchWorkerRunResult {
  claimed: number;
  completed: number;
  failed: number;
  swept: number;
}

function errorCodeFor(error: unknown): BusinessCardBatchItemErrorCode {
  if (error instanceof BusinessCardCloudOcrProviderError) {
    if (error.code === "PROVIDER_TIMEOUT") {
      return "OCR_PROVIDER_TIMEOUT";
    }

    if (error.code === "INVALID_STRUCTURED_OUTPUT") {
      return "OCR_INVALID_OUTPUT";
    }
  }

  return "OCR_PROVIDER_FAILED";
}

export function createBusinessCardBatchWorker({
  service,
  imageStore,
  provider,
  notify,
  concurrency = 3,
}: {
  service: BusinessCardBatchService;
  imageStore: BusinessCardBatchImageStore;
  provider: BusinessCardCloudOcrProvider;
  notify: (input: { actorId: string; batchId: string; now: string }) => Promise<void>;
  concurrency?: number;
}) {
  return {
    async runOnce(input: {
      workerId: string;
      now: string;
    }): Promise<BusinessCardBatchWorkerRunResult> {
      const swept = await service.sweepExpired(input.now);
      const claimed = await service.claimPendingItems({
        limit: concurrency,
        now: input.now,
        workerId: input.workerId,
      });
      let completed = 0;
      let failed = 0;

      await Promise.all(
        claimed.map(async (item) => {
          let outcome: { batchBecameReady: boolean };

          try {
            const imageBytes = item.imagePath
              ? await imageStore.read(item.imagePath)
              : null;

            if (!imageBytes) {
              throw new Error("Business-card batch item image is missing.");
            }

            const result = await provider.extract({
              imageBase64: imageBytes.toString("base64"),
              mimeType: "image/jpeg",
            });
            const extraction = normalizeBusinessCardExtraction(result.extraction);

            outcome = await service.completeItem({
              batchId: item.batchId,
              extraction,
              itemId: item.id,
              now: input.now,
              reviewIssues: reviewIssuesForBusinessCard(extraction),
              usage: result.usage,
              workerId: input.workerId,
            });
            completed += 1;
          } catch (error) {
            outcome = await service.failItem({
              batchId: item.batchId,
              errorCode: errorCodeFor(error),
              itemId: item.id,
              now: input.now,
              workerId: input.workerId,
            });
            failed += 1;
          }

          if (outcome.batchBecameReady) {
            await notify({ actorId: item.actorId, batchId: item.batchId, now: input.now });
          }
        }),
      );

      return { claimed: claimed.length, completed, failed, swept };
    },
  };
}
