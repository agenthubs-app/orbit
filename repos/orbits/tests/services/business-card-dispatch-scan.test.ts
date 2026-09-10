import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore, type ClosableLiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { createBusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import { createIngestV2Worker } from "../../features/acquisition/business-card-ingest-v2/worker";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { hasPendingCardWork, processCardQueueTick, CardWorkPending } from "../../features/acquisition/business-card-queue-worker";
import { redispatchPendingCardWork } from "../../features/acquisition/business-card-dispatch-scan";
import { handleCardDispatchScanRequest } from "../../features/acquisition/business-card-dispatch-scan-http";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const workspaceId = "workspace:scan%_";
const imageStore = { async save() { return "test.jpg"; }, async read() { return Buffer.from("test"); }, async removeItemImage() {}, async removeBatchImages() {} };
const derivativeStore = { async put() { return { objectKey: randomUUID(), size: 4 }; }, async get() { return Buffer.from("test"); }, async delete() {} };

async function withDatabase(run: (pool: Pool, client: ClosableLiveRecordSqlClient) => Promise<void>) {
  const schema = `card_scan_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` });
  const url = new URL(databaseUrl!); url.searchParams.set("options", `-c search_path=${schema}`);
  const client = createPgLiveRecordSqlClient({ connectionString: url.toString(), max: 2 });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const connection = await pool.connect();
    try { await runBusinessCardIngestV2Migrations(connection); } finally { connection.release(); }
    await run(pool, client);
  } finally {
    await client.close(); await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
}

function manifest() { return [{ fileName: "test.jpg", mimeType: "image/jpeg", rawSize: 4, seq: 1, clientDigest: `sha256:${"a".repeat(64)}` }]; }

test("card scan authenticates before touching storage and returns only aggregate results", async () => {
  const secret = "s".repeat(32); let runs = 0;
  const run = async () => { runs++; return { examined: 2, published: 1, failed: 0 }; };
  const request = (auth?: string, query = "") => new Request(`https://test/dispatch${query}`, { headers: auth ? { authorization: auth } : {} });
  assert.equal((await handleCardDispatchScanRequest(request(), run, secret)).status, 401);
  assert.equal((await handleCardDispatchScanRequest(request(`Bearer ${"x".repeat(32)}`), run, secret)).status, 401);
  assert.equal((await handleCardDispatchScanRequest(request("Bearer short"), run, "short")).status, 401);
  assert.equal((await handleCardDispatchScanRequest(request(`Bearer ${secret}`, "?workspace=other"), run, secret)).status, 400);
  assert.equal(runs, 0);
  const accepted = await handleCardDispatchScanRequest(request(`Bearer ${secret}`), run, secret);
  assert.equal(accepted.status, 200); assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.deepEqual(await accepted.json(), { data: { examined: 2, published: 1, failed: 0 } });
  assert.equal((await handleCardDispatchScanRequest(request(`Bearer ${secret}`), async () => ({ examined: 2, published: 1, failed: 1 }), secret)).status, 503);
  const failure = await handleCardDispatchScanRequest(request(`Bearer ${secret}`), async () => { throw new Error("private storage diagnostic"); }, secret);
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: { code: "BUSINESS_CARD_DISPATCH_SCAN_UNAVAILABLE" } });
});

test("missing database result is unresolved work, never an acknowledgement", async () => {
  await assert.rejects(hasPendingCardWork({ query: async () => ({ rows: [] }) }, workspaceId, "v1"), { message: "Business-card pending state unavailable." });
});

