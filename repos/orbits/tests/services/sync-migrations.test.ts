import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  SYNC_REVISION_MIGRATION_SQL,
  runSyncRevisionMigration,
} from "../../features/sync/migrations";
import {
  ORBIT_RECORDS_SCHEMA_SQL,
  runOrbitRecordsMigration,
} from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_SYNC_TEST_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_SYNC_TEST_DATABASE_URL is not configured",
};

test("sync revision migration backfills before NOT NULL, advances the sequence, and installs trigger/index guards", () => {
  assert.match(SYNC_REVISION_MIGRATION_SQL, /create sequence if not exists orbit_records_sync_revision_seq/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /add column if not exists sync_revision bigint/i);
  assert.match(
    SYNC_REVISION_MIGRATION_SQL,
    /update orbit_records\s+set sync_revision = nextval\('orbit_records_sync_revision_seq'::regclass\)\s+where sync_revision is null/i,
  );
  assert.match(SYNC_REVISION_MIGRATION_SQL, /alter column sync_revision set not null/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /create unique index if not exists orbit_records_sync_revision_uidx/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /before insert or update on orbit_records/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /new\.sync_revision := nextval\('orbit_records_sync_revision_seq'::regclass\)/i);
  assert.match(
    SYNC_REVISION_MIGRATION_SQL,
    /on orbit_records \(workspace_id, user_id, sync_revision\)[\s\S]*where user_id is not null[\s\S]*collection_name in \('notes', 'tasks', 'personal_schedule_items'\)/i,
  );
  assert.match(SYNC_REVISION_MIGRATION_SQL, /SYNC_REVISION_NULL_BACKFILL_FAILED/);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /SYNC_REVISION_DUPLICATE_BACKFILL_FAILED/);

  const backfill = SYNC_REVISION_MIGRATION_SQL.search(/update orbit_records[\s\S]*set sync_revision/i);
  const notNull = SYNC_REVISION_MIGRATION_SQL.search(/alter column sync_revision set not null/i);
  assert.ok(backfill >= 0 && notNull > backfill, "backfill must finish before NOT NULL is enforced");
});

test("runOrbitRecordsMigration wires the sync migration into the existing first schema operation", async () => {
  const calls: string[] = [];
  await runOrbitRecordsMigration({
    async query(sql) {
      calls.push(sql);
      return { rows: [] };
    },
  });
  assert.equal(calls[0], ORBIT_RECORDS_SCHEMA_SQL);
  assert.ok(calls[0]?.includes(SYNC_REVISION_MIGRATION_SQL));
  assert.match(calls[1] ?? "", /relationship_lifecycle_command_receipts/i);
  assert.match(calls[2] ?? "", /event_ops_schema_migrations/i);
});

test("standalone sync migration is awaited and surfaces database failures", async () => {
  const calls: string[] = [];
  await runSyncRevisionMigration({
    async query(sql) {
      calls.push(sql);
      return { rows: [] };
    },
  });
  assert.deepEqual(calls, [SYNC_REVISION_MIGRATION_SQL]);

  const failure = new Error("migration failed");
  await assert.rejects(
    runSyncRevisionMigration({ async query() { throw failure; } }),
    (error: unknown) => error === failure,
  );
});

test("real PostgreSQL migration is idempotent and assigns unique monotonic revisions under concurrent writes", databaseTest, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 12,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  const timestamp = "2026-09-16T08:00:00.000Z";
  const insertSql = `
    insert into orbit_records (
      workspace_id, collection_name, record_id, user_id, source_type, source_id,
      evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
    ) values ($1, $2, $3, $4, 'manual', $3, '{}', 'active', '', $5, $6, $6)
    returning sync_revision::text as revision
  `;
  try {
    await admin.query(`create schema ${schema}`);
    const legacySchemaSql = ORBIT_RECORDS_SCHEMA_SQL.replace(SYNC_REVISION_MIGRATION_SQL, "");
    await pool.query(legacySchemaSql);
    await pool.query("alter table orbit_records add column sync_revision bigint");
    await pool.query(insertSql.replace("returning sync_revision::text as revision", ""), [
      "workspace:sync",
      "notes",
      "note:legacy:1",
      "account:owner",
      { note: { id: "note:legacy:1" } },
      timestamp,
    ]);
    await pool.query(insertSql.replace("returning sync_revision::text as revision", ""), [
      "workspace:sync",
      "tasks",
      "task:legacy:2",
      "account:owner",
      { task: { id: "task:legacy:2" } },
      timestamp,
    ]);
    await pool.query(`
      update orbit_records set sync_revision = 40
      where workspace_id = 'workspace:sync' and collection_name = 'notes' and record_id = 'note:legacy:1'
    `);

    await runSyncRevisionMigration(pool);
    await runSyncRevisionMigration(pool);

    const backfill = await pool.query<{ count: string; distinct_count: string; max_revision: string }>(`
      select count(*)::text as count,
        count(distinct sync_revision)::text as distinct_count,
        max(sync_revision)::text as max_revision
      from orbit_records
    `);
    assert.deepEqual(backfill.rows[0], { count: "2", distinct_count: "2", max_revision: "41" });

    const inserted = await pool.query<{ revision: string }>(insertSql, [
      "workspace:sync",
      "notes",
      "note:inserted",
      "account:owner",
      { note: { id: "note:inserted" } },
      timestamp,
    ]);
    const insertRevision = Number(inserted.rows[0]?.revision);
    const updated = await pool.query<{ revision: string }>(`
      update orbit_records set payload = payload || '{"changed":true}'::jsonb
      where workspace_id = 'workspace:sync' and collection_name = 'notes' and record_id = 'note:inserted'
      returning sync_revision::text as revision
    `);
    const updateRevision = Number(updated.rows[0]?.revision);
    const deleted = await pool.query<{ revision: string }>(`
      update orbit_records set lifecycle_state = 'deleted', deleted_at = $1, updated_at = $1
      where workspace_id = 'workspace:sync' and collection_name = 'notes' and record_id = 'note:inserted'
      returning sync_revision::text as revision
    `, [timestamp]);
    const deleteRevision = Number(deleted.rows[0]?.revision);
    assert.ok(insertRevision > 41 && updateRevision > insertRevision && deleteRevision > updateRevision);

    const concurrent = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const result = await pool.query<{ revision: string }>(insertSql, [
        "workspace:sync",
        "tasks",
        `task:concurrent:${index}`,
        "account:owner",
        { task: { id: `task:concurrent:${index}` } },
        timestamp,
      ]);
      return Number(result.rows[0]?.revision);
    }));
    assert.equal(new Set(concurrent).size, concurrent.length);
    assert.ok(concurrent.every((revision) => revision > deleteRevision));

    const sequence = await pool.query<{ last_value: string }>("select last_value::text from orbit_records_sync_revision_seq");
    const maximum = await pool.query<{ max_revision: string }>("select max(sync_revision)::text as max_revision from orbit_records");
    assert.ok(Number(sequence.rows[0]?.last_value) >= Number(maximum.rows[0]?.max_revision));

    const index = await pool.query<{ indexdef: string }>(`
      select indexdef from pg_indexes
      where schemaname = $1 and indexname = 'orbit_records_sync_actor_idx'
    `, [schema]);
    assert.match(index.rows[0]?.indexdef ?? "", /\(workspace_id, user_id, sync_revision\)/i);
    assert.match(index.rows[0]?.indexdef ?? "", /WHERE .*user_id IS NOT NULL/i);
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
