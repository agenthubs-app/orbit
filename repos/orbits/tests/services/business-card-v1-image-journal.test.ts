import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { createBusinessCardBatchWorker } from "../../features/acquisition/business-card-batch-worker";
import { createTransactionalBusinessCardBatchService } from "../../features/acquisition/storage/business-card-batch-transactions";
import { createPrivateBlobBatchImageStore, type PrivateCardBlobClient } from "../../features/acquisition/storage/business-card-private-blob-store";
import { prepareV1CardImageJournal } from "../../features/acquisition/storage/business-card-v1-image-journal";
import { registerCardImageWrite, reapUnattachedCardImages } from "../../features/acquisition/business-card-ingest-v2/image-write-journal";
import { hasPendingCardWork } from "../../features/acquisition/business-card-queue-worker";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const workspaceId = "workspace:v1-journal";

async function fixture(run: (f: {
  pool: Pool; journalPool: Pool; sql: LiveRecordSqlClient; objects: Map<string, Buffer>;
  images: ReturnType<typeof createPrivateBlobBatchImageStore>;
  service(fail?: boolean): ReturnType<typeof createTransactionalBusinessCardBatchService>;
}) => Promise<void>) {
  const schema = `v1_journal_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const journalPool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const sql: LiveRecordSqlClient = { async query<TRow>(text: string, values?: readonly unknown[]) {
    const r = await journalPool.query(text, values ? [...values] : undefined); return { rows: r.rows as TRow[] };
  } };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await prepareV1CardImageJournal(journalPool); await prepareV1CardImageJournal(journalPool);
    const objects = new Map<string, Buffer>();
    const client: PrivateCardBlobClient = {
      async put(path, bytes) {
        assert.equal((await journalPool.query("SELECT state FROM bc_ingest_image_writes WHERE workspace_id = $1 AND object_key = $2", [workspaceId, path])).rows[0]?.state, "pending");
        objects.set(path, bytes);
      },
      async get(path) { return objects.get(path) ?? null; },
      async delete(paths) { for (const path of paths) objects.delete(path); },
      async list(prefix) { return { pathnames: [...objects.keys()].filter((key) => key.startsWith(prefix)), hasMore: false }; },
    };
    const images = createPrivateBlobBatchImageStore({ workspaceId, client, lifecycle: {
      prepare: () => prepareV1CardImageJournal(journalPool),
      beforePut: (objectKey) => registerCardImageWrite({ pool: journalPool, workspaceId, objectKey, pipeline: "v1", wake: async () => {} }),
      reap: () => reapUnattachedCardImages({ pool: journalPool, workspaceId, pipeline: "v1", remove: (key) => images.removeItemImage(key) }),
    } });
    const service = (fail = false) => createTransactionalBusinessCardBatchService({ pool, workspaceId, prepare: images.prepareWrites,
      createService(store) {
        const base = createBusinessCardBatchService({ store, imageStore: images, workspaceId });
        return fail ? { ...base, async createBatch(input) { await base.createBatch(input); throw new Error("rollback after references"); } } : base;
      },
    });
    await run({ pool, journalPool, sql, objects, images, service });
  } finally {
    await pool.end(); await journalPool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
}

function input(count = 1) { return { actorId: "test", now: new Date().toISOString(), sourceFiles: [], items: Array.from({ length: count }, (_, i) => ({
  seq: i + 1, sourceFileName: "test.jpg", sourcePage: null, imageDigest: `sha256:${i}`, imageJpegBase64: Buffer.from("test").toString("base64"), uploadMimeType: "image/jpeg",
})) }; }

test("V1 transaction rollback preserves independently committed image intents for OCR-free worker cleanup", { skip }, async () => {
  await fixture(async ({ journalPool, sql, objects, images, service }) => {
    await assert.rejects(service(true).createBatch(input(2)), /rollback after references/);
    assert.equal(objects.size, 2);
    assert.equal((await journalPool.query("SELECT count(*)::int AS count FROM orbit_records")).rows[0].count, 0);
    assert.deepEqual((await journalPool.query("SELECT state FROM bc_ingest_image_writes")).rows.map((r) => r.state), ["pending", "pending"]);
    assert.equal(await hasPendingCardWork(sql, workspaceId, "v1"), false);
    await journalPool.query("UPDATE bc_ingest_image_writes SET next_attempt_at = now() - interval '1 second'");
    assert.equal(await hasPendingCardWork(sql, workspaceId, "v1"), true);
    assert.equal(await hasPendingCardWork(sql, workspaceId, "v2"), false);
    const worker = createBusinessCardBatchWorker({ service: service(), imageStore: images, provider: null, notify: async () => {} });
    await worker.runOnce({ workerId: "test", now: new Date().toISOString() });
    assert.equal(objects.size, 0); assert.equal(await hasPendingCardWork(sql, workspaceId, "v1"), false);
  });
});

test("four concurrent V1 transactions do not starve the independent image-intent pool", { skip, timeout: 15_000 }, async () => {
  await fixture(async ({ journalPool, objects, images, service }) => {
    await Promise.all(Array.from({ length: 4 }, () => service().createBatch(input())));
    assert.equal(objects.size, 4);
    assert.equal((await journalPool.query("SELECT count(*)::int AS count FROM bc_ingest_image_writes WHERE state = 'attached'")).rows[0].count, 4);
    await journalPool.query("UPDATE bc_ingest_image_writes SET next_attempt_at = now() - interval '1 second'");
    assert.equal(await images.reapUnattachedWrites!(), 0); assert.equal(objects.size, 4);
  });
});

test("V1 deleting fence rejects late record references and validates workspace paths", { skip }, async () => {
  await fixture(async ({ journalPool, sql, images }) => {
    const imagePath = await images.save("batch", "item", Buffer.from("test"));
    await assert.rejects(registerCardImageWrite({ pool: journalPool, workspaceId: "foreign", objectKey: imagePath, pipeline: "v1", wake: async () => {} }), /Invalid card image write scope/);
    await journalPool.query("UPDATE bc_ingest_image_writes SET next_attempt_at = now() - interval '1 second'");
    await reapUnattachedCardImages({ pool: journalPool, workspaceId, pipeline: "v1", remove: async (key) => { await images.removeItemImage(key); throw new Error("interrupted"); } });
    const now = new Date().toISOString();
    await assert.rejects(async () => createPostgresLiveRecordStore({ client: sql }).upsertRecord({
      workspaceId, collectionName: "businessCardBatchItems", recordId: "late", userId: "test", sourceType: "test", sourceId: "late",
      evidenceIds: [], lifecycleState: "active", payload: { item: { imagePath } }, createdAt: now, updatedAt: now,
    }), /Image write has expired/);
  });
});
