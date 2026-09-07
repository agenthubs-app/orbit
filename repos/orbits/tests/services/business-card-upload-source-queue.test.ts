import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { hasPendingCardWork } from "../../features/acquisition/business-card-queue-worker";
import { redispatchPendingCardWork } from "../../features/acquisition/business-card-dispatch-scan";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
test("raw uploads recover missed wakes, preserve lease/backoff work and stop after all cleanup", {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const schema = `source_queue_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` });
  const workspaceId = "source-queue", actorId = "owner";
  const client: LiveRecordSqlClient = { async query<TRow>(sql: string, params?: readonly unknown[]) {
    const result = await pool.query(sql, params ? [...params] : undefined);
    return { rows: result.rows as TRow[] };
  } };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const connection = await pool.connect();
    try { await runBusinessCardIngestV2Migrations(connection); } finally { connection.release(); }
    const repository = createCardUploadSourceRepository({ pool, workspaceId, wake: async () => {} });
    const ids: string[] = [];
    for (const pipeline of ["v1", "v2"] as const) {
      const source = await repository.reserve({ actorId, requestKey: randomUUID(), pipeline,
        fileName: "card.jpg", mimeType: "image/jpeg", byteSize: 4, digest: `sha256:${"a".repeat(64)}` });
      ids.push(source.id);
      assert.equal(await hasPendingCardWork(client, workspaceId, pipeline), false, "future reservations must not spin the worker");
    }
    const claimed = await repository.claim(actorId, [ids[0]]);
    assert.equal(claimed.state, "claimed");
    await pool.query("UPDATE bc_ingest_raw_uploads SET expires_at=now()-interval '1 minute', next_attempt_at=now()-interval '1 minute', upload_expires_at=now()-interval '2 minutes'");
    const published: string[] = [];
    assert.deepEqual(await redispatchPendingCardWork({ client, workspaceId, publish: async (pipeline) => { published.push(pipeline); } }), { examined: 2, published: 2, failed: 0 });
    assert.deepEqual(published, ["v1", "v2"]);
    assert.deepEqual(await redispatchPendingCardWork({ client, workspaceId: "other", publish: async () => { assert.fail("foreign work"); } }), { examined: 2, published: 0, failed: 0 });
    assert.deepEqual(await repository.reap("v1", async () => { assert.fail("active lease"); }), { deleted: 0, failed: 0 });
    assert.equal(await hasPendingCardWork(client, workspaceId, "v1"), true, "expired source with live lease remains recoverable");
    await pool.query("UPDATE bc_ingest_raw_uploads SET lease_expires_at=now()-interval '1 second' WHERE state='processing'");
    assert.deepEqual(await repository.reap("v1", async () => { throw new Error("interrupted delete"); }), { deleted: 0, failed: 1 });
    assert.equal(await hasPendingCardWork(client, workspaceId, "v1"), true, "deletion backoff keeps its wake");
    assert.deepEqual(await repository.reap("v1", async () => { assert.fail("backoff"); }), { deleted: 0, failed: 0 });
    await pool.query("UPDATE bc_ingest_raw_uploads SET next_attempt_at=now()-interval '1 second' WHERE state='deleting'");
    for (const pipeline of ["v1", "v2"] as const) {
      assert.deepEqual(await repository.reap(pipeline, async () => {}), { deleted: 1, failed: 0 });
      assert.equal(await hasPendingCardWork(client, workspaceId, pipeline), false);
    }
    const source = await repository.reserve({ actorId, requestKey: randomUUID(), pipeline: "v1",
      fileName: "card.jpg", mimeType: "image/jpeg", byteSize: 4, digest: `sha256:${"b".repeat(64)}` });
    const lease = await repository.claim(actorId, [source.id]); assert.equal(lease.state, "claimed");
    if (lease.state !== "claimed") assert.fail("lease missing");
    await repository.consume({ actorId, ids: [source.id], leaseKey: lease.leaseKey, writeTarget: async () => "target" });
    assert.equal(await hasPendingCardWork(client, workspaceId, "v1"), false, "consumed source waits until upload permits expire");
    await pool.query("UPDATE bc_ingest_raw_uploads SET next_attempt_at=now()-interval '1 second',upload_expires_at=now()-interval '2 minutes' WHERE id=$1", [source.id]);
    assert.equal(await hasPendingCardWork(client, workspaceId, "v1"), true);
    assert.deepEqual(await repository.reap("v1", async () => {}), { deleted: 1, failed: 0 });
    assert.equal(await hasPendingCardWork(client, workspaceId, "v1"), false);
  } finally {
    await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  }
});
