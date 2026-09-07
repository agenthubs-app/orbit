import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { registerCardImageWrite } from "../../features/acquisition/business-card-ingest-v2/image-write-journal";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { createV1PreparationRepository, V1_PREPARATION_JOBS, type V1PreparationJob } from "../../features/acquisition/business-card-v1-preparation/repository";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const workspaceId = "preparation", actorId = "owner";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture(run: (f: {
  pool: Pool; first: ReturnType<typeof createV1PreparationRepository>; second: ReturnType<typeof createV1PreparationRepository>;
  foreign: ReturnType<typeof createV1PreparationRepository>; sources: ReturnType<typeof createCardUploadSourceRepository>;
  reserve(pdf?: boolean): Promise<string>; checkpoint(job: V1PreparationJob, sourceId: string, page: number, pageCount: number): Promise<Parameters<ReturnType<typeof createV1PreparationRepository>["checkpoint"]>[0]>;
  failWake(value: boolean): void;
}) => Promise<void>) {
  const schema = `v1_prepare_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pools = [0, 1].map(() => new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` }));
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); await pools[0].query(ORBIT_RECORDS_SCHEMA_SQL);
    const client = await pools[0].connect(); try { await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    await pools[0].query("CREATE TABLE target_receipts (id text primary key)");
    let fail = false;
    const wake = async () => { if (fail) throw new Error("wake unavailable"); };
    const first = createV1PreparationRepository({ pool: pools[0], workspaceId, wake });
    const second = createV1PreparationRepository({ pool: pools[1], workspaceId, wake });
    const foreign = createV1PreparationRepository({ pool: pools[1], workspaceId: "other", wake });
    const sources = createCardUploadSourceRepository({ pool: pools[0], workspaceId, wake: async () => {} });
    await run({ pool: pools[0], first, second, foreign, sources, failWake: (value) => { fail = value; },
      async reserve(pdf = false) { return (await sources.reserve({ actorId, requestKey: randomUUID(), pipeline: "v1",
        fileName: pdf ? "cards.pdf" : "card.jpg", mimeType: pdf ? "application/pdf" : "image/jpeg", byteSize: 1234, digest: `sha256:${"a".repeat(64)}` })).id; },
      async checkpoint(job, sourceId, page, pageCount) {
        const itemId = randomUUID(), imagePath = `orbit-card-images/${hash(workspaceId)}/v1/${hash(job.id)}/${hash(itemId)}.jpg`;
        await registerCardImageWrite({ pool: pools[0], workspaceId, pipeline: "v1", objectKey: imagePath, wake: async () => {} });
        const source = (await pools[0].query("SELECT mime_type,digest FROM bc_ingest_raw_uploads WHERE id=$1", [sourceId])).rows[0];
        return { jobId: job.id, leaseKey: job.leaseKey!, sourceId, page, pageCount, itemId, imagePath, imageDigest: source.mime_type === "application/pdf" ? `sha256:${"b".repeat(64)}` : source.digest };
      },
    });
  } finally { await Promise.all(pools.map((pool) => pool.end())); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

test("V1 preparation admission is durable and deduplicates request keys and source ownership across connections", { skip }, async () => {
  await fixture(async ({ first, second, foreign, reserve, failWake }) => {
    const a = await reserve(true), b = await reserve(); const request = { actorId, requestKey: randomUUID(), sourceIds: [a, b] };
    failWake(true); await assert.rejects(first.admit(request), /wake unavailable/); failWake(false);
    const [one, two] = await Promise.all([first.admit(request), second.admit(request)]); assert.equal(one.id, two.id);
    const alias = randomUUID(); assert.equal((await second.admit({ ...request, requestKey: alias })).id, one.id);
    await assert.rejects(first.admit({ ...request, requestKey: alias, sourceIds: [b, a] }), /conflicts/);
    await assert.rejects(first.admit({ ...request, requestKey: randomUUID(), sourceIds: [a] }), /conflicts/);
    await assert.rejects(first.admit({ ...request, actorId: "other" }), /not found/);
    await assert.rejects(foreign.admit(request), /not found/);
    assert.equal((await first.list(actorId)).length, 1); assert.deepEqual(await first.list("other"), []);
    await assert.rejects(first.get("other", one.id), /not found/);
  });
});

test("lease takeover resumes the committed page and rejects stale workers", { skip }, async () => {
  await fixture(async ({ pool, first, second, reserve, checkpoint }) => {
    const sourceId = await reserve(true), job = await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [sourceId] });
    const claims = await Promise.all([first.claim(), second.claim()]); const lease = claims.find(Boolean)!;
    assert.equal(claims.filter(Boolean).length, 1);
    const saved = await first.checkpoint(await checkpoint(lease, sourceId, 1, 2)); assert.equal(saved.nextPage, 2);
    await pool.query("UPDATE orbit_records SET payload=jsonb_set(payload,'{job,leaseExpiresAt}',to_jsonb($3::text)) WHERE collection_name=$1 AND record_id=$2", [V1_PREPARATION_JOBS, job.id, new Date(Date.now() - 1000).toISOString()]);
    const takeover = (await second.claim())!; assert.equal(takeover.nextPage, 2); assert.notEqual(takeover.leaseKey, lease.leaseKey);
    await assert.rejects(first.checkpoint(await checkpoint(lease, sourceId, 2, 2)), /lease/);
    await assert.rejects(first.release(job.id, lease.leaseKey!), /lease/);
    const ready = await second.checkpoint(await checkpoint(takeover, sourceId, 2, 2));
    assert.equal(ready.state, "ready"); assert.equal(ready.pages.length, 2); assert.equal(ready.leaseKey, null);
    assert.equal((await second.nextReady())?.id, job.id);
  });
});

