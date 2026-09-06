import { randomUUID } from "node:crypto";

import type {
  BusinessCardCloudOcrUsage,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "./business-card-cloud-ocr";
import {
  BUSINESS_CARD_BATCH_EXPIRY_DAYS,
  BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS,
  BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS,
  BUSINESS_CARD_BATCH_MAX_ITEMS,
  type BusinessCardBatchDTO,
  type BusinessCardBatchItemDTO,
  type BusinessCardBatchItemErrorCode,
  type BusinessCardBatchSourceFile,
  type NewBusinessCardBatchItemInput,
} from "./business-card-batch-contract";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { configuredBusinessCardBatchPool, createTransactionalBusinessCardBatchService } from "./storage/business-card-batch-transactions";
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";
import {
  createBusinessCardBatchImageStore,
  type BusinessCardBatchImageStore,
} from "./storage/business-card-batch-image-store";

export const BUSINESS_CARD_BATCH_COLLECTIONS = {
  batches: "businessCardBatches",
  items: "businessCardBatchItems",
} as const;

export interface BusinessCardBatchService {
  createBatch(input: {
    actorId: string;
    now: string;
    items: readonly NewBusinessCardBatchItemInput[];
    sourceFiles: readonly BusinessCardBatchSourceFile[];
  }): Promise<BusinessCardBatchDTO>;
  listBatches(actorId: string): Promise<readonly BusinessCardBatchDTO[]>;
  getBatch(
    actorId: string,
    batchId: string,
  ): Promise<{
    batch: BusinessCardBatchDTO;
    items: readonly BusinessCardBatchItemDTO[];
  } | null>;
  claimPendingItems(input: {
    workerId: string;
    now: string;
    limit: number;
  }): Promise<readonly BusinessCardBatchItemDTO[]>;
  completeItem(input: {
    itemId: string;
    batchId: string;
    workerId: string;
    now: string;
    extraction: BusinessCardStructuredExtraction;
    reviewIssues: readonly BusinessCardReviewIssue[];
    usage: BusinessCardCloudOcrUsage;
  }): Promise<{ batchBecameReady: boolean }>;
  failItem(input: {
    itemId: string;
    batchId: string;
    workerId: string;
    now: string;
    errorCode: BusinessCardBatchItemErrorCode;
  }): Promise<{ batchBecameReady: boolean }>;
  retryItem(input: {
    actorId: string;
    itemId: string;
    batchId: string;
    now: string;
  }): Promise<void>;
  confirmItem(input: {
    actorId: string;
    itemId: string;
    batchId: string;
    now: string;
    contactId: string;
  }): Promise<void>;
  skipItem(input: {
    actorId: string;
    itemId: string;
    batchId: string;
    now: string;
  }): Promise<void>;
  finishBatch(input: {
    actorId: string;
    batchId: string;
    now: string;
  }): Promise<void>;
  sweepExpired(now: string): Promise<number>;
}

type Envelope = LiveRecord<Record<string, unknown>>;

function envelope(input: {
  workspaceId: string;
  collectionName: string;
  recordId: string;
  actorId: string;
  now: string;
  createdAt?: string;
  sourceId?: string;
  payload: Record<string, unknown>;
}): Envelope {
  return {
    collectionName: input.collectionName,
    createdAt: input.createdAt ?? input.now,
    evidenceIds: [],
    lifecycleState: "active",
    payload: input.payload,
    recordId: input.recordId,
    sourceId: input.sourceId ?? input.recordId,
    sourceType: "business_card_ocr",
    updatedAt: input.now,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  };
}

function batchFromRecord(record: Envelope): BusinessCardBatchDTO | null {
  const batch = record.payload.batch;

  return batch && typeof batch === "object" ? (batch as BusinessCardBatchDTO) : null;
}

function itemFromRecord(record: Envelope): BusinessCardBatchItemDTO | null {
  const item = record.payload.item;

  return item && typeof item === "object" ? (item as BusinessCardBatchItemDTO) : null;
}

export function createBusinessCardBatchService({
  store,
  workspaceId,
  imageStore,
  idFactory = randomUUID,
}: {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  imageStore: BusinessCardBatchImageStore;
  idFactory?: () => string;
}): BusinessCardBatchService {
  async function saveBatch(batch: BusinessCardBatchDTO): Promise<void> {
    await store.upsertRecord(
      envelope({
        actorId: batch.actorId,
        collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.batches,
        createdAt: batch.createdAt,
        now: batch.updatedAt,
        payload: { batch, kind: "business_card_batch" },
        recordId: batch.id,
        workspaceId,
      }),
    );
  }

  async function saveItem(item: BusinessCardBatchItemDTO): Promise<void> {
    await store.upsertRecord(
      envelope({
        actorId: item.actorId,
        collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.items,
        createdAt: item.createdAt,
        now: item.updatedAt,
        payload: { item, kind: "business_card_batch_item" },
        recordId: item.id,
        sourceId: item.batchId,
        workspaceId,
      }),
    );
  }

  async function readBatch(batchId: string): Promise<BusinessCardBatchDTO | null> {
    const record = await store.getRecord({
      collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.batches,
      recordId: batchId,
      workspaceId,
    });

    return record ? batchFromRecord(record) : null;
  }

  async function readItem(itemId: string): Promise<BusinessCardBatchItemDTO | null> {
    const record = await store.getRecord({
      collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.items,
      recordId: itemId,
      workspaceId,
    });

    return record ? itemFromRecord(record) : null;
  }

  async function listItems(batchId: string): Promise<BusinessCardBatchItemDTO[]> {
    const records = await store.listRecords({
      collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.items,
      sourceId: batchId,
      workspaceId,
    });

    return records
      .map(itemFromRecord)
      .filter((item): item is BusinessCardBatchItemDTO => item !== null)
      .sort((left, right) => left.seq - right.seq);
  }

  async function recomputeCounts(
    batchId: string,
    now: string,
  ): Promise<{ batchBecameReady: boolean }> {
    const batch = await readBatch(batchId);

    if (!batch) {
      return { batchBecameReady: false };
    }

    const items = await listItems(batchId);
    const counts = {
      confirmedItems: items.filter((item) => item.status === "confirmed").length,
      failedItems: items.filter((item) => item.status === "failed").length,
      processedItems: items.filter(
        (item) =>
          item.status === "extracted" ||
          item.status === "confirmed" ||
          item.status === "skipped",
      ).length,
      skippedItems: items.filter((item) => item.status === "skipped").length,
    };
    const settled = counts.processedItems + counts.failedItems;
    const becameReady = settled === batch.totalItems && batch.status === "processing";

    await saveBatch({
      ...batch,
      ...counts,
      status: becameReady ? "ready_for_review" : batch.status,
      updatedAt: now,
    });

    return { batchBecameReady: becameReady };
  }

  async function updateLeasedItem(
    input: { itemId: string; workerId: string; now: string },
    update: (item: BusinessCardBatchItemDTO) => BusinessCardBatchItemDTO,
  ): Promise<void> {
    const item = await readItem(input.itemId);

    if (!item) {
      throw new Error(`Business-card batch item ${input.itemId} was not found.`);
    }

    if (item.status !== "processing" || item.leaseOwner !== input.workerId) {
      throw new Error("Business-card batch item lease is no longer owned by this worker.");
    }

    await saveItem(update(item));
  }

  async function readOwnedItem(
    actorId: string,
    batchId: string,
    itemId: string,
  ): Promise<BusinessCardBatchItemDTO> {
    const item = await readItem(itemId);

    if (!item || item.actorId !== actorId || item.batchId !== batchId) {
      throw new Error(`Business-card batch item ${itemId} was not found.`);
    }

    return item;
  }

  async function dropItemImage(
    item: BusinessCardBatchItemDTO,
  ): Promise<BusinessCardBatchItemDTO> {
    if (item.imagePath) {
      await imageStore.removeItemImage(item.imagePath);
    }

    return { ...item, imagePath: null };
  }

  async function expireBatch(batch: BusinessCardBatchDTO, now: string): Promise<void> {
    await imageStore.removeBatchImages(batch.id);
    const items = await listItems(batch.id);
    await Promise.all(
      items
        .filter((item) => item.imagePath !== null)
        .map((item) => saveItem({ ...item, imagePath: null, updatedAt: now })),
    );
    await saveBatch({ ...batch, status: "completed", updatedAt: now });
  }

  return {
    async createBatch(input) {
      if (input.items.length > BUSINESS_CARD_BATCH_MAX_ITEMS) {
        throw new Error("BUSINESS_CARD_BATCH_TOO_LARGE");
      }

      const batchId = idFactory();
      const expiresAt = new Date(
        Date.parse(input.now) + BUSINESS_CARD_BATCH_EXPIRY_DAYS * 86_400_000,
      ).toISOString();

      for (const newItem of input.items) {
        const itemId = idFactory();
        const imagePath = await imageStore.save(
          batchId,
          itemId,
          Buffer.from(newItem.imageJpegBase64, "base64"),
        );

        await saveItem({
          actorId: input.actorId,
          attempts: 0,
          batchId,
          confirmedContactId: null,
          createdAt: input.now,
          errorCode: null,
          extraction: null,
          id: itemId,
          imageDigest: newItem.imageDigest,
          imagePath,
          leaseOwner: null,
          leasedAt: null,
          reviewIssues: [],
          seq: newItem.seq,
          sourceFileName: newItem.sourceFileName,
          sourcePage: newItem.sourcePage,
          status: "pending",
          updatedAt: input.now,
          uploadMimeType: newItem.uploadMimeType,
          usage: null,
        });
      }

      const batch: BusinessCardBatchDTO = {
        actorId: input.actorId,
        confirmedItems: 0,
        createdAt: input.now,
        expiresAt,
        failedItems: 0,
        id: batchId,
        processedItems: 0,
        skippedItems: 0,
        sourceFiles: input.sourceFiles,
        status: "processing",
        totalItems: input.items.length,
        updatedAt: input.now,
      };
      await saveBatch(batch);

      return batch;
    },

    async listBatches(actorId) {
      const records = await store.listRecords({
        collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.batches,
        userId: actorId,
        workspaceId,
      });

      return records
        .map(batchFromRecord)
        .filter((batch): batch is BusinessCardBatchDTO => batch !== null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async getBatch(actorId, batchId) {
      const batch = await readBatch(batchId);

      if (!batch || batch.actorId !== actorId) {
        return null;
      }

      return { batch, items: await listItems(batchId) };
    },

    async claimPendingItems(input) {
      const leaseExpiredBefore = new Date(
        Date.parse(input.now) - BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS,
      ).toISOString();
      const records = await store.listRecords({
        collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.items,
        workspaceId,
      });
      const claimable = records
        .map(itemFromRecord)
        .filter((item): item is BusinessCardBatchItemDTO => item !== null)
        .filter(
          (item) =>
            item.status === "pending" ||
            (item.status === "processing" &&
              (item.leasedAt ?? "") < leaseExpiredBefore),
        )
        .sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) || left.seq - right.seq,
        )
        .slice(0, input.limit);

      const claimed: BusinessCardBatchItemDTO[] = [];

      for (const item of claimable) {
        const leased: BusinessCardBatchItemDTO = {
          ...item,
          leaseOwner: input.workerId,
          leasedAt: input.now,
          status: "processing",
          updatedAt: input.now,
        };
        await saveItem(leased);
        claimed.push(leased);
      }

      return claimed;
    },

    async completeItem(input) {
      await updateLeasedItem(input, (item) => ({
        ...item,
        errorCode: null,
        extraction: input.extraction,
        leaseOwner: null,
        leasedAt: null,
        reviewIssues: input.reviewIssues,
        status: "extracted",
        updatedAt: input.now,
        usage: input.usage,
      }));

      return recomputeCounts(input.batchId, input.now);
    },

    async failItem(input) {
      let retried = false;
      await updateLeasedItem(input, (item) => {
        const attempts = item.attempts + 1;
        retried = attempts < BUSINESS_CARD_BATCH_ITEM_MAX_ATTEMPTS;

        return {
          ...item,
          attempts,
          errorCode: retried ? null : input.errorCode,
          leaseOwner: null,
          leasedAt: null,
          status: retried ? "pending" : "failed",
          updatedAt: input.now,
        };
      });

      if (retried) {
        return { batchBecameReady: false };
      }

      return recomputeCounts(input.batchId, input.now);
    },

    async retryItem(input) {
      const item = await readOwnedItem(input.actorId, input.batchId, input.itemId);

      if (item.status !== "failed") {
        throw new Error("Only failed business-card batch items can be retried.");
      }

      await saveItem({
        ...item,
        attempts: 0,
        errorCode: null,
        leaseOwner: null,
        leasedAt: null,
        status: "pending",
        updatedAt: input.now,
      });
      const batch = await readBatch(input.batchId);

      if (batch && batch.status === "ready_for_review") {
        await saveBatch({ ...batch, status: "processing", updatedAt: input.now });
      }

      await recomputeCounts(input.batchId, input.now);
    },

    async confirmItem(input) {
      const item = await readOwnedItem(input.actorId, input.batchId, input.itemId);

      if (item.status !== "extracted") {
        throw new Error("Only extracted business-card batch items can be confirmed.");
      }

      const withoutImage = await dropItemImage(item);
      await saveItem({
        ...withoutImage,
        confirmedContactId: input.contactId,
        status: "confirmed",
        updatedAt: input.now,
      });
      await recomputeCounts(input.batchId, input.now);
    },

    async skipItem(input) {
      const item = await readOwnedItem(input.actorId, input.batchId, input.itemId);

      if (item.status !== "extracted" && item.status !== "failed") {
        throw new Error("Only extracted or failed business-card batch items can be skipped.");
      }

      const withoutImage = await dropItemImage(item);
      await saveItem({
        ...withoutImage,
        status: "skipped",
        updatedAt: input.now,
      });
      await recomputeCounts(input.batchId, input.now);
    },

    async finishBatch(input) {
      const batch = await readBatch(input.batchId);

      if (!batch || batch.actorId !== input.actorId) {
        throw new Error(`Business-card batch ${input.batchId} was not found.`);
      }

      const items = await listItems(input.batchId);
      const unsettled = items.some(
        (item) =>
          item.status !== "confirmed" &&
          item.status !== "skipped" &&
          item.status !== "failed",
      );

      if (unsettled) {
        throw new Error("Every card must be confirmed, skipped, or failed before finishing.");
      }

      await imageStore.removeBatchImages(input.batchId);
      await Promise.all(
        items
          .filter((item) => item.imagePath !== null)
          .map((item) => saveItem({ ...item, imagePath: null, updatedAt: input.now })),
      );
      await saveBatch({ ...batch, status: "completed", updatedAt: input.now });
    },

    async sweepExpired(now) {
      const records = await store.listRecords({
        collectionName: BUSINESS_CARD_BATCH_COLLECTIONS.batches,
        workspaceId,
      });
      const expired = records
        .map(batchFromRecord)
        .filter((batch): batch is BusinessCardBatchDTO => batch !== null)
        .filter((batch) => batch.status !== "completed" && batch.expiresAt < now);

      for (const batch of expired) {
        await expireBatch(batch, now);
      }

      return expired.length;
    },
  };
}

export function createConfiguredBusinessCardBatchService({
  env,
  imageStore,
}: {
  env?: Record<string, string | undefined>;
  imageStore?: BusinessCardBatchImageStore;
} = {}): BusinessCardBatchService | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const images = imageStore ?? createBusinessCardBatchImageStore({ env });
  return createTransactionalBusinessCardBatchService({
    pool: configuredBusinessCardBatchPool(config.connectionString),
    workspaceId: config.workspaceId,
    createService: (store) => createBusinessCardBatchService({
      imageStore: images,
      store,
      workspaceId: config.workspaceId,
    }),
  });
}
