import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  BUSINESS_CARD_BATCH_MAX_ITEMS,
  BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS,
  type NewBusinessCardBatchItemInput,
} from "../../features/acquisition/business-card-batch-contract";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const ACTOR = "account:batch-owner";
const NOW = "2026-08-26T10:00:00.000Z";

function item(seq: number): NewBusinessCardBatchItemInput {
  return {
    imageDigest: `sha256:${String(seq).padStart(4, "0")}`,
    imageJpegBase64: Buffer.from(`jpeg-${seq}`).toString("base64"),
    seq,
    sourceFileName: `card-${seq}.jpg`,
    sourcePage: null,
    uploadMimeType: "image/jpeg",
  };
}

async function setup() {
  const rootDir = await mkdtemp(join(tmpdir(), "orbit-batch-test-"));
  const service = createBusinessCardBatchService({
    imageStore: createBusinessCardBatchImageStore({ rootDir }),
    store: createMemoryLiveRecordStore(),
    workspaceId: "workspace:test",
  });
  return { rootDir, service };
}

const EXTRACTION = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: ["ja"],
  emails: [],
  fullName: "青空 太郎",
  nativeFullName: "青空 太郎",
  organization: "架空技研株式会社",
  romanizedFullName: null,
  title: "室長",
  website: null,
};
const USAGE = { inputTokens: 100, latencyMs: 10, outputTokens: 50 };

test("createBatch persists items, stores images on disk, and rejects oversize batches", async () => {
  const { rootDir, service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR,
    items: [item(1), item(2)],
    now: NOW,
    sourceFiles: [
      { fileName: "a.jpg", itemCount: 1, kind: "image" },
      { fileName: "b.jpg", itemCount: 1, kind: "image" },
    ],
  });

  assert.equal(batch.status, "processing");
  assert.equal(batch.totalItems, 2);
  assert.equal(batch.expiresAt, "2026-09-02T10:00:00.000Z");
  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.items.length, 2);
  assert.equal(detail?.items[0]?.status, "pending");
  assert.equal((await readdir(join(rootDir, batch.id))).length, 2);
  assert.equal(await service.getBatch("account:other", batch.id), null);

  await assert.rejects(
    service.createBatch({
      actorId: ACTOR,
      items: Array.from({ length: BUSINESS_CARD_BATCH_MAX_ITEMS + 1 }, (_, i) => item(i)),
      now: NOW,
      sourceFiles: [],
    }),
    /BUSINESS_CARD_BATCH_TOO_LARGE/,
  );
});

test("claim leases items, expired leases are reclaimed, and ownership is enforced", async () => {
  const { service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR,
    items: [item(1), item(2)],
    now: NOW,
    sourceFiles: [],
  });

  const claimedA = await service.claimPendingItems({ limit: 1, now: NOW, workerId: "w-a" });
  assert.equal(claimedA.length, 1);
  assert.equal(claimedA[0]?.leaseOwner, "w-a");

  const claimedB = await service.claimPendingItems({ limit: 5, now: NOW, workerId: "w-b" });
  assert.equal(claimedB.length, 1, "leased item must not be claimable before expiry");

  const later = new Date(Date.parse(NOW) + BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS + 1).toISOString();
  const reclaimed = await service.claimPendingItems({ limit: 5, now: later, workerId: "w-c" });
  assert.equal(reclaimed.length, 2, "both expired leases are reclaimed");

  await assert.rejects(
    service.completeItem({
      batchId: batch.id,
      extraction: EXTRACTION,
      itemId: claimedA[0]!.id,
      now: later,
      reviewIssues: [],
      usage: USAGE,
      workerId: "not-owner",
    }),
  );
});

test("complete and fail drive batch counts, auto-retry, and ready_for_review transition", async () => {
  const { service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR,
    items: [item(1), item(2)],
    now: NOW,
    sourceFiles: [],
  });
  const [first, second] = await service.claimPendingItems({ limit: 2, now: NOW, workerId: "w" });

  const notReady = await service.completeItem({
    batchId: batch.id,
    extraction: EXTRACTION,
    itemId: first!.id,
    now: NOW,
    reviewIssues: [],
    usage: USAGE,
    workerId: "w",
  });
  assert.equal(notReady.batchBecameReady, false);

  const failedOnce = await service.failItem({
    batchId: batch.id,
    errorCode: "OCR_PROVIDER_TIMEOUT",
    itemId: second!.id,
    now: NOW,
    workerId: "w",
  });
  assert.equal(failedOnce.batchBecameReady, false, "first failure re-queues, batch not ready");
  const requeued = await service.claimPendingItems({ limit: 5, now: NOW, workerId: "w" });
  assert.equal(requeued.length, 1, "failed item returns to pending once");

  const ready = await service.failItem({
    batchId: batch.id,
    errorCode: "OCR_PROVIDER_TIMEOUT",
    itemId: second!.id,
    now: NOW,
    workerId: "w",
  });
  assert.equal(ready.batchBecameReady, true);
  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.batch.status, "ready_for_review");
  assert.equal(detail?.batch.processedItems, 1);
  assert.equal(detail?.batch.failedItems, 1);
  assert.equal(
    detail?.items.find((entry) => entry.id === second!.id)?.errorCode,
    "OCR_PROVIDER_TIMEOUT",
  );
});

test("confirm and skip delete the card image; finishBatch clears the directory; sweep expires old batches", async () => {
  const { rootDir, service } = await setup();
  const batch = await service.createBatch({
    actorId: ACTOR,
    items: [item(1), item(2)],
    now: NOW,
    sourceFiles: [],
  });
  const [first, second] = await service.claimPendingItems({ limit: 2, now: NOW, workerId: "w" });
  for (const claimed of [first!, second!]) {
    await service.completeItem({
      batchId: batch.id,
      extraction: EXTRACTION,
      itemId: claimed.id,
      now: NOW,
      reviewIssues: [],
      usage: USAGE,
      workerId: "w",
    });
  }

  await service.confirmItem({
    actorId: ACTOR,
    batchId: batch.id,
    contactId: "contact:1",
    itemId: first!.id,
    now: NOW,
  });
  await service.skipItem({ actorId: ACTOR, batchId: batch.id, itemId: second!.id, now: NOW });

  const detail = await service.getBatch(ACTOR, batch.id);
  assert.equal(detail?.items.every((entry) => entry.imagePath === null), true);
  assert.equal(detail?.batch.confirmedItems, 1);
  assert.equal(detail?.batch.skippedItems, 1);
  assert.equal((await readdir(join(rootDir, batch.id))).length, 0);

  await service.finishBatch({ actorId: ACTOR, batchId: batch.id, now: NOW });
  assert.equal((await service.getBatch(ACTOR, batch.id))?.batch.status, "completed");

  const stale = await service.createBatch({
    actorId: ACTOR,
    items: [item(3)],
    now: NOW,
    sourceFiles: [],
  });
  const afterExpiry = "2026-09-03T10:00:01.000Z";
  assert.equal(await service.sweepExpired(afterExpiry), 1);
  assert.equal((await service.getBatch(ACTOR, stale.id))?.batch.status, "completed");
});
