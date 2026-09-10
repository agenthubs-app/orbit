import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { registerCardImageWrite } from "../../features/acquisition/business-card-ingest-v2/image-write-journal";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { createV1PreparationRepository } from "../../features/acquisition/business-card-v1-preparation/repository";
import { createV1PreparationFinalizer } from "../../features/acquisition/business-card-v1-preparation/finalize";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { prepareV1CardImageJournal } from "../../features/acquisition/storage/business-card-v1-image-journal";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const workspaceId = "finalize", actorId = "owner";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture(run: (f: {
  pool: Pool; jobs: ReturnType<typeof createV1PreparationRepository>;
  finalize: ReturnType<typeof createV1PreparationFinalizer>; jobId: string;
  service: ReturnType<typeof createBusinessCardBatchService>; failPublish(value: boolean): void;
}) => Promise<void>) {
  const schema = `v1_finalize_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = await pool.connect(); try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    const sources = createCardUploadSourceRepository({ pool, workspaceId, wake: async () => {} });
    const jobs = createV1PreparationRepository({ pool, workspaceId, wake: async () => {} });
    const sourceIds: string[] = [];
    for (const pdf of [true, false]) sourceIds.push((await sources.reserve({ actorId, requestKey: randomUUID(), pipeline: "v1",
      fileName: pdf ? "same.pdf" : "card.jpg", mimeType: pdf ? "application/pdf" : "image/jpeg",
      byteSize: 10, digest: `sha256:${"a".repeat(64)}` })).id);
    const job = await jobs.admit({ actorId, requestKey: randomUUID(), sourceIds });
    const lease = (await jobs.claim())!;
    for (const [index, sourceId] of sourceIds.entries()) {
      const pageCount = index === 0 ? 2 : 1;
      for (let page = 1; page <= pageCount; page++) {
        const itemId = randomUUID(); const imagePath = `orbit-card-images/${hash(workspaceId)}/v1/${hash(job.id)}/${hash(itemId)}.jpg`;
        await registerCardImageWrite({ pool, workspaceId, pipeline: "v1", objectKey: imagePath, wake: async () => {} });
        await jobs.checkpoint({ jobId: job.id, leaseKey: lease.leaseKey!, sourceId, page, pageCount,
          itemId, imagePath, imageDigest: `sha256:${"a".repeat(64)}` });
      }
    }
    let fail = false;
    const finalize = createV1PreparationFinalizer({ workspaceId, jobs, sources, prepareImages: () => prepareV1CardImageJournal(pool),
      publish: async () => { if (fail) throw new Error("queue unavailable"); } });
    const store = createPostgresLiveRecordStore({ client: { async query<T>(text: string, values?: readonly unknown[]) {
      const result = await pool.query(text, values ? [...values] : undefined); return { rows: result.rows as T[] };
    } } });
    const unexpected = async (): Promise<never> => { throw new Error("Finalization must not write image bytes"); };
    const service = createBusinessCardBatchService({ workspaceId, store, imageStore: {
      save: unexpected, read: unexpected, removeBatchImages: unexpected, removeItemImage: unexpected,
    } });
    await run({ pool, jobs, finalize, jobId: job.id, service, failPublish: (value) => { fail = value; } });
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

test("prepared pages become a real V1 batch with atomic image references, source receipts and retryable publishing", { skip }, async () => {
  await fixture(async ({ pool, jobs, finalize, jobId, service, failPublish }) => {
    await assert.rejects(finalize("foreign", jobId), /not found/);
    failPublish(true); await assert.rejects(finalize(actorId, jobId), /queue unavailable/);
    assert.equal((await jobs.get(actorId, jobId)).state, "completed");
    assert.deepEqual((await pool.query("SELECT state,target_ref FROM bc_ingest_raw_uploads")).rows,
      [{ state: "consumed", target_ref: jobId }, { state: "consumed", target_ref: jobId }]);
    assert.deepEqual((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows.map((r) => r.state), ["attached", "attached", "attached"]);
    const detail = (await service.getBatch(actorId, jobId))!;
    assert.equal(detail.batch.status, "processing"); assert.equal(detail.batch.totalItems, 3);
    assert.deepEqual(detail.batch.sourceFiles, [{ fileName: "same.pdf", kind: "pdf", itemCount: 2 }, { fileName: "card.jpg", kind: "image", itemCount: 1 }]);
    assert.deepEqual(detail.items.map((item) => [item.seq, item.sourcePage, item.status]), [[1, 1, "pending"], [2, 2, "pending"], [3, null, "pending"]]);
    failPublish(false); assert.deepEqual(await Promise.all([finalize(actorId, jobId), finalize(actorId, jobId)]), [jobId, jobId]);
    assert.equal((await service.listBatches(actorId)).length, 1);
    assert.equal(await service.getBatch("foreign", jobId), null);
    const claimed = await service.claimPendingItems({ workerId: "ocr", now: new Date().toISOString(), limit: 3 });
    assert.equal(claimed.length, 3, "existing OCR worker can claim all prepared pages");
  });
});

test("failure after batch creation rolls back actual records, image attachments, job and receipts", { skip }, async () => {
  await fixture(async ({ pool, jobs, finalize, jobId, service }) => {
    await pool.query(`CREATE FUNCTION reject_completed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF new.collection_name='businessCardImportJobs' AND new.payload->'job'->>'state'='completed' THEN RAISE EXCEPTION 'interrupted'; END IF; RETURN new; END $$;
      CREATE TRIGGER reject_completed BEFORE UPDATE ON orbit_records FOR EACH ROW EXECUTE FUNCTION reject_completed();`);
    await assert.rejects(finalize(actorId, jobId));
    assert.equal(await service.getBatch(actorId, jobId), null);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM orbit_records WHERE collection_name='businessCardBatchItems'")).rows[0].count, 0);
    assert.equal((await jobs.get(actorId, jobId)).state, "ready");
    assert.deepEqual((await pool.query("SELECT state FROM bc_ingest_raw_uploads")).rows.map((r) => r.state), ["reserved", "reserved"]);
    assert.deepEqual((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows.map((r) => r.state), ["pending", "pending", "pending"]);
    await pool.query("DROP TRIGGER reject_completed ON orbit_records");
    assert.equal(await finalize(actorId, jobId), jobId);
  });
});

test("a staged image fenced for deletion prevents the whole prepared batch from becoming visible", { skip }, async () => {
  await fixture(async ({ pool, jobs, finalize, jobId, service }) => {
    const ready = await jobs.get(actorId, jobId);
    await pool.query("UPDATE bc_ingest_image_writes SET state='deleting' WHERE object_key=$1", [ready.pages[1].imagePath]);
    await assert.rejects(finalize(actorId, jobId));
    assert.equal(await service.getBatch(actorId, jobId), null);
    assert.equal((await jobs.get(actorId, jobId)).state, "ready");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM bc_ingest_image_writes WHERE state='attached'")).rows[0].count, 0);
  });
});

test("concurrent finalizers create one batch and cancelled preparations cannot create one", { skip }, async () => {
  await fixture(async ({ finalize, jobId, service }) => {
    const results = await Promise.allSettled([finalize(actorId, jobId), finalize(actorId, jobId)]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    assert.equal(await finalize(actorId, jobId), jobId);
    assert.equal((await service.listBatches(actorId)).length, 1);
    assert.equal((await service.getBatch(actorId, jobId))!.items.length, 3);
  });
  await fixture(async ({ jobs, finalize, jobId, service }) => {
    await jobs.cancel(actorId, jobId);
    await assert.rejects(finalize(actorId, jobId), /not ready/);
    assert.equal(await service.getBatch(actorId, jobId), null);
  });
});
