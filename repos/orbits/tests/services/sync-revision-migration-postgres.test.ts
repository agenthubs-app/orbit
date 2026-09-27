import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Client, Pool } from "pg";
import { inspectSyncRevision, migrateSyncRevisionOnline, rollbackSyncRevision } from "../../features/sync/sync-revision-migration";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { STRICT_SYNC_REVISION_SQL, SYNC_REVISION_ASSIGN_ONLY_SQL } from "../support/sync-revision-fixture";

// Sprint 0108: the production migration command, run against the three kinds
// of database it must accept (no sync_revision, relaxed trigger, strict
// trigger), twice each, plus both rollbacks and a writer running during the
// backfill. Real Postgres schemas; nothing is mocked.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 120_000 };
const W = "workspace:sync-migration";
const NOW = "2026-09-27T01:00:00.000Z";
const RAW_NOTE = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
  values ($1,$2,$3,'actor:a','manual','seed','{}'::jsonb,$4,$4)`;

type Kind = "absent" | "empty" | "relaxed" | "strict";

async function database(t: TestContext, kind: Kind, rows = 40) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `sync_migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const settings = `-c search_path=${schema} -c statement_timeout=30000`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: settings });
  const session = new Client({ connectionString: databaseUrl, options: settings });
  await session.connect();
  t.after(async () => {
    try { await session.end(); await pool.end(); } finally {
      try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
    }
  });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  if (kind === "relaxed") await pool.query(SYNC_REVISION_ASSIGN_ONLY_SQL);
  if (kind === "strict") await pool.query(STRICT_SYNC_REVISION_SQL);
  const collections = ["notes", "tasks", "personal_schedule_items", "contacts", "events"];
  const store = createPostgresLiveRecordStore({ client: { query: async (text, values) => ({ rows: (await pool.query(text, values ? [...values] : undefined)).rows }) } });
  if (kind !== "empty") {
    for (let n = 0; n < rows; n += 1) {
      const collection = collections[n % collections.length]!;
      // The strict database only accepts locked writes, so seed it through the store.
      if (kind === "strict") await store.upsertRecord(record(collection, `${collection}:${n}`));
      else await pool.query(RAW_NOTE, [W, collection, `${collection}:${n}`, NOW]);
    }
  }
  return { pool, session, store };
}

function record(collectionName: string, recordId: string): LiveRecord<Record<string, unknown>> {
  return { workspaceId: W, collectionName, recordId, userId: "actor:a", sourceType: "manual", sourceId: recordId, evidenceIds: [], lifecycleState: "active", createdAt: NOW, updatedAt: NOW, payload: { id: recordId } };
}

async function revisions(pool: Pool) {
  const rows = (await pool.query<{ total: number; filled: number; distinct: number }>(
    "select count(*)::int as total, count(sync_revision)::int as filled, count(distinct sync_revision)::int as distinct from orbit_records",
  )).rows[0]!;
  return rows;
}

async function assertStrict(h: Awaited<ReturnType<typeof database>>, label: string) {
  const counts = await revisions(h.pool);
  assert.equal(counts.filled, counts.total, `${label}: no null revision`);
  assert.equal(counts.distinct, counts.total, `${label}: no duplicate revision`);
  assert.equal((await inspectSyncRevision(h.session)).state, "strict", `${label}: strict`);
  await h.store.upsertRecord(record("notes", `note:${label}:${randomUUID()}`));
  await assert.rejects(h.pool.query(RAW_NOTE, [W, "notes", `raw:${label}:${randomUUID()}`, NOW]), /SYNC_WRITE_LOCK_REQUIRED/, `${label}: unlocked write refused`);
}

for (const kind of ["absent", "empty", "relaxed", "strict"] as const) {
  test(`migration on a database with ${kind === "absent" ? "no sync_revision" : kind === "empty" ? "an empty orbit_records" : `the ${kind} trigger`} ends strict and is repeatable`, options, async (t) => {
    const h = await database(t, kind);
    const before = await inspectSyncRevision(h.session);
    assert.equal(before.state, kind === "empty" ? "absent" : kind);
    const first = await migrateSyncRevisionOnline(h.session, { batchSize: 7 });
    assert.equal(first.after.state, "strict");
    if (kind === "absent") {
      assert.equal(first.backfilledRows, 40);
      assert.equal(first.batches, 6, "40 rows in batches of 7");
    } else {
      assert.equal(first.backfilledRows, 0);
    }
    await assertStrict(h, `${kind}-first`);
    const second = await migrateSyncRevisionOnline(h.session, { batchSize: 7 });
    assert.equal(second.backfilledRows, 0, "a rerun backfills nothing");
    assert.ok(!second.steps.some((step) => step.step === "column" || step.step === "trigger"), "a rerun takes no column or trigger lock");
    await assertStrict(h, `${kind}-second`);
  });
}