test("scan recovers unpublished work in both pipelines without altering durable state or crossing workspaces", { skip }, async () => {
  await withDatabase(async (pool, client) => {
    const v1 = createBusinessCardBatchService({ store: createPostgresLiveRecordStore({ client }), imageStore, workspaceId });
    await v1.createBatch({ actorId: "test", now: new Date().toISOString(), sourceFiles: [], items: [{
      seq: 1, sourceFileName: "test.jpg", sourcePage: null, imageDigest: "sha256:test", imageJpegBase64: Buffer.from("test").toString("base64"), uploadMimeType: "image/jpeg",
    }] });
    const repository = createBusinessCardIngestRepository({ pool, workspaceId });
    const created = await repository.createBatch({ actorId: "test", idempotencyKey: "expired", manifest: manifest() });
    await pool.query("UPDATE bc_ingest_batches SET expires_at = now() - interval '1 minute' WHERE workspace_id = $1 AND id = $2", [workspaceId, created.batch.id]);
    const published: string[] = [];
    const result = await redispatchPendingCardWork({ client, workspaceId, publish: async (pipeline) => {
      if (pipeline === "v1") throw new Error("publisher unavailable"); published.push(pipeline);
    } });
    assert.deepEqual(result, { examined: 2, published: 1, failed: 1 });
    for (let i = 0; i < 2; i++) assert.deepEqual(await redispatchPendingCardWork({ client, workspaceId, publish: async (p) => { published.push(p); } }), { examined: 2, published: 2, failed: 0 });
    assert.deepEqual(published, ["v2", "v1", "v2", "v1", "v2"]);
    assert.equal((await repository.getBatch({ actorId: "test", batchId: created.batch.id }))?.batch.status, "collecting");
    assert.deepEqual(await redispatchPendingCardWork({ client, workspaceId: "workspace:scanXY", publish: async () => { assert.fail("cross-workspace publication"); } }), { examined: 2, published: 0, failed: 0 });
    await v1.sweepExpired(new Date(Date.now() + 30 * 86400_000).toISOString());
    await repository.sweepDueBatches();
    assert.deepEqual(await redispatchPendingCardWork({ client, workspaceId, publish: async () => { assert.fail("finished work must not publish"); } }), { examined: 2, published: 0, failed: 0 });
  });
});

test("more than twenty expired empty V2 batches retain the queue until every batch is swept", { skip }, async () => {
  await withDatabase(async (pool, client) => {
    const repository = createBusinessCardIngestRepository({ pool, workspaceId });
    for (let i = 0; i < 21; i++) await repository.createBatch({ actorId: "test", idempotencyKey: `expired-${i}`, manifest: manifest() });
    await pool.query("UPDATE bc_ingest_batches SET expires_at = now() - interval '1 minute' WHERE workspace_id = $1", [workspaceId]);
    const worker = createIngestV2Worker({ repository, store: derivativeStore, provider: null, notify: async () => {} });
    const runtime = { run: () => worker.runOnce(), pending: () => hasPendingCardWork(client, workspaceId, "v2") };
    await assert.rejects(processCardQueueTick("v2", runtime), (error: unknown) => error instanceof CardWorkPending);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM bc_ingest_batches WHERE status = 'collecting'")).rows[0].count, 1);
    await processCardQueueTick("v2", runtime);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM bc_ingest_batches WHERE status = 'expired'")).rows[0].count, 21);
    assert.equal(await hasPendingCardWork(client, workspaceId, "v2"), false);
  });
});

test("future leases and cleanup backoff remain visible to recovery", { skip }, async () => {
  await withDatabase(async (pool, client) => {
    const repository = createBusinessCardIngestRepository({ pool, workspaceId });
    const created = await repository.createBatch({ actorId: "test", idempotencyKey: "lease", manifest: manifest() });
    await repository.markItemUploaded({ actorId: "test", batchId: created.batch.id, itemId: created.items[0]!.id, imageDigest: manifest()[0]!.clientDigest, derivativeObjectKey: "test.jpg", derivativeSize: 4 });
    await repository.finalizeBatch({ actorId: "test", batchId: created.batch.id });
    assert.equal((await repository.claimItems({ limit: 1 })).length, 1);
    assert.equal(await hasPendingCardWork(client, workspaceId, "v2"), true);
    await repository.cancelBatch({ actorId: "test", batchId: created.batch.id });
    await pool.query("UPDATE bc_ingest_cleanup_tasks SET next_attempt_at = now() + interval '1 hour' WHERE workspace_id = $1", [workspaceId]);
    assert.equal(await hasPendingCardWork(client, workspaceId, "v2"), true);
    await pool.query("UPDATE bc_ingest_cleanup_tasks SET status = 'done', done_at = now() WHERE workspace_id = $1", [workspaceId]);
    assert.equal(await hasPendingCardWork(client, workspaceId, "v2"), false);
  });
});
