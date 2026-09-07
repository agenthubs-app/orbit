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
import type { BusinessCardBatchImageStore } from "../../features/acquisition/storage/business-card-batch-image-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const now = "2026-09-07T12:00:00.000Z";
const actorId = "actor:atomic";
const workspaceId = "workspace:atomic";
const extraction = { fullName: "Synthetic", nativeFullName: null, romanizedFullName: null, organization: null,
  title: null, departments: [], emails: [], contactPoints: [], website: null, addresses: [], certifications: [], detectedLanguages: [] };
const fields = { displayName: "Synthetic", email: "", organization: "QA", phone: "", relationshipContext: "test", role: "" };

async function fixture(run: (f: {
  service(index?: number, workspace?: string): ReturnType<typeof createBusinessCardBatchService>;
  pool: Pool; images: BusinessCardBatchImageStore; objects: Map<string, Buffer>;
  beforeContactWrite(callback: () => Promise<void>): void; failItemSave(value: boolean): void; failDelete(value: boolean): void;
  cancellationWaiting(): Promise<boolean>; pending(): Promise<boolean>;
}) => Promise<void>) {
  const schema = `v1_atomic_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pools = [0, 1].map((i) => new Pool({ connectionString: databaseUrl, max: 3,
    application_name: `${schema}_${i}`, options: `-c search_path=${schema}` }));
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pools[0].query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = await pools[0].connect(); try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    const objects = new Map<string, Buffer>(); let contactHook = async () => {}; let failSave = false, deletionFails = false;
    const images: BusinessCardBatchImageStore = {
      async save(batch, item, bytes) { const key = `${batch}/${item}`; objects.set(key, bytes); return key; },
      async read(key) { return objects.get(key) ?? null; },
      async removeItemImage(key) { objects.delete(key); if (deletionFails) throw new Error("delete interrupted"); },
      async removeBatchImages(batch) { for (const key of objects.keys()) if (key.startsWith(`${batch}/`)) objects.delete(key); },
    };
    function service(index = 0, workspace = workspaceId) {
      return createTransactionalBusinessCardBatchService({ pool: pools[index], workspaceId: workspace,
        createService(store) {
          return createBusinessCardBatchService({ workspaceId: workspace, imageStore: images, store: { ...store,
            async upsertRecord(record) {
              if (record.collectionName === "contacts") await contactHook();
              if (failSave && record.collectionName === "businessCardBatchItems" && (record.payload.item as { status: string }).status === "confirmed") {
                throw new Error("fail after contact write");
              }
              return store.upsertRecord(record);
            },
          } });
        },
      });
    }
    await run({ service, pool: pools[0], images, objects, beforeContactWrite: (callback) => { contactHook = callback; },
      failItemSave: (value) => { failSave = value; }, failDelete: (value) => { deletionFails = value; },
      async cancellationWaiting() { const r = await admin.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event = 'advisory') AS waiting", [`${schema}_1`]); return r.rows[0].waiting; },
      pending: () => hasPendingCardWork({ async query<TRow>(text: string, values?: readonly unknown[]) {
        const r = await pools[0].query(text, values ? [...values] : undefined); return { rows: r.rows as TRow[] };
      } }, workspaceId, "v1"),
    });
  } finally { await Promise.all(pools.map((pool) => pool.end())); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

async function ready(service: ReturnType<typeof createBusinessCardBatchService>, count = 1) {
  const batch = await service.createBatch({ actorId, now, sourceFiles: [], items: Array.from({ length: count }, (_, seq) => ({
    seq, sourceFileName: "synthetic.jpg", sourcePage: null, imageDigest: `sha256:${seq}`, imageJpegBase64: "eA==", uploadMimeType: "image/jpeg",
  })) });
  const items = await service.claimPendingItems({ workerId: "qa", now, limit: count });
  for (const item of items) await service.completeItem({ itemId: item.id, batchId: batch.id, workerId: "qa", now,
    extraction, reviewIssues: [], usage: { inputTokens: 1, outputTokens: 1, latencyMs: 1 } });
  return { batch, items, input: { actorId, actorLabel: "QA", batchId: batch.id, itemId: items[0].id, now, fields } };
}

test("contact, card and counts roll back together, retaining the review image until commit", { skip }, async () => {
  await fixture(async ({ service, pool, images, objects, failItemSave, failDelete }) => {
    const first = service(); const { input, batch } = await ready(first);
    failItemSave(true); await assert.rejects(first.confirmContact(input), /fail after contact write/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM orbit_records WHERE collection_name = 'contacts'")).rows[0].count, 0);
    const before = (await first.getBatch(actorId, batch.id))!;
    assert.equal(before.items[0].status, "extracted"); assert.equal(before.batch.confirmedItems, 0); assert.equal(objects.size, 1);
    failItemSave(false); const saved = await first.confirmContact(input); assert.equal(saved.success, true); assert.equal(objects.size, 1);
    const worker = createBusinessCardBatchWorker({ service: first, imageStore: images, provider: null, notify: async () => {} });
    failDelete(true); await assert.rejects(worker.runOnce({ workerId: "cleanup", now }), /delete interrupted/);
    const after = (await first.getBatch(actorId, batch.id))!;
    assert.equal(after.items[0].status, "confirmed"); assert.ok(after.items[0].imagePath); assert.equal(objects.size, 0);
    failDelete(false); await worker.runOnce({ workerId: "cleanup", now });
    assert.equal((await first.getBatch(actorId, batch.id))?.items[0].imagePath, null);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM orbit_records WHERE collection_name = 'contacts'")).rows[0].count, 1);
  });
});

test("cancellation waits for contact confirmation and preserves the committed contact", { skip }, async () => {
  await fixture(async ({ service, pool, beforeContactWrite, cancellationWaiting }) => {
    const first = service(), second = service(1); const { input, batch } = await ready(first);
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => { entered = r; }), gate = new Promise<void>((r) => { release = r; });
    beforeContactWrite(async () => { entered(); await gate; });
    const confirming = first.confirmContact(input); await started;
    const cancelling = second.cancelBatch({ actorId, batchId: batch.id, now });
    try {
      let waiting = false;
      for (let i = 0; i < 100 && !waiting; i++) { waiting = await cancellationWaiting(); if (!waiting) await new Promise((r) => setTimeout(r, 10)); }
      assert.equal(waiting, true, "second connection must wait on the confirmation transaction lock");
    } finally { release(); }
    await confirming; await cancelling;
    const detail = (await first.getBatch(actorId, batch.id))!;
    assert.equal(detail.batch.status, "cancelled"); assert.equal(detail.batch.confirmedItems, 1); assert.equal(detail.items[0].status, "confirmed");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM orbit_records WHERE collection_name = 'contacts'")).rows[0].count, 1);
  });
});

test("cancel-first and foreign scopes reject confirmation before any contact write", { skip }, async () => {
  await fixture(async ({ service, beforeContactWrite, pool }) => {
    const first = service(); const { input, batch } = await ready(first);
    beforeContactWrite(async () => assert.fail("unexpected contact write"));
    await assert.rejects(service(1, "foreign").confirmContact(input), /not found/);
    await assert.rejects(first.confirmContact({ ...input, actorId: "foreign" }), /not found/);
    await first.cancelBatch({ actorId, batchId: batch.id, now });
    await assert.rejects(first.confirmContact(input), /no longer available/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM orbit_records WHERE collection_name = 'contacts'")).rows[0].count, 0);
  });
});

test("dispatch failure leaves a retryable confirmation; duplicate review does not settle another card", { skip }, async () => {
  await fixture(async ({ service, pool, pending }) => {
    const first = service(); const { input, items } = await ready(first, 2);
    const queued = withQueuedCardBatches(first, async () => { throw new Error("dispatch unavailable"); });
    await assert.rejects(queued.confirmContact(input), /changes were saved/);
    assert.equal(await pending(), true);
    const repeated = await first.confirmContact(input);
    assert.ok(repeated.success); assert.equal(repeated.data.state, "already_confirmed");
    const duplicate = await queued.confirmContact({ ...input, itemId: items[1].id });
    assert.ok(duplicate.success); assert.equal(duplicate.data.state, "duplicate_review");
    const detail = (await first.getBatch(actorId, input.batchId))!;
    assert.equal(detail.items[1].status, "extracted"); assert.equal(detail.batch.confirmedItems, 1);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM orbit_records WHERE collection_name = 'contacts'")).rows[0].count, 1);
  });
});
