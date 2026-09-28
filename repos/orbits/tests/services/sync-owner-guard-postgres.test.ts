import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL, testRawWrite } from "../support/sync-revision-fixture";

// Sprint 0113, SC-03 (runtime layer): the owner/identity guard trigger stops a
// write that moves an owned row of a sync domain to another owner or out of its
// collection, whoever sends it — product code, a batch script's raw SQL, or a
// store call — unless a registered handler (none today) marks the transaction.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:owner-guard";
const T0 = "2026-09-28T01:00:00.000Z";

async function database(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `owner_guard_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  for (const [collection, id, owner] of [["notes", "n1", "actor:a"], ["tasks", "t1", "actor:a"], ["personal_schedule_occurrence_exceptions", "x1", "actor:a"], ["contacts", "c1", "actor:a"], ["notes", "n-unowned", null]] as const) {
    await store.upsertRecord({ workspaceId: W, collectionName: collection, recordId: id, userId: owner, sourceType: "manual", sourceId: id, evidenceIds: [], lifecycleState: "active", createdAt: T0, updatedAt: T0, payload: { id } });
  }
  return { pool, client };
}

async function ownerOf(pool: Pool, collection: string, id: string): Promise<string | null> {
  return (await pool.query<{ user_id: string | null }>("select user_id from orbit_records where collection_name = $1 and record_id = $2", [collection, id])).rows[0]?.user_id ?? null;
}

const refused = (error: unknown) => (error as { code?: string; message?: string }).code === "55000" && /SYNC_OWNER_CHANGE_UNREGISTERED/.test(String((error as Error).message));

test("a batch script's raw SQL cannot move a note or task to another owner, clear its owner, or move it out of its collection", options, async (t) => {
  const { pool, client } = await database(t);
  // Raw SQL, locked like any writer, exactly as a maintenance script would send it.
  await assert.rejects(() => testRawWrite(client, "notes", "update orbit_records set user_id = 'actor:b' where collection_name = 'notes' and record_id = 'n1'"), refused);
  await assert.rejects(() => testRawWrite(client, "tasks", "update orbit_records set user_id = null where collection_name = 'tasks' and record_id = 't1'"), refused);
  await assert.rejects(() => testRawWrite(client, "notes", "update orbit_records set collection_name = 'archived_notes' where collection_name = 'notes' and record_id = 'n1'"), refused);
  await assert.rejects(() => pool.query("update orbit_records set user_id = 'actor:b' where collection_name = 'personal_schedule_occurrence_exceptions' and record_id = 'x1'"), refused, "attachment collections are guarded too");
  assert.equal(await ownerOf(pool, "notes", "n1"), "actor:a");
  assert.equal(await ownerOf(pool, "tasks", "t1"), "actor:a");
  assert.equal(await ownerOf(pool, "personal_schedule_occurrence_exceptions", "x1"), "actor:a");
});

test("a made-up handler name does not open the guard", options, async (t) => {
  const { pool, client } = await database(t);
  await assert.rejects(() => client.transaction(async (tx) => {
    await tx.query("select set_config('orbit.sync_owner_change_handler', 'contact-handover', true)");
    await tx.query("with sync_write_lock as materialized (select set_config('orbit.sync_write_lock_key', (hashtextextended('orbit:sync:commit-order:v1:' || coalesce(to_regclass('orbit_records')::oid::text, ''), 0))::text, true) as k, pg_advisory_xact_lock(hashtextextended('orbit:sync:commit-order:v1:' || coalesce(to_regclass('orbit_records')::oid::text, ''), 0))) update orbit_records set user_id = 'actor:b' from sync_write_lock where collection_name = 'notes' and record_id = 'n1'");
  }), refused);
  assert.equal(await ownerOf(pool, "notes", "n1"), "actor:a");
});

test("a first owner on an unowned row, payload writes, and owner changes outside sync domains still pass", options, async (t) => {
  const { pool, client } = await database(t);
  await testRawWrite(client, "notes", "update orbit_records set user_id = 'actor:a' where collection_name = 'notes' and record_id = 'n-unowned'");
  assert.equal(await ownerOf(pool, "notes", "n-unowned"), "actor:a", "the 0114 owner backfill is not a departure");
  await testRawWrite(client, "notes", "update orbit_records set payload = '{\"id\":\"n1\",\"v\":2}' where collection_name = 'notes' and record_id = 'n1'");
  await pool.query("update orbit_records set user_id = 'actor:b' where collection_name = 'contacts' and record_id = 'c1'");
  assert.equal(await ownerOf(pool, "contacts", "c1"), "actor:b", "contacts are not a sync domain yet");
});

test("the registered first-owner handler (0114 backfill) opens nothing: it cannot re-own a note or clear an owner, and reassignRecordOwner refuses it", options, async (t) => {
  const { pool, client } = await database(t);
  for (const sql of [
    "update orbit_records set user_id = 'actor:b' from sync_write_lock where collection_name = 'notes' and record_id = 'n1'",
    "update orbit_records set user_id = null from sync_write_lock where collection_name = 'tasks' and record_id = 't1'",
  ]) {
    await assert.rejects(() => client.transaction(async (tx) => {
      await tx.query("select set_config('orbit.sync_owner_change_handler', 'owner-backfill-0114', true)");
      await tx.query(`with sync_write_lock as materialized (select set_config('orbit.sync_write_lock_key', (hashtextextended('orbit:sync:commit-order:v1:' || coalesce(to_regclass('orbit_records')::oid::text, ''), 0))::text, true) as k, pg_advisory_xact_lock(hashtextextended('orbit:sync:commit-order:v1:' || coalesce(to_regclass('orbit_records')::oid::text, ''), 0))) ${sql}`);
    }), refused);
  }
  assert.equal(await ownerOf(pool, "notes", "n1"), "actor:a");
  assert.equal(await ownerOf(pool, "tasks", "t1"), "actor:a");
  const store = createPostgresLiveRecordStore({ client });
  await assert.rejects(async () => store.reassignRecordOwner!({ workspaceId: W, collectionName: "notes", recordId: "n1", fromUserId: "actor:a", toUserId: "actor:b", updatedAt: T0, handler: "owner-backfill-0114" }), (error: unknown) => (error as { code?: string }).code === "SYNC_OWNER_CHANGE_UNREGISTERED");
  assert.equal(await ownerOf(pool, "notes", "n1"), "actor:a");
});
