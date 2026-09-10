import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS } from "../../features/acquisition/business-card-batch-contract";
import { createTransactionalBusinessCardBatchService } from "../../features/acquisition/storage/business-card-batch-transactions";
import type { BusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const now = "2026-09-07T00:00:00.000Z";
const images: BusinessCardBatchImageStore = {
  async save(batch, item) { return `${batch}/${item}`; },
  async read() { return Buffer.from("test image"); },
  async removeItemImage() {},
  async removeBatchImages() {},
};
const extraction = {
  fullName: "测试联系人", nativeFullName: null, romanizedFullName: null,
  organization: "测试组织", title: null, departments: [], emails: [], contactPoints: [],
  website: null, addresses: [], certifications: [], detectedLanguages: ["zh"],
};

async function withDatabase(run: (pools: [Pool, Pool]) => Promise<void>) {
  const schema = `card_transaction_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pools: [Pool, Pool] = [0, 1].map(() => new Pool({
    connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}`,
  })) as [Pool, Pool];
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pools[0].query(ORBIT_RECORDS_SCHEMA_SQL);
    await run(pools);
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

function service(pool: Pool, workspaceId = "workspace:transaction", failAfterCompletion = false) {
  return createTransactionalBusinessCardBatchService({
    pool, workspaceId,
    createService(store) {
      const base = createBusinessCardBatchService({ store, workspaceId, imageStore: images });
      return failAfterCompletion ? {
        ...base,
        async completeItem(input) {
          await base.completeItem(input);
          throw new Error("test rollback after count reconciliation");
        },
      } : base;
    },
  });
}

function batchInput(count: number) {
  return {
    actorId: "actor:owner", now, sourceFiles: [],
    items: Array.from({ length: count }, (_, index) => ({
      seq: index, sourceFileName: "test.jpg", sourcePage: null,
      imageJpegBase64: Buffer.from("test image").toString("base64"),
      imageDigest: `sha256:${index}`, uploadMimeType: "image/jpeg",
    })),
  };
}

test("independent database clients claim distinct items and reconcile batch counts once", { skip }, async () => {
  await withDatabase(async ([firstPool, secondPool]) => {
    const first = service(firstPool);
    const second = service(secondPool);
    const batch = await first.createBatch(batchInput(2));
    const claimed = await Promise.all([
      first.claimPendingItems({ workerId: "worker:A", now, limit: 1 }),
      second.claimPendingItems({ workerId: "worker:B", now, limit: 1 }),
    ]);
    assert.equal(claimed.flat().length, 2);
    assert.equal(new Set(claimed.flat().map((item) => item.id)).size, 2);
    const results = await Promise.all(claimed.map(([item], index) => [first, second][index]!.completeItem({
      itemId: item!.id, batchId: batch.id, workerId: item!.leaseOwner!, now,
      extraction, reviewIssues: [], usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 },
    })));
    assert.equal(results.filter((result) => result.batchBecameReady).length, 1);
    const detail = await second.getBatch("actor:owner", batch.id);
    assert.equal(detail?.batch.processedItems, 2);
    assert.equal(detail?.batch.status, "ready_for_review");
    assert.equal(await first.getBatch("actor:other", batch.id), null);
    assert.equal(await service(secondPool, "workspace:other").getBatch("actor:owner", batch.id), null);
  });
});

test("slow OCR retains its lease and a stale worker cannot commit after lease takeover", { skip }, async () => {
  await withDatabase(async ([firstPool, secondPool]) => {
    const first = service(firstPool);
    const second = service(secondPool);
    const batch = await first.createBatch(batchInput(1));
    const [item] = await first.claimPendingItems({ workerId: "old", now, limit: 1 });
    const slow = new Date(Date.parse(now) + 150_000).toISOString();
    assert.equal((await second.claimPendingItems({ workerId: "early", now: slow, limit: 1 })).length, 0);
    const later = new Date(Date.parse(now) + BUSINESS_CARD_BATCH_ITEM_LEASE_TIMEOUT_MS + 1).toISOString();
    const recovered = await second.claimPendingItems({ workerId: "new", now: later, limit: 1 });
    assert.equal(recovered[0]?.id, item!.id);
    const completion = { itemId: item!.id, batchId: batch.id, now: later, extraction, reviewIssues: [], usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } };
    await assert.rejects(first.completeItem({ ...completion, workerId: "old" }), /lease is no longer owned/);
    assert.equal((await second.getBatch("actor:owner", batch.id))?.items[0]?.leaseOwner, "new");
    assert.equal((await second.completeItem({ ...completion, workerId: "new" })).batchBecameReady, true);
  });
});

test("item completion and count updates roll back together and release the workspace lock", { skip }, async () => {
  await withDatabase(async ([firstPool, secondPool]) => {
    const first = service(firstPool);
    const batch = await first.createBatch(batchInput(1));
    const [item] = await first.claimPendingItems({ workerId: "owner", now, limit: 1 });
    const completion = { itemId: item!.id, batchId: batch.id, workerId: "owner", now, extraction, reviewIssues: [], usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } };
    await assert.rejects(service(secondPool, "workspace:transaction", true).completeItem(completion), /test rollback/);
    const detail = await first.getBatch("actor:owner", batch.id);
    assert.equal(detail?.items[0]?.status, "processing");
    assert.equal(detail?.batch.processedItems, 0);
    assert.equal(detail?.batch.status, "processing");
    assert.equal((await first.completeItem(completion)).batchBecameReady, true);
  });
});
