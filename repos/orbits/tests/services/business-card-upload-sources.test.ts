import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createCardUploadSourceRepository } from "../../features/acquisition/storage/business-card-upload-sources";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured";
const actorId = "actor:source", workspaceId = "workspace:source";
const input = () => ({ actorId, requestKey: randomUUID(), pipeline: "v1" as const, fileName: "synthetic.jpg",
  mimeType: "image/jpeg", byteSize: 6 * 1024 * 1024, digest: `sha256:${"a".repeat(64)}` });

async function fixture(run: (f: { pool: Pool; first: ReturnType<typeof createCardUploadSourceRepository>;
  second: ReturnType<typeof createCardUploadSourceRepository>; foreign: ReturnType<typeof createCardUploadSourceRepository>;
  failWake(value: boolean): void; wakes: number[];
}) => Promise<void>) {
  const schema = `raw_sources_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pools = [0, 1].map(() => new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` }));
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = await pools[0].connect();
    try { await runBusinessCardIngestV2Migrations(client); await runBusinessCardIngestV2Migrations(client); } finally { client.release(); }
    await pools[0].query("CREATE TABLE target_receipts (id text primary key)");
    let fail = false; const wakes: number[] = [];
    const wake = async (_pipeline: "v1" | "v2", delay: number) => { wakes.push(delay); if (fail) throw new Error("wake unavailable"); };
    const first = createCardUploadSourceRepository({ pool: pools[0], workspaceId, wake });
    const second = createCardUploadSourceRepository({ pool: pools[1], workspaceId, wake });
    const foreign = createCardUploadSourceRepository({ pool: pools[1], workspaceId: "foreign", wake });
    await run({ pool: pools[0], first, second, foreign, failWake: (value) => { fail = value; }, wakes });
  } finally { await Promise.all(pools.map((pool) => pool.end())); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

test("source reservations persist before authorization, preserve product sizes and bind every grant to its owner/path", { skip }, async () => {
  await fixture(async ({ first, foreign, pool, failWake, wakes }) => {
    const request = input(); failWake(true); await assert.rejects(first.reserve(request), /wake unavailable/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM bc_ingest_raw_uploads")).rows[0].count, 1);
    failWake(false); const source = await first.reserve(request);
    assert.equal((await first.reserve(request)).id, source.id);
    const grant = await first.authorize(actorId, source.id, source.objectKey);
    assert.equal(grant.maximumSizeInBytes, request.byteSize); assert.equal(grant.allowOverwrite, false);
    assert.equal(grant.validUntil, Date.parse(source.uploadExpiresAt)); assert.ok(wakes.every((delay) => delay > 86400 && delay <= 86461));
    await assert.rejects(first.authorize("foreign", source.id, source.objectKey), /unavailable/);
    await assert.rejects(foreign.authorize(actorId, source.id, source.objectKey), /unavailable/);
    await assert.rejects(first.authorize(actorId, source.id, `${source.objectKey}/other`), /unavailable/);
    await assert.rejects(first.reserve({ ...request, byteSize: request.byteSize + 1 }), /conflicts/);
    const pdf = await first.reserve({ ...input(), mimeType: "application/pdf", fileName: "synthetic.pdf", byteSize: 50 * 1024 * 1024 });
    assert.equal(pdf.byteSize, 50 * 1024 * 1024);
    await assert.rejects(first.reserve({ ...input(), byteSize: 10 * 1024 * 1024 + 1 }), /metadata/);
    await assert.rejects(first.reserve({ ...input(), pipeline: "v2", mimeType: "application/pdf" }), /metadata/);
    await pool.query("UPDATE bc_ingest_raw_uploads SET upload_expires_at=now()-interval '1 second' WHERE id=$1", [source.id]);
    await assert.rejects(first.authorize(actorId, source.id, source.objectKey), /unavailable/);
  });
});

test("claiming is exclusive across connections and stale leases cannot commit target writes", { skip }, async () => {
  await fixture(async ({ first, second, pool }) => {
    const source = await first.reserve(input());
    const claims = await Promise.allSettled([first.claim(actorId, [source.id]), second.claim(actorId, [source.id])]);
    assert.equal(claims.filter((r) => r.status === "fulfilled").length, 1);
    const winner = claims.find((r) => r.status === "fulfilled")!; assert.equal(winner.status, "fulfilled");
    assert.equal(winner.value.state, "claimed"); if (winner.value.state !== "claimed") throw new Error("expected lease");
    const oldKey = winner.value.leaseKey;
    await pool.query("UPDATE bc_ingest_raw_uploads SET lease_expires_at=now()-interval '1 second' WHERE id=$1", [source.id]);
    const replacement = await second.claim(actorId, [source.id]); assert.equal(replacement.state, "claimed");
    await assert.rejects(first.consume({ actorId, ids: [source.id], leaseKey: oldKey, writeTarget: async () => assert.fail("stale target write") }), /lease/);
    await first.release(actorId, [source.id], oldKey);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [source.id])).rows[0].state, "processing");
  });
});

