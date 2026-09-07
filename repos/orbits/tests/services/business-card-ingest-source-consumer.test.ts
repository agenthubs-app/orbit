import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import sharp from "sharp";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { createBusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import { createIngestV2SourceConsumer } from "../../features/acquisition/business-card-ingest-v2/source-consumer";
import { registerCardImageWrite } from "../../features/acquisition/business-card-ingest-v2/image-write-journal";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { createCardUploadSourceReader } from "../../features/acquisition/storage/business-card-upload-source-reader";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const workspaceId = "source-consumer", actorId = "owner";
const digest = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

test("V2 source consumption atomically uploads/replaces real images and survives rollback, replay and cancelled targets", {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const schema = `source_consume_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const raw = new Map<string, Buffer>(), derivatives = new Map<string, Buffer>();
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = await pool.connect();
    try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    const repository = createBusinessCardIngestRepository({ pool, workspaceId });
    const sources = createCardUploadSourceRepository({ pool, workspaceId, wake: async () => {} });
    const read = createCardUploadSourceReader({ workspaceId, transport: { async open(key) {
      const bytes = raw.get(key); return bytes ? new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) : null;
    } } });
    const store = {
      async put(bytes: Buffer) {
        const objectKey = `${randomUUID()}.jpg`;
        await registerCardImageWrite({ pool, workspaceId, objectKey, wake: async () => {} });
        derivatives.set(objectKey, bytes); return { objectKey, size: bytes.length };
      },
      async get(key: string) { return derivatives.get(key) ?? null; },
      async delete(key: string) { derivatives.delete(key); },
    };
    let failPublish = false, publishes = 0;
    const consume = createIngestV2SourceConsumer({ sources, read, repository, store,
      gate: { run: async (_, operation) => operation() }, publish: async () => { publishes++; if (failPublish) throw new Error("publish interrupted"); },
    });
    const jpeg = await sharp({ create: { width: 96, height: 64, channels: 3, background: "#5588aa" } }).jpeg().toBuffer();
    const large = Buffer.concat([jpeg, Buffer.alloc(6 * 1024 * 1024 - jpeg.length)]);
    const reserve = async (bytes: Buffer) => {
      const source = await sources.reserve({ actorId, requestKey: randomUUID(), pipeline: "v2", fileName: "card.jpg",
        mimeType: "image/jpeg", byteSize: bytes.length, digest: digest(bytes) });
      raw.set(source.objectKey, bytes); return source;
    };
    const batch = await repository.createBatch({ actorId, idempotencyKey: randomUUID(), manifest: [{
      fileName: "card.jpg", mimeType: "image/jpeg", rawSize: large.length, clientDigest: digest(large), seq: 1,
    }] });
    const source = await reserve(large);
    const input = { actorId, batchId: batch.batch.id, itemId: batch.items[0].id, sourceId: source.id, operation: "upload" as const };
    // Fail only the receipt update, after the target mutation ran on its borrowed client.
    await pool.query(`CREATE FUNCTION reject_source_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF new.state = 'consumed' THEN RAISE EXCEPTION 'receipt interrupted'; END IF; RETURN new; END $$;
      CREATE TRIGGER reject_source_receipt BEFORE UPDATE ON bc_ingest_raw_uploads FOR EACH ROW EXECUTE FUNCTION reject_source_receipt();`);
    await assert.rejects(consume(input), /receipt interrupted/);
    const unchanged = await repository.getBatch({ actorId, batchId: batch.batch.id });
    assert.equal(unchanged?.items[0].status, "awaiting_upload");
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [source.id])).rows[0].state, "reserved");
    assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows[0].state, "pending");
    await pool.query("DROP TRIGGER reject_source_receipt ON bc_ingest_raw_uploads");
    failPublish = true;
    await assert.rejects(consume(input), /publish interrupted/);
    const uploaded = (await repository.getBatch({ actorId, batchId: batch.batch.id }))!.items[0];
    assert.equal(uploaded.status, "uploaded");
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [source.id])).rows[0].state, "consumed");
    const normalized = await sharp(derivatives.get(uploaded.derivativeObjectKey!)!).metadata();
    assert.equal(normalized.format, "jpeg"); assert.equal(normalized.width, 96);
    const count = derivatives.size;
    failPublish = false;
    const replay = await consume(input); assert.equal(replay.reused, true);
    assert.equal(replay.item.version, uploaded.version); assert.equal(derivatives.size, count);
    const replacement = await reserve(jpeg);
    const replace = { ...input, sourceId: replacement.id, operation: "replace" as const, expectedVersion: uploaded.version };
    const replaced = await consume(replace);
    assert.equal(replaced.item.version, uploaded.version + 1);
    assert.notEqual(replaced.item.derivativeObjectKey, uploaded.derivativeObjectKey);
    assert.equal((await consume(replace)).reused, true);
    await assert.rejects(consume({ ...replace, expectedVersion: replaced.item.version }), /another target/);
    const cleanup = await pool.query("SELECT object_key FROM bc_ingest_cleanup_tasks WHERE workspace_id=$1", [workspaceId]);
    assert.ok(cleanup.rows.some((row) => row.object_key === uploaded.derivativeObjectKey));
    const stale = await reserve(jpeg);
    await assert.rejects(consume({ ...replace, sourceId: stale.id }), /item changed/);
    await repository.cancelBatch({ actorId, batchId: batch.batch.id });
    await assert.rejects(consume({ ...replace, sourceId: stale.id, expectedVersion: replaced.item.version }), /replace is not allowed|item changed/);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [stale.id])).rows[0].state, "reserved");
    assert.ok(publishes >= 4);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});