test("rollback 'relax' lets unlocked writes through with revisions; migrating again restores strict", options, async (t) => {
  const h = await database(t, "absent");
  await migrateSyncRevisionOnline(h.session, { batchSize: 50 });
  const relaxed = await rollbackSyncRevision(h.session, "relax");
  assert.equal(relaxed.state, "relaxed");
  await h.pool.query(RAW_NOTE, [W, "notes", "raw:relaxed", NOW]);
  const row = (await h.pool.query("select sync_revision from orbit_records where record_id = 'raw:relaxed'")).rows[0];
  assert.ok(row.sync_revision !== null, "relaxed writes still get a revision");
  await migrateSyncRevisionOnline(h.session, { batchSize: 50 });
  await assertStrict(h, "after-relax");
});

test("rollback 'disable' drops the trigger and NOT NULL; migrating again backfills the gap", options, async (t) => {
  const h = await database(t, "absent");
  await migrateSyncRevisionOnline(h.session, { batchSize: 50 });
  const disabled = await rollbackSyncRevision(h.session, "disable");
  assert.equal(disabled.state, "disabled");
  await h.pool.query(RAW_NOTE, [W, "notes", "raw:disabled", NOW]);
  assert.equal((await h.pool.query("select sync_revision from orbit_records where record_id = 'raw:disabled'")).rows[0].sync_revision, null);
  const again = await migrateSyncRevisionOnline(h.session, { batchSize: 50 });
  assert.equal(again.backfilledRows, 1);
  await assertStrict(h, "after-disable");
});

test("a database that has the sync_revision column but lost its sequence migrates to strict", options, async (t) => {
  // Seen when copying orbit_records alone: the column and its values come
  // along, the free-standing sequence does not. The migration must not assume
  // "column present" implies "sequence present".
  const h = await database(t, "absent");
  await migrateSyncRevisionOnline(h.session, { batchSize: 50 });
  await rollbackSyncRevision(h.session, "disable");
  await h.pool.query("drop sequence orbit_records_sync_revision_seq cascade");
  await migrateSyncRevisionOnline(h.session, { batchSize: 50 });
  await assertStrict(h, "after-lost-sequence");
});

test("product writes running during the batched backfill all succeed and keep unique revisions", options, async (t) => {
  const h = await database(t, "absent", 3000);
  let stop = false;
  let written = 0;
  const writer = (async () => {
    // Before the trigger exists these writes have no revision; the backfill must catch them.
    while (!stop) {
      await h.store.upsertRecord(record(written % 2 ? "notes" : "tasks", `live:${written}`));
      written += 1;
    }
  })();
  const report = await migrateSyncRevisionOnline(h.session, { batchSize: 100 });
  stop = true;
  await writer;
  assert.ok(written > 0, "the writer ran during the migration");
  assert.ok(report.batches >= 30);
  await assertStrict(h, "concurrent");
});

test("stored revisions ahead of the sequence (a restored table) are skipped forward, never reused", options, async (t) => {
  const h = await database(t, "relaxed");
  await h.pool.query("select setval('orbit_records_sync_revision_seq', 3)");
  await migrateSyncRevisionOnline(h.session, { batchSize: 10 });
  for (let n = 0; n < 5; n += 1) await h.store.upsertRecord(record("notes", `after-restore:${n}`));
  await assertStrict(h, "restored");
});

test("the relaxed body installed on orbit_events in 0069 (with a comment naming the error) is recognised as relaxed", options, async (t) => {
  const h = await database(t, "relaxed");
  await h.pool.query(`create or replace function orbit_records_assign_sync_revision() returns trigger language plpgsql as $$
begin
  -- 0069 本机开发库专用：不强制 SYNC_WRITE_LOCK_REQUIRED，只分配 revision。
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$`);
  assert.equal((await inspectSyncRevision(h.session)).state, "relaxed");
  await migrateSyncRevisionOnline(h.session, { batchSize: 10 });
  await assertStrict(h, "orbit-events-shape");
});