test("target and consumption receipt roll back together, survive wake failure, and remain idempotent after deletion", { skip }, async () => {
  await fixture(async ({ first, pool, failWake }) => {
    const source = await first.reserve(input()); const claim = await first.claim(actorId, [source.id]);
    assert.equal(claim.state, "claimed"); if (claim.state !== "claimed") throw new Error("expected lease");
    await assert.rejects(first.consume({ actorId, ids: [source.id], leaseKey: claim.leaseKey, async writeTarget(client) {
      await client.query("INSERT INTO target_receipts VALUES ('target:qa')"); throw new Error("rollback target");
    } }), /rollback target/);
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM target_receipts")).rows[0].count, 0);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [source.id])).rows[0].state, "processing");
    failWake(true);
    await assert.rejects(first.consume({ actorId, ids: [source.id], leaseKey: claim.leaseKey, async writeTarget(client) {
      await client.query("INSERT INTO target_receipts VALUES ('target:qa')"); return "target:qa";
    } }), /wake unavailable/);
    failWake(false);
    assert.equal(await first.consume({ actorId, ids: [source.id], leaseKey: claim.leaseKey, writeTarget: async () => assert.fail("duplicate write") }), "target:qa");
    await pool.query("UPDATE bc_ingest_raw_uploads SET upload_expires_at=now()-interval '2 minutes',next_attempt_at=now()-interval '1 second'");
    assert.deepEqual(await first.reap("v1", async () => {}), { deleted: 1, failed: 0 });
    assert.deepEqual(await first.claim(actorId, [source.id]), { state: "consumed", targetRef: "target:qa" });
    assert.equal((await pool.query("SELECT count(*)::int AS count FROM target_receipts")).rows[0].count, 1);
  });
});

test("cleanup waits for upload permits to expire and durably fences deletion across interruptions", { skip }, async () => {
  await fixture(async ({ first, pool }) => {
    const source = await first.reserve(input());
    await pool.query("UPDATE bc_ingest_raw_uploads SET expires_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second'");
    assert.deepEqual(await first.reap("v1", async () => assert.fail("permit remains valid")), { deleted: 0, failed: 0 });
    await pool.query("UPDATE bc_ingest_raw_uploads SET upload_expires_at=now()-interval '2 minutes'");
    let physicalDeletes = 0;
    assert.deepEqual(await first.reap("v1", async (key) => { assert.equal(key, source.objectKey); physicalDeletes++; throw new Error("interrupted"); }), { deleted: 0, failed: 1 });
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads")).rows[0].state, "deleting");
    await assert.rejects(first.claim(actorId, [source.id]), /not available/);
    await assert.rejects(first.authorize(actorId, source.id, source.objectKey), /unavailable/);
    await pool.query("UPDATE bc_ingest_raw_uploads SET next_attempt_at=now()-interval '1 second'");
    assert.deepEqual(await first.reap("v1", async () => { physicalDeletes++; }), { deleted: 1, failed: 0 });
    assert.equal(physicalDeletes, 2);
  });
});

test("foreign ownership and mixed source lists cannot partially consume or clean another pipeline", { skip }, async () => {
  await fixture(async ({ first, foreign, pool }) => {
    const a = await first.reserve(input()), b = await first.reserve({ ...input(), pipeline: "v2" });
    await assert.rejects(first.claim("foreign", [a.id]), /not found/);
    await assert.rejects(foreign.claim(actorId, [a.id]), /not found/);
    await assert.rejects(first.claim(actorId, [a.id, a.id]), /Invalid/);
    await assert.rejects(first.claim(actorId, [a.id, b.id]), /mixed/);
    assert.ok((await pool.query("SELECT state FROM bc_ingest_raw_uploads")).rows.every((row) => row.state === "reserved"));
    await pool.query("UPDATE bc_ingest_raw_uploads SET upload_expires_at=now()-interval '2 minutes',expires_at=now()-interval '1 second',next_attempt_at=now()-interval '1 second'");
    const removed: string[] = []; await first.reap("v1", async (key) => { removed.push(key); });
    assert.deepEqual(removed, [a.objectKey]);
    assert.equal((await pool.query("SELECT state FROM bc_ingest_raw_uploads WHERE id=$1", [b.id])).rows[0].state, "reserved");
  });
});
