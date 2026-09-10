import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { createBusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import { registerCardImageWrite, reapUnattachedCardImages } from "../../features/acquisition/business-card-ingest-v2/image-write-journal";
import { createPrivateBlobDerivativeStore, type PrivateCardBlobClient } from "../../features/acquisition/storage/business-card-private-blob-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const workspaceId = "workspace:write-journal";

async function fixture(run: (f: {
  pool: Pool;
  store: ReturnType<typeof createPrivateBlobDerivativeStore>;
  repository: ReturnType<typeof createBusinessCardIngestRepository>;
  objects: Map<string, Buffer>;
  uploadInput: { actorId: string; batchId: string; itemId: string; imageDigest: string; derivativeSize: number };
}) => Promise<void>) {
  const schema = `image_journal_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const connection = await pool.connect();
    try { await runBusinessCardIngestV2Migrations(connection); await runBusinessCardIngestV2Migrations(connection); } finally { connection.release(); }
    const repository = createBusinessCardIngestRepository({ pool, workspaceId });
    const imageDigest = `sha256:${"a".repeat(64)}`;
    const created = await repository.createBatch({ actorId: "test", idempotencyKey: "test", manifest: [{
      fileName: "test.jpg", mimeType: "image/jpeg", rawSize: 4, seq: 1, clientDigest: imageDigest,
    }] });
    const objects = new Map<string, Buffer>();
    const client: PrivateCardBlobClient = {
      async put(path, bytes) {
        const key = path.split("/").at(-1)!;
        assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes WHERE workspace_id = $1 AND object_key = $2", [workspaceId, key])).rows[0]?.state, "pending", "intent must commit before bytes are stored");
        objects.set(path, bytes);
      },
      async get(path) { return objects.get(path) ?? null; },
      async delete(paths) { for (const path of paths) objects.delete(path); },
      async list() { return { pathnames: [...objects.keys()], hasMore: false }; },
    };
    const store = createPrivateBlobDerivativeStore({ workspaceId, client, lifecycle: {
      beforePut: (objectKey) => registerCardImageWrite({ pool, workspaceId, objectKey, wake: async () => {} }),
      reap: () => reapUnattachedCardImages({ pool, workspaceId, remove: (key) => store.delete(key) }),
    } });
    await run({ pool, store, repository, objects, uploadInput: { actorId: "test", batchId: created.batch.id, itemId: created.items[0]!.id, imageDigest, derivativeSize: 4 } });
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
}

async function due(pool: Pool) { await pool.query("UPDATE bc_ingest_image_writes SET next_attempt_at = now() - interval '1 second' WHERE workspace_id = $1", [workspaceId]); }

test("saved references atomically attach their write intent and stay protected from cleanup", { skip }, async () => {
  await fixture(async ({ pool, store, repository, uploadInput, objects }) => {
    const image = await store.put(Buffer.from("test"));
    await repository.markItemUploaded({ ...uploadInput, derivativeObjectKey: image.objectKey });
    assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows[0].state, "attached");
    await due(pool);
    assert.equal(await store.reapUnattachedWrites!(), 0); assert.equal(objects.size, 1);
    const replacement = await store.put(Buffer.from("next"));
    const item = (await repository.getBatch({ actorId: "test", batchId: uploadInput.batchId }))!.items[0]!;
    await repository.swapDerivative({ ...uploadInput, expectedVersion: item.version, derivativeObjectKey: replacement.objectKey });
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM bc_ingest_image_writes WHERE state = 'attached'")).rows[0].count, 2);
  });
});

test("abandoned writes wait through the grace period, then delete with a durable late-write fence", { skip }, async () => {
  await fixture(async ({ pool, store, repository, uploadInput, objects }) => {
    const image = await store.put(Buffer.from("test"));
    assert.equal(await store.reapUnattachedWrites!(), 0); assert.equal(objects.size, 1);
    await due(pool);
    assert.equal(await store.reapUnattachedWrites!(), 1); assert.equal(objects.size, 0);
    await assert.rejects(repository.markItemUploaded({ ...uploadInput, derivativeObjectKey: image.objectKey }), /Image write has expired/);
    assert.equal((await repository.getBatch({ actorId: "test", batchId: uploadInput.batchId }))!.items[0]!.derivativeObjectKey, null);
  });
});

test("interruption after physical deletion cannot resurrect the reference and retries idempotently", { skip }, async () => {
  await fixture(async ({ pool, store, repository, uploadInput, objects }) => {
    const image = await store.put(Buffer.from("test")); await due(pool);
    await reapUnattachedCardImages({ pool, workspaceId, remove: async (key) => { await store.delete(key); throw new Error("interrupted after deletion"); } });
    assert.equal(objects.size, 0);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows[0].state, "deleting");
    await assert.rejects(repository.markItemUploaded({ ...uploadInput, derivativeObjectKey: image.objectKey }), /Image write has expired/);
    await due(pool); assert.equal(await store.reapUnattachedWrites!(), 1);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows[0].state, "deleted");
  });
});

test("a reference transaction holding the intent lock wins against concurrent cleanup", { skip }, async () => {
  await fixture(async ({ pool, store, uploadInput, objects }) => {
    const image = await store.put(Buffer.from("test")); await due(pool);
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query("UPDATE bc_ingest_items SET derivative_object_key = $3 WHERE workspace_id = $1 AND id = $2", [workspaceId, uploadInput.itemId, image.objectKey]);
      assert.equal(await store.reapUnattachedWrites!(), 0);
      await writer.query("COMMIT");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
    assert.equal(await store.reapUnattachedWrites!(), 0); assert.equal(objects.size, 1);
  });
});

test("wake failure leaves a recoverable intent and foreign-workspace cleanup cannot delete it", { skip }, async () => {
  await fixture(async ({ pool, store, objects }) => {
    const key = `${randomUUID()}.jpg`;
    await assert.rejects(registerCardImageWrite({ pool, workspaceId, objectKey: key, wake: async () => { throw new Error("private publisher detail"); } }), { message: "Card image write registration unavailable." });
    assert.equal(objects.size, 0);
    await store.put(Buffer.from("test")); await due(pool);
    assert.equal(await reapUnattachedCardImages({ pool, workspaceId: "other", remove: async () => { assert.fail("foreign delete"); } }), 0);
    assert.equal(objects.size, 1);
  });
});
