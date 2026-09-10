import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createTransactionalBusinessCardBatchService } from "../../features/acquisition/storage/business-card-batch-transactions";
import { createBusinessCardBatchWorker } from "../../features/acquisition/business-card-batch-worker";
import { withQueuedCardBatches } from "../../features/acquisition/business-card-queue-dispatch";
import { hasPendingCardWork } from "../../features/acquisition/business-card-queue-worker";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createBusinessCardBatchCancelHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/cancel/handler";
import { createBusinessCardBatchItemImageHandler } from "../../app/api/contact-drafts/business-card/batches/[id]/items/[itemId]/image/handler";
import type { BusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const now = "2026-09-07T12:00:00.000Z";
const workspaceId = "workspace:cancel";
const actor = { id: "actor:cancel", name: "QA" };
const extraction = { fullName: "Synthetic", nativeFullName: null, romanizedFullName: null, organization: null,
  title: null, departments: [], emails: [], contactPoints: [], website: null, addresses: [], certifications: [], detectedLanguages: [] };
const usage = { inputTokens: 1, latencyMs: 1, outputTokens: 1 };

async function fixture(run: (f: {
  first: ReturnType<typeof createBusinessCardBatchService>; second: ReturnType<typeof createBusinessCardBatchService>;
  images: BusinessCardBatchImageStore; objects: Map<string, Buffer>; failDeletion(value: boolean): void; pending(): Promise<boolean>;
}) => Promise<void>) {
  const schema = `v1_cancel_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pools = [0, 1].map(() => new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` }));
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pools[0].query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = await pools[0].connect(); try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    const objects = new Map<string, Buffer>(); let fail = false;
    const images: BusinessCardBatchImageStore = {
      async save(batch, item, bytes) { const key = `${batch}/${item}`; objects.set(key, bytes); return key; },
      async read(key) { return objects.get(key) ?? null; },
      async removeItemImage(key) { objects.delete(key); },
      async removeBatchImages(batch) {
        for (const key of objects.keys()) if (key.startsWith(`${batch}/`)) objects.delete(key);
        if (fail) throw new Error("interruption after physical deletion");
      },
    };
    const [first, second] = pools.map((pool) => createTransactionalBusinessCardBatchService({ pool, workspaceId,
      createService: (store) => createBusinessCardBatchService({ store, workspaceId, imageStore: images }),
    }));
    await run({ first, second, images, objects, failDeletion: (value) => { fail = value; }, pending: () => hasPendingCardWork({
      async query<TRow>(text: string, values?: readonly unknown[]) { const r = await pools[0].query(text, values ? [...values] : undefined); return { rows: r.rows as TRow[] }; },
    }, workspaceId, "v1") });
  } finally { await Promise.all(pools.map((pool) => pool.end())); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

function input(count = 1) { return { actorId: actor.id, now, sourceFiles: [], items: Array.from({ length: count }, (_, seq) => ({
  seq, sourceFileName: "synthetic.jpg", sourcePage: null, imageDigest: `sha256:${seq}`, imageJpegBase64: Buffer.from("synthetic").toString("base64"), uploadMimeType: "image/jpeg",
})) }; }

test("cancellation is durable despite dispatch/delete failures, hides images, and cleanup retries without OCR", { skip }, async () => {
  await fixture(async ({ first, second, images, objects, failDeletion, pending }) => {
    const batch = await first.createBatch(input()); const item = (await first.getBatch(actor.id, batch.id))!.items[0];
    const cancel = { actorId: actor.id, batchId: batch.id, now };
    await assert.rejects(first.cancelBatch({ ...cancel, actorId: "foreign" }), /not found/);
    await assert.rejects(withQueuedCardBatches(first, async () => { throw new Error("dispatch unavailable"); }).cancelBatch(cancel), /changes were saved/);
    assert.equal((await second.getBatch(actor.id, batch.id))?.batch.status, "cancelled");
    assert.equal(await pending(), true); assert.equal(objects.size, 1);
    assert.equal((await createBusinessCardBatchItemImageHandler(async () => actor, second, images)(new Request("https://test/image"), { params: Promise.resolve({ id: batch.id, itemId: item.id }) })).status, 404);
    const worker = createBusinessCardBatchWorker({ service: second, imageStore: images, provider: null, notify: async () => assert.fail("cancelled batch notified") });
    failDeletion(true); await assert.rejects(worker.runOnce({ workerId: "cleanup", now }), /interruption/);
    assert.equal(objects.size, 0); assert.equal(await pending(), true);
    assert.equal((await first.getBatch(actor.id, batch.id))?.batch.imagesDeletedAt, undefined);
    failDeletion(false); await worker.runOnce({ workerId: "retry", now });
    assert.equal(await pending(), false); assert.equal((await first.getBatch(actor.id, batch.id))?.items[0].imagePath, null);
    await first.cancelBatch(cancel); assert.equal(await pending(), false);
    assert.equal(await first.sweepExpired("2027-01-01T00:00:00.000Z"), 0);
    await assert.rejects(first.finishBatch(cancel), /Cancelled/);
  });
});

test("in-flight OCR cannot resurrect a cancelled batch or emit ready notifications", { skip }, async () => {
  await fixture(async ({ first, second, images }) => {
    const batch = await first.createBatch(input());
    let started!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; }); const gate = new Promise<void>((resolve) => { release = resolve; });
    const worker = createBusinessCardBatchWorker({ service: first, imageStore: images,
      provider: { model: "test", providerName: "controlled", async extract() { started(); await gate; return { extraction, usage }; } },
      notify: async () => assert.fail("cancelled batch notified"),
    });
    const running = worker.runOnce({ workerId: "ocr", now });
    try { await entered; await second.cancelBatch({ actorId: actor.id, batchId: batch.id, now }); } finally { release(); }
    const result = await running; assert.equal(result.completed, 0); assert.equal(result.failed, 0);
    const detail = (await second.getBatch(actor.id, batch.id))!;
    assert.equal(detail.batch.status, "cancelled"); assert.equal(detail.items[0].status, "skipped"); assert.equal(detail.items[0].extraction, null);
    assert.deepEqual(await first.claimPendingItems({ workerId: "retry", now, limit: 1 }), []);
  });
});

test("cancel API authenticates and preserves previously confirmed contacts", { skip }, async () => {
  await fixture(async ({ first, second }) => {
    const batch = await first.createBatch(input(2)); const [item] = await first.claimPendingItems({ workerId: "ocr", now, limit: 1 });
    await first.completeItem({ batchId: batch.id, itemId: item.id, workerId: "ocr", now, extraction, usage, reviewIssues: [] });
    await first.confirmItem({ actorId: actor.id, batchId: batch.id, itemId: item.id, contactId: "contact:kept", now });
    const request = new Request("https://test/cancel", { method: "POST" }); const context = { params: Promise.resolve({ id: batch.id }) };
    assert.equal((await createBusinessCardBatchCancelHandler(async () => null, second)(request, context)).status, 401);
    assert.equal((await createBusinessCardBatchCancelHandler(async () => ({ id: "foreign" }), second)(request, context)).status, 404);
    assert.equal((await createBusinessCardBatchCancelHandler(async () => actor, second)(request, context)).status, 200);
    const detail = (await first.getBatch(actor.id, batch.id))!;
    assert.equal(detail.batch.confirmedItems, 1); assert.equal(detail.batch.skippedItems, 1);
    assert.equal(detail.items.find((entry) => entry.id === item.id)?.confirmedContactId, "contact:kept");
  });
});
