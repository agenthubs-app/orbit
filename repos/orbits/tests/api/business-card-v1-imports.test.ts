import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createV1ImportHandlers } from "../../app/api/contact-drafts/business-card/imports/handlers";
import { createV1PreparationRepository } from "../../features/acquisition/business-card-v1-preparation/repository";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { createCardUploadSourceReader } from "../../features/acquisition/storage/business-card-upload-source-reader";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const actor: AuthenticatedApiActor = { id: "owner", workspaceId: "imports" };
const context = (id: string = randomUUID()) => ({ params: Promise.resolve({ id }) });
function request(body?: unknown, origin = "https://orbit.test") {
  return new Request("https://orbit.test/api/contact-drafts/business-card/imports", body === undefined ? {} : {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

test("import endpoints authenticate before storage and enforce mutation origins", async () => {
  const handlers = createV1ImportHandlers({ resolveActor: async () => null, configured: async () => { assert.fail("storage must not run"); } });
  assert.equal((await handlers.list(request())).status, 401);
  assert.equal((await handlers.get(request(), context())).status, 401);
  assert.equal((await handlers.create(request({}))).status, 401);
  assert.equal((await handlers.cancel(request({}), context())).status, 401);
  assert.equal((await handlers.verifySource(request({}))).status, 401);
  assert.equal((await handlers.create(request({}, "https://foreign.test"))).status, 403);
  assert.equal((await handlers.cancel(request({}, "https://foreign.test"), context())).status, 403);
  assert.equal((await handlers.verifySource(request({}, "https://foreign.test"))).status, 403);
});

test("import metadata rejects excess fields, duplicates, oversized bodies and 501 sources before storage", async () => {
  const handlers = createV1ImportHandlers({ resolveActor: async () => actor, configured: async () => { assert.fail("storage must not run"); } });
  const id = randomUUID();
  for (const body of [{ requestKey: id, sourceIds: [], actorId: "foreign" }, { requestKey: id, sourceIds: [id, id] },
    { requestKey: id, sourceIds: Array.from({ length: 501 }, () => randomUUID()) },
    { requestKey: id, sourceIds: ["https://foreign.test/image"] }, { file: "a".repeat(33 * 1024) }]) {
    assert.equal((await handlers.create(request(body))).status, 400);
  }
  assert.equal((await handlers.cancel(request({ actorId: "foreign" }), context())).status, 400);
  assert.equal((await handlers.verifySource(request({ sourceId: id, path: "https://foreign.test" }))).status, 400);
  assert.equal((await handlers.get(request(), context("../foreign"))).status, 404);
  assert.equal((await handlers.list(new Request("https://orbit.test/api/contact-drafts/business-card/imports?actorId=foreign"))).status, 400);
});

test("upload verification reads only an owned V1 source, verifies actual bytes and releases its lease on every outcome", {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const schema = `v1_verify_http_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = await pool.connect(); try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    const repository = createCardUploadSourceRepository({ pool, workspaceId: "imports", wake: async () => {} });
    const bytes = Buffer.alloc(6 * 1024 * 1024, 1);
    const source = await repository.reserve({ actorId: actor.id, requestKey: randomUUID(), pipeline: "v1", fileName: "large.jpg",
      mimeType: "image/jpeg", byteSize: bytes.length, digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}` });
    let received: Buffer | null = null, reads = 0, signedIn = actor;
    const read = createCardUploadSourceReader({ workspaceId: "imports", transport: { async open(path) {
      reads++; assert.equal(path, source.objectKey);
      return received ? new ReadableStream({ start(c) { c.enqueue(received!); c.close(); } }) : null;
    } } });
    const handlers = createV1ImportHandlers({ resolveActor: async () => signedIn,
      sourcesConfigured: async () => ({ repository, read, reap: async () => ({ deleted: 0, failed: 0 }) }) });
    const verify = () => handlers.verifySource(request({ sourceId: source.id }));
    assert.equal((await verify()).status, 404);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads")).rows[0].state, "reserved");
    received = bytes;
    const success = await verify(); assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { data: { sourceId: source.id, verified: true } });
    received = Buffer.alloc(bytes.length, 2); assert.equal((await verify()).status, 503);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads")).rows[0].state, "reserved");
    signedIn = { ...actor, id: "foreign" }; assert.equal((await verify()).status, 404); assert.equal(reads, 3);
    signedIn = actor;
    await pool.query("UPDATE bc_ingest_raw_uploads SET expires_at=now()-interval '1 second'");
    assert.equal((await verify()).status, 410); assert.equal(reads, 3);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});