test("page indexes and progress commit together; invalid scope and oversized PDFs cannot advance the job", { skip }, async () => {
  await fixture(async ({ pool, first, reserve, checkpoint }) => {
    const sourceId = await reserve(true); await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [sourceId] });
    const lease = (await first.claim())!, input = await checkpoint(lease, sourceId, 1, 2);
    await assert.rejects(first.checkpoint({ ...input, pageCount: 501 }), /checkpoint/);
    await assert.rejects(first.checkpoint({ ...input, imagePath: input.imagePath.replace(hash(workspaceId), hash("other")) }), /scope/);
    await pool.query(`CREATE FUNCTION reject_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF new.collection_name='${V1_PREPARATION_JOBS}' AND new.payload->'job'->>'nextPage'='2' THEN RAISE EXCEPTION 'progress interrupted'; END IF; RETURN new; END $$;
      CREATE TRIGGER reject_progress BEFORE UPDATE ON orbit_records FOR EACH ROW EXECUTE FUNCTION reject_progress();`);
    await assert.rejects(first.checkpoint(input));
    const unchanged = await first.get(actorId, lease.id); assert.equal(unchanged.nextPage, 1); assert.equal(unchanged.pages.length, 0);
    await pool.query("DROP TRIGGER reject_progress ON orbit_records");
    const updated = await first.checkpoint(input); assert.equal(updated.nextPage, 2); assert.equal(updated.pages.length, 1);
    await assert.rejects(first.checkpoint(input), /checkpoint/);
    await assert.rejects(first.checkpoint({ ...input, page: 2 }), /checkpoint/);
    assert.equal((await first.get(actorId, lease.id)).pages.length, 1);
  });
});

test("cancel fences late page commits and expires originals without discarding their deletion records", { skip }, async () => {
  await fixture(async ({ pool, first, second, reserve, checkpoint }) => {
    const sourceId = await reserve(true), job = await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [sourceId] });
    const lease = (await first.claim())!, latePage = await checkpoint(lease, sourceId, 1, 2);
    await assert.rejects(second.cancel("other", job.id), /not found/);
    assert.equal((await second.cancel(actorId, job.id)).state, "cancelled");
    await assert.rejects(first.checkpoint(latePage), /lease/);
    assert.equal(await first.claim(), null);
    const raw = (await pool.query("SELECT state,expires_at<=now() AS expired FROM bc_ingest_raw_uploads WHERE id=$1", [sourceId])).rows[0];
    assert.deepEqual(raw, { state: "reserved", expired: true });
    assert.equal((await pool.query("SELECT state FROM bc_ingest_image_writes WHERE object_key=$1", [latePage.imagePath])).rows[0].state, "pending");
  });
});

