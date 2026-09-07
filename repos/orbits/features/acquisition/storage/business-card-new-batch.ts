import {
  BUSINESS_CARD_BATCH_EXPIRY_DAYS, BUSINESS_CARD_BATCH_MAX_ITEMS,
  type BusinessCardBatchDTO, type BusinessCardBatchItemDTO,
  type BusinessCardBatchSourceFile, type NewBusinessCardBatchItemInput,
} from "../business-card-batch-contract";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export type StoredNewCardItem = Omit<NewBusinessCardBatchItemInput, "imageJpegBase64"> & {
  id: string; imagePath: string;
};

/** The caller owns the transaction. Both upload paths create exactly the same
 * records; prepared pages never need to upload their image bytes a second time.
 */
export async function persistNewBusinessCardBatch(input: {
  store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string;
  batchId: string; actorId: string; now: string; totalItems: number;
  sourceFiles: readonly BusinessCardBatchSourceFile[];
  items: Iterable<StoredNewCardItem> | AsyncIterable<StoredNewCardItem>;
}): Promise<BusinessCardBatchDTO> {
  if (!Number.isInteger(input.totalItems) || input.totalItems < 0 || input.totalItems > BUSINESS_CARD_BATCH_MAX_ITEMS) {
    throw new Error("BUSINESS_CARD_BATCH_TOO_LARGE");
  }
  const expiresAt = new Date(Date.parse(input.now) + BUSINESS_CARD_BATCH_EXPIRY_DAYS * 86_400_000).toISOString();
  const write = (collectionName: string, recordId: string, sourceId: string, payload: Record<string, unknown>) =>
    input.store.upsertRecord({ collectionName, recordId, sourceId, payload, workspaceId: input.workspaceId,
      userId: input.actorId, sourceType: "business_card_ocr", evidenceIds: [], lifecycleState: "active",
      createdAt: input.now, updatedAt: input.now });
  let count = 0;
  const itemIds = new Set<string>();
  for await (const page of input.items) {
    if (++count > input.totalItems || itemIds.has(page.id)) throw new Error("Invalid new batch item count or identity.");
    itemIds.add(page.id);
    const item: BusinessCardBatchItemDTO = {
      id: page.id, batchId: input.batchId, actorId: input.actorId, seq: page.seq,
      sourceFileName: page.sourceFileName, sourcePage: page.sourcePage,
      imageDigest: page.imageDigest, uploadMimeType: page.uploadMimeType, imagePath: page.imagePath,
      attempts: 0, confirmedContactId: null, errorCode: null, extraction: null,
      leaseOwner: null, leasedAt: null, reviewIssues: [], usage: null, status: "pending",
      createdAt: input.now, updatedAt: input.now,
    };
    await write("businessCardBatchItems", item.id, input.batchId, { item, kind: "business_card_batch_item" });
  }
  if (count !== input.totalItems) throw new Error("Invalid new batch item count or identity.");
  const batch: BusinessCardBatchDTO = {
    id: input.batchId, actorId: input.actorId, status: "processing", totalItems: count,
    processedItems: 0, failedItems: 0, confirmedItems: 0, skippedItems: 0,
    sourceFiles: input.sourceFiles, createdAt: input.now, updatedAt: input.now, expiresAt,
  };
  await write("businessCardBatches", batch.id, batch.id, { batch, kind: "business_card_batch" });
  return batch;
}