test("metadata overflow cancels the stream and infrastructure errors are sanitized", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(33 * 1024)); }, cancel() { cancelled = true; } });
  const handlers = createV1ImportHandlers({ resolveActor: async () => actor,
    configured: async () => { throw new Error("synthetic-private-database-url"); } });
  const streamRequest = new Request("https://orbit.test/api/contact-drafts/business-card/imports", {
    method: "POST", headers: { origin: "https://orbit.test", "content-type": "application/json" }, body, duplex: "half",
  } as RequestInit);
  assert.equal((await handlers.create(streamRequest)).status, 400); assert.equal(cancelled, true);
  const response = await handlers.list(request()); assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await response.text(), /synthetic-private/);
});

test("HTTP admission supports 500 sources, survives a failed wake, scopes progress and cancels durably", {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
}, async () => {
  const schema = `v1_import_http_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = await pool.connect(); try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    let failWake = false;
    const jobs = createV1PreparationRepository({ pool, workspaceId: "imports", wake: async () => { if (failWake) throw new Error("synthetic-private-queue"); } });
    const sources = createCardUploadSourceRepository({ pool, workspaceId: "imports", wake: async () => {} });
    let signedIn = actor;
    const handlers = createV1ImportHandlers({ resolveActor: async () => signedIn, configured: async () => ({ jobs }) });
    const sourceIds: string[] = [];
    for (let i = 0; i < 500; i++) sourceIds.push((await sources.reserve({ actorId: actor.id, requestKey: randomUUID(), pipeline: "v1",
      fileName: `card-${i}.jpg`, mimeType: "image/jpeg", byteSize: 100, digest: `sha256:${"a".repeat(64)}` })).id);
    const input = { requestKey: randomUUID(), sourceIds };
    assert.ok(JSON.stringify(input).length > 16 * 1024);
    failWake = true;
    const uncertain = await handlers.create(request(input)); assert.equal(uncertain.status, 503);
    assert.doesNotMatch(await uncertain.text(), /synthetic-private/);
    failWake = false;
    const admitted = await handlers.create(request(input)); assert.equal(admitted.status, 202);
    const job = (await admitted.json()).data.job;
    assert.equal(job.sourceCount, 500); assert.equal(job.preparedPages, 0); assert.equal(job.state, "pending");
    assert.equal((await jobs.list(actor.id)).length, 1);
    assert.equal((await (await handlers.create(request(input))).json()).data.job.id, job.id);
    assert.equal((await handlers.create(request({ ...input, sourceIds: [...sourceIds].reverse() }))).status, 409);
    const lease = (await jobs.claim())!; assert.equal(lease.id, job.id);
    const detail = await handlers.get(request(), context(job.id)); assert.equal(detail.status, 200);
    const serialized = await detail.text();
    assert.doesNotMatch(serialized, /leaseKey|leaseExpiresAt|sourceIds|imagePath|objectKey|pages":|sha256/);
    assert.ok(serialized.length < 1024); assert.equal(detail.headers.get("cache-control"), "no-store");
    signedIn = { ...actor, id: "foreign" };
    assert.equal((await handlers.get(request(), context(job.id))).status, 404);
    assert.equal((await handlers.cancel(request({}), context(job.id))).status, 404);
    assert.equal((await handlers.create(request({ requestKey: randomUUID(), sourceIds: [sourceIds[0]] }))).status, 404);
    assert.deepEqual((await (await handlers.list(request())).json()).data.jobs, []);
    signedIn = actor;
    failWake = true; assert.equal((await handlers.cancel(request({}), context(job.id))).status, 503);
    assert.equal((await jobs.get(actor.id, job.id)).state, "cancelled");
    failWake = false;
    const cancelled = await handlers.cancel(request({}), context(job.id)); assert.equal(cancelled.status, 200);
    assert.equal((await cancelled.json()).data.job.state, "cancelled");
    await assert.rejects(jobs.release(job.id, lease.leaseKey!), /lease/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM bc_ingest_raw_uploads WHERE state='reserved' AND expires_at <= now()")).rows[0].count, 500);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
});