test("target creation, job completion and source consumption share one outer transaction", { skip }, async () => {
  await fixture(async ({ pool, first, sources, reserve, checkpoint }) => {
    const sourceId = await reserve(), job = await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [sourceId] });
    const lease = (await first.claim())!; await first.checkpoint(await checkpoint(lease, sourceId, 1, 1));
    const sourceLease = await sources.claim(actorId, [sourceId]); if (sourceLease.state !== "claimed") assert.fail("source lease missing");
    await pool.query(`CREATE FUNCTION reject_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF new.collection_name='${V1_PREPARATION_JOBS}' AND new.payload->'job'->>'state'='completed' THEN RAISE EXCEPTION 'completion interrupted'; END IF; RETURN new; END $$;
      CREATE TRIGGER reject_completion BEFORE UPDATE ON orbit_records FOR EACH ROW EXECUTE FUNCTION reject_completion();`);
    const finish = () => sources.consume({ actorId, ids: [sourceId], leaseKey: sourceLease.leaseKey, writeTarget: (client) => first.complete({
      client, actorId, jobId: job.id, sourceIds: [sourceId], async writeTarget(connection, prepared) {
        assert.equal(prepared.pages.length, 1); await connection.query("INSERT INTO target_receipts(id) VALUES($1)", [prepared.id]); return prepared.id;
      },
    }) });
    await assert.rejects(finish());
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM target_receipts")).rows[0].count, 0);
    assert.equal((await first.get(actorId, job.id)).state, "ready");
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [sourceId])).rows[0].state, "processing");
    await pool.query("DROP TRIGGER reject_completion ON orbit_records");
    assert.equal(await finish(), job.id); assert.equal(await finish(), job.id);
    assert.equal((await first.get(actorId, job.id)).state, "completed");
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM target_receipts")).rows[0].count, 1);
    await assert.rejects(first.cancel(actorId, job.id), /already created/);
  });
});

test("expired jobs become terminal and do not consume another processing lease", { skip }, async () => {
  await fixture(async ({ pool, first, reserve }) => {
    const sourceId = await reserve(), job = await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [sourceId] });
    await pool.query("UPDATE orbit_records SET payload=jsonb_set(payload,'{job,expiresAt}',to_jsonb($3::text)) WHERE collection_name=$1 AND record_id=$2", [V1_PREPARATION_JOBS, job.id, new Date(Date.now() - 1000).toISOString()]);
    assert.equal(await first.claim(), null); assert.equal(await first.expire(), 1);
    const expired = await first.get(actorId, job.id); assert.equal(expired.state, "failed"); assert.equal(expired.errorCode, "SOURCE_EXPIRED");
    assert.equal(await first.expire(), 0);
  });
});

test("mixed PDF and image sources retain ordering and bounded preparation retries", { skip }, async () => {
  await fixture(async ({ pool, first, reserve, checkpoint }) => {
    const pdf = await reserve(true), image = await reserve();
    const job = await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [pdf, image] });
    let lease = (await first.claim())!;
    await first.fail(job.id, lease.leaseKey!, "SOURCE_UNAVAILABLE", true);
    assert.equal(await first.claim(), null, "backoff must not spin");
    await pool.query("UPDATE orbit_records SET payload=jsonb_set(payload,'{job,nextAttemptAt}',to_jsonb($3::text)) WHERE collection_name=$1 AND record_id=$2", [V1_PREPARATION_JOBS, job.id, new Date(Date.now() - 1000).toISOString()]);
    lease = (await first.claim())!;
    const firstPage = await first.checkpoint(await checkpoint(lease, pdf, 1, 2)); assert.equal(firstPage.failures, 0);
    const secondPage = await first.checkpoint(await checkpoint(lease, pdf, 2, 2)); assert.equal(secondPage.nextSource, 1); assert.equal(secondPage.nextPage, 1);
    await first.release(job.id, lease.leaseKey!); lease = (await first.claim())!;
    const ready = await first.checkpoint(await checkpoint(lease, image, 1, 1)); assert.equal(ready.state, "ready");
    assert.deepEqual(ready.pages.map((page) => [page.seq, page.sourcePage, page.sourceFileName]), [[1, 1, "cards.pdf"], [2, 2, "cards.pdf"], [3, null, "card.jpg"]]);
    const brokenSource = await reserve(); const broken = await first.admit({ actorId, requestKey: randomUUID(), sourceIds: [brokenSource] });
    for (let attempt = 1; attempt <= 5; attempt++) {
      const claim = (await first.claim())!; assert.equal(claim.id, broken.id);
      const failed = await first.fail(broken.id, claim.leaseKey!, "SOURCE_UNAVAILABLE", true);
      assert.equal(failed.state, attempt === 5 ? "failed" : "pending");
      await pool.query("UPDATE orbit_records SET payload=jsonb_set(payload,'{job,nextAttemptAt}',to_jsonb($3::text)) WHERE collection_name=$1 AND record_id=$2", [V1_PREPARATION_JOBS, broken.id, new Date(Date.now() - 1000).toISOString()]);
    }
    assert.equal(await first.claim(), null);
  });
});
