import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { createCardUploadSourceReader } from "../../features/acquisition/storage/business-card-upload-source-reader";
import { createPrivateBlobBatchImageStore } from "../../features/acquisition/storage/business-card-private-blob-store";
import { prepareV1CardImageJournal } from "../../features/acquisition/storage/business-card-v1-image-journal";
import { registerCardImageWrite } from "../../features/acquisition/business-card-ingest-v2/image-write-journal";
import { createNormalizationGate } from "../../features/acquisition/business-card-ingest-v2/normalization";
import { createV1PreparationRepository } from "../../features/acquisition/business-card-v1-preparation/repository";
import { createV1PreparationFinalizer } from "../../features/acquisition/business-card-v1-preparation/finalize";
import { createV1PreparationWorker } from "../../features/acquisition/business-card-v1-preparation/worker";
import { createBusinessCardBatchService } from "../../features/acquisition/business-card-batch-service";
import { hasPendingCardWork, processCardQueueTick, CardWorkPending } from "../../features/acquisition/business-card-queue-worker";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const workspaceId = "prepare-worker", actorId = "owner";
const digest = (bytes: Buffer) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
function pdf(pages: number) {
  const nodes = Array.from({ length: pages }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 80 50] >> endobj`);
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${nodes.map((_, i) => `${i + 3} 0 R`).join(" ")}] /Count ${pages} >> endobj\n${nodes.join("\n")}\ntrailer << /Root 1 0 R /Size ${pages + 3} >>\nstartxref\n0\n%%EOF`);
}
async function fixture(run: (f: {
  pool: Pool; jobs: ReturnType<typeof createV1PreparationRepository>; objects: Map<string, Buffer>;
  worker(): ReturnType<typeof createV1PreparationWorker>;
  admit(files: Array<{ bytes: Buffer; mime: string }>): Promise<string>;
  pending(pipeline?: "v1" | "v2"): Promise<boolean>;
  service: ReturnType<typeof createBusinessCardBatchService>;
  onPut(callback: (() => Promise<void>) | undefined): void;
}) => Promise<void>) {
  const schema = `prep_worker_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL); await prepareV1CardImageJournal(pool);
    const sources = createCardUploadSourceRepository({ pool, workspaceId, wake: async () => {} });
    const jobs = createV1PreparationRepository({ pool, workspaceId, wake: async () => {} });
    const originals = new Map<string, Buffer>(), objects = new Map<string, Buffer>();
    let onPut: (() => Promise<void>) | undefined;
    const images = createPrivateBlobBatchImageStore({ workspaceId, client: {
      async put(path, bytes) { objects.set(path, bytes); await onPut?.(); },
      async get(path) { return objects.get(path) ?? null; },
      async delete(paths) { paths.forEach((path) => objects.delete(path)); },
      async list() { return { pathnames: [...objects.keys()], hasMore: false }; },
    }, lifecycle: {
      prepare: () => prepareV1CardImageJournal(pool),
      beforePut: (objectKey) => registerCardImageWrite({ pool, workspaceId, objectKey, pipeline: "v1", wake: async () => {} }),
      reap: async () => 0,
    } });
    const read = createCardUploadSourceReader({ workspaceId, transport: { async open(path) {
      const bytes = originals.get(path); return bytes ? new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) : null;
    } } });
    const finalize = createV1PreparationFinalizer({ workspaceId, jobs, sources, publish: async () => {}, prepareImages: () => prepareV1CardImageJournal(pool) });
    const gate = createNormalizationGate({ globalLimit: 1 });
    const sql: LiveRecordSqlClient = { async query<T>(text: string, values?: readonly unknown[]) {
      const result = await pool.query(text, values ? [...values] : undefined); return { rows: result.rows as T[] };
    } };
    const service = createBusinessCardBatchService({ workspaceId, imageStore: images, store: createPostgresLiveRecordStore({ client: sql }) });
    await run({ pool, jobs, objects, service, onPut: (callback) => { onPut = callback; },
      worker: () => createV1PreparationWorker({ jobs, sources, read, images, finalize, gate, pageLimit: 2 }),
      pending: (pipeline = "v1") => hasPendingCardWork(sql, workspaceId, pipeline),
      async admit(files) {
        const sourceIds: string[] = [];
        for (const [i, file] of files.entries()) {
          const source = await sources.reserve({ actorId, requestKey: randomUUID(), pipeline: "v1", fileName: `source-${i}`,
            mimeType: file.mime, byteSize: file.bytes.length, digest: digest(file.bytes) });
          originals.set(source.objectKey, file.bytes); sourceIds.push(source.id);
        }
        return (await jobs.admit({ actorId, requestKey: randomUUID(), sourceIds })).id;
      },
    });
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

test("queue ticks render bounded PDF ranges, resume in new workers and finalize mixed sources without OCR", { skip }, async () => {
  await fixture(async ({ admit, jobs, worker, objects, pending, service }) => {
    const png = await sharp({ create: { width: 60, height: 40, channels: 3, background: "red" } }).png().toBuffer();
    const id = await admit([{ bytes: pdf(5), mime: "application/pdf" }, { bytes: png, mime: "image/png" }]);
    assert.equal(await pending(), true); assert.equal(await pending("v2"), false);
    await assert.rejects(processCardQueueTick("v1", { run: () => worker().runOnce(), pending }), (error) => error instanceof CardWorkPending && error.afterSeconds === 1);
    let job = await jobs.get(actorId, id); assert.equal(job.pages.length, 2); assert.equal(job.nextPage, 3);
    await worker().runOnce(); job = await jobs.get(actorId, id); assert.equal(job.pages.length, 4);
    await worker().runOnce(); job = await jobs.get(actorId, id); assert.equal(job.nextSource, 1);
    await worker().runOnce(); job = await jobs.get(actorId, id); assert.equal(job.state, "ready"); assert.equal(job.pages.length, 6);
    assert.equal(job.pages[5].imageDigest, digest(png));
    for (const page of job.pages) {
      const bytes = objects.get(page.imagePath)!;
      assert.equal((await sharp(bytes).metadata()).format, "jpeg");
      if (page.sourcePage !== null) assert.equal(page.imageDigest, digest(bytes));
    }
    await worker().runOnce(); assert.equal((await jobs.get(actorId, id)).state, "completed");
    assert.equal((await service.getBatch(actorId, id))!.items.length, 6);
    assert.equal(await pending(), true, "created items still await real OCR");
  });
});

test("a failed page checkpoint preserves prior progress, backs off and resumes with a new image identity", { skip }, async () => {
  await fixture(async ({ pool, admit, jobs, worker, objects, pending }) => {
    const id = await admit([{ bytes: pdf(3), mime: "application/pdf" }]);
    await pool.query(`CREATE FUNCTION reject_page() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF new.collection_name='businessCardImportJobs' AND jsonb_array_length(new.payload->'job'->'pages')=2 THEN RAISE EXCEPTION 'page interrupted'; END IF; RETURN new; END $$;
      CREATE TRIGGER reject_page BEFORE UPDATE ON orbit_records FOR EACH ROW EXECUTE FUNCTION reject_page();`);
    await worker().runOnce(); let job = await jobs.get(actorId, id);
    assert.equal(job.pages.length, 1); assert.equal(job.nextPage, 2); assert.equal(job.failures, 1);
    assert.equal(objects.size, 2, "unaccepted image remains journaled for cleanup");
    assert.deepEqual(await worker().runOnce(), { claimed: 0 }); assert.equal(await pending(), true);
    await assert.rejects(processCardQueueTick("v1", { run: () => worker().runOnce(), pending }), (error) => error instanceof CardWorkPending && error.afterSeconds === 60);
    await pool.query("DROP TRIGGER reject_page ON orbit_records");
    await pool.query("UPDATE orbit_records SET payload=jsonb_set(payload,'{job,nextAttemptAt}',to_jsonb($1::text)) WHERE collection_name='businessCardImportJobs'", [new Date(Date.now() - 1000).toISOString()]);
    await worker().runOnce(); job = await jobs.get(actorId, id);
    assert.equal(job.state, "ready"); assert.equal(job.pages.length, 3); assert.equal(job.failures, 0);
    assert.equal(objects.size, 4); assert.equal(new Set(job.pages.map((page) => page.imagePath)).size, 3);
  });
});

test("cancel during an image upload fences the late checkpoint while retaining cleanup intent", { skip }, async () => {
  await fixture(async ({ pool, admit, jobs, worker, objects, onPut }) => {
    const bytes = await sharp({ create: { width: 30, height: 20, channels: 3, background: "blue" } }).jpeg().toBuffer();
    const id = await admit([{ bytes, mime: "image/jpeg" }]);
    onPut(async () => { await jobs.cancel(actorId, id); });
    await worker().runOnce(); const job = await jobs.get(actorId, id);
    assert.equal(job.state, "cancelled"); assert.equal(job.pages.length, 0); assert.equal(objects.size, 1);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes")).rows[0].state, "pending");
    assert.deepEqual(await worker().runOnce(), { claimed: 0 });
  });
});

test("invalid image/PDF and oversized PDFs become terminal without infinite retries", { skip }, async () => {
  await fixture(async ({ admit, jobs, worker }) => {
    for (const [bytes, mime, code] of [[Buffer.from("broken"), "image/jpeg", "IMAGE_INVALID"],
      [Buffer.from("broken"), "application/pdf", "PDF_INVALID"], [pdf(501), "application/pdf", "BATCH_TOO_LARGE"]] as const) {
      const id = await admit([{ bytes, mime }]); await worker().runOnce();
      const job = await jobs.get(actorId, id); assert.equal(job.state, "failed"); assert.equal(job.errorCode, code);
      assert.equal(job.pages.length, 0); assert.deepEqual(await worker().runOnce(), { claimed: 0 });
    }
  });
});

test("completion backoff lets other imports proceed and respects an interrupted worker's raw-source lease", { skip }, async () => {
  await fixture(async ({ pool, admit, jobs, worker, pending }) => {
    const bytes = await sharp({ create: { width: 30, height: 20, channels: 3, background: "white" } }).jpeg().toBuffer();
    const first = await admit([{ bytes, mime: "image/jpeg" }]);
    const second = await admit([{ bytes, mime: "image/jpeg" }]);
    await pool.query(`CREATE FUNCTION reject_first() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF new.collection_name='businessCardImportJobs' AND new.record_id='${first}' AND new.payload->'job'->>'state'='completed' THEN RAISE EXCEPTION 'temporarily unavailable'; END IF; RETURN new; END $$;
      CREATE TRIGGER reject_first BEFORE UPDATE ON orbit_records FOR EACH ROW EXECUTE FUNCTION reject_first();`);
    await worker().runOnce(); await worker().runOnce();
    assert.equal((await jobs.get(actorId, first)).state, "ready");
    assert.equal((await jobs.get(actorId, first)).failures, 1);
    await worker().runOnce(); await worker().runOnce();
    assert.equal((await jobs.get(actorId, second)).state, "completed");
    assert.equal(await pending(), true);
    const sourceId = (await jobs.get(actorId, first)).sourceIds[0];
    await pool.query("UPDATE orbit_records SET payload=jsonb_set(payload,'{job,nextAttemptAt}',to_jsonb($1::text)) WHERE record_id=$2 AND collection_name='businessCardImportJobs'", [new Date(Date.now() - 1000).toISOString(), first]);
    await pool.query("UPDATE bc_ingest_raw_uploads SET state='processing',lease_key=$1,lease_expires_at=now()+interval '15 minutes' WHERE id=$2", [randomUUID(), sourceId]);
    assert.equal(await jobs.nextReady(), null); assert.deepEqual(await worker().runOnce(), { claimed: 0 });
    await pool.query("UPDATE bc_ingest_raw_uploads SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [sourceId]);
    await pool.query("DROP TRIGGER reject_first ON orbit_records");
    await worker().runOnce(); assert.equal((await jobs.get(actorId, first)).state, "completed");
  });
});
