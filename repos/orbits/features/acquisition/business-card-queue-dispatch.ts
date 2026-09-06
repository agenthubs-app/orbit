import { send } from "@vercel/queue";
import type { BusinessCardBatchService } from "./business-card-batch-service";
import type { BusinessCardIngestRepository } from "./business-card-ingest-v2/repository";

export type CardPipeline = "v1" | "v2";
export interface CardQueueWake { version: 1; pipeline: CardPipeline }

export function isCardQueueWake(value: unknown): value is CardQueueWake {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const wake = value as Record<string, unknown>;
  return Object.keys(wake).length === 2 && wake.version === 1 &&
    (wake.pipeline === "v1" || wake.pipeline === "v2");
}

export async function enqueueCardBatch(pipeline: CardPipeline): Promise<void> {
  await send("business-card-processing", { version: 1, pipeline } satisfies CardQueueWake, {
    retentionSeconds: 7 * 24 * 60 * 60,
  });
}

async function changed<T>(operation: () => Promise<T>, publish: () => Promise<void>): Promise<T> {
  const result = await operation();
  try { await publish(); } catch {
    throw new Error("Business-card changes were saved, but background dispatch is unavailable.");
  }
  return result;
}

export function withQueuedCardBatches(service: BusinessCardBatchService, publish = () => enqueueCardBatch("v1")): BusinessCardBatchService {
  return {
    ...service,
    createBatch: (input) => changed(() => service.createBatch(input), publish),
    retryItem: (input) => changed(() => service.retryItem(input), publish),
    confirmItem: (input) => changed(() => service.confirmItem(input), publish),
    skipItem: (input) => changed(() => service.skipItem(input), publish),
    finishBatch: (input) => changed(() => service.finishBatch(input), publish),
  };
}

export function withQueuedCardIngest(repository: BusinessCardIngestRepository, publish = () => enqueueCardBatch("v2")): BusinessCardIngestRepository {
  return {
    ...repository,
    createBatch: (input) => changed(() => repository.createBatch(input), publish),
    markItemUploaded: (input) => changed(() => repository.markItemUploaded(input), publish),
    excludeItem: (input) => changed(() => repository.excludeItem(input), publish),
    swapDerivative: (input) => changed(() => repository.swapDerivative(input), publish),
    finalizeBatch: (input) => changed(() => repository.finalizeBatch(input), publish),
    retryItem: (input) => changed(() => repository.retryItem(input), publish),
    skipItem: (input) => changed(() => repository.skipItem(input), publish),
    confirmItem: (input) => changed(() => repository.confirmItem(input), publish),
    cancelBatch: (input) => changed(() => repository.cancelBatch(input), publish),
  };
}
