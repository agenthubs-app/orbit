import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  SYNC_REVISION_MIGRATION_SQL,
  runSyncRevisionMigration,
} from "../../features/sync/migrations";
import { createIncrementalSyncReadService } from "../../features/sync/read-service";
import {
  ORBIT_RECORDS_SCHEMA_SQL,
  runOrbitRecordsMigration,
} from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_SYNC_TEST_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_SYNC_TEST_DATABASE_URL is not configured",
};

async function waitForAdvisoryLockWait(pool: Pool, pid: number): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await pool.query<{ wait_event: string | null; wait_event_type: string | null }>(`
      select wait_event, wait_event_type from pg_stat_activity where pid = $1
    `, [pid]);
    if (state.rows[0]?.wait_event_type === "Lock" && state.rows[0]?.wait_event === "advisory") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`backend ${pid} did not wait on the sync advisory lock`);
}

function canonicalNote(id: string, actorId: string, timestamp: string) {
  return {
    schemaVersion: 2,
    note: {
      id,
      accountId: actorId,
      ownerUserId: actorId,
      title: id,
      body: id,
      manualContactIds: [],
      mentions: [],
      contactIds: [],
      eventIds: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    operations: [],
  };
}

test("sync revision migration backfills before NOT NULL, advances the sequence, and installs trigger/index guards", () => {
  assert.match(SYNC_REVISION_MIGRATION_SQL, /create sequence if not exists orbit_records_sync_revision_seq/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /add column if not exists sync_revision bigint/i);
  assert.match(
    SYNC_REVISION_MIGRATION_SQL,
    /update orbit_records\s+set sync_revision = nextval\('orbit_records_sync_revision_seq'::regclass\)[\s\S]*where sync_revision is null/i,
  );
  assert.match(SYNC_REVISION_MIGRATION_SQL, /alter column sync_revision set not null/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /create unique index if not exists orbit_records_sync_revision_uidx/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /function orbit_records_acquire_sync_write_lock\(target_collection text\)/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /set_config\('orbit\.sync_write_lock_key'/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /current_setting\('orbit\.sync_write_lock_key'/i);
  assert.match(SYNC_REVISION_MIGRATION_SQL, /SYNC_WRITE_LOCK_REQUIRED/i);
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
  const lockedInsertSql = `
    with sync_write_lock as materialized (
      select orbit_records_acquire_sync_write_lock($2) as acquired
    )
    insert into orbit_records (
      workspace_id, collection_name, record_id, user_id, source_type, source_id,
      evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
    )
    select $1, $2, $3, $4, 'manual', $3, '{}', 'active', '', $5, $6, $6
    from sync_write_lock where sync_write_lock.acquired
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

    const backfill = await pool.query<{ count: string; distinct_count: string; max_revision: string }>(`
      select count(*)::text as count,
        count(distinct sync_revision)::text as distinct_count,
        max(sync_revision)::text as max_revision
      from orbit_records
    `);
    assert.deepEqual(backfill.rows[0], { count: "2", distinct_count: "2", max_revision: "41" });

    const firstTriggered = await pool.query<{ revision: string }>(lockedInsertSql, [
      "workspace:sync",
      "notes",
      "note:first-triggered",
      "account:owner",
      { note: { id: "note:first-triggered" } },
      timestamp,
    ]);
    const firstTriggeredRevision = Number(firstTriggered.rows[0]?.revision);
    assert.ok(firstTriggeredRevision > 41);

    await pool.query("select setval('orbit_records_sync_revision_seq'::regclass, 100, false)");
    await runSyncRevisionMigration(pool);

    const inserted = await pool.query<{ revision: string }>(lockedInsertSql, [
      "workspace:sync",
      "notes",
      "note:inserted",
      "account:owner",
      { note: { id: "note:inserted" } },
      timestamp,
    ]);
    const insertRevision = Number(inserted.rows[0]?.revision);
    assert.equal(insertRevision, 100, "an idempotent rerun must preserve an ahead sequence and is_called=false");
    const updated = await pool.query<{ revision: string }>(`
      with sync_write_lock as materialized (
        select orbit_records_acquire_sync_write_lock('notes') as acquired
      )
      update orbit_records set payload = payload || '{"changed":true}'::jsonb
      from sync_write_lock
      where workspace_id = 'workspace:sync' and collection_name = 'notes' and record_id = 'note:inserted'
        and sync_write_lock.acquired
      returning sync_revision::text as revision
    `);
    const updateRevision = Number(updated.rows[0]?.revision);
    const deleted = await pool.query<{ revision: string }>(`
      with sync_write_lock as materialized (
        select orbit_records_acquire_sync_write_lock('notes') as acquired
      )
      update orbit_records set lifecycle_state = 'deleted', deleted_at = $1, updated_at = $1
      from sync_write_lock
      where workspace_id = 'workspace:sync' and collection_name = 'notes' and record_id = 'note:inserted'
        and sync_write_lock.acquired
      returning sync_revision::text as revision
    `, [timestamp]);
    const deleteRevision = Number(deleted.rows[0]?.revision);
    assert.ok(updateRevision > insertRevision && deleteRevision > updateRevision);

    const concurrentStore = createPostgresLiveRecordStore({ client: pool });
    await Promise.all(Array.from({ length: 20 }, async (_, index) => {
      const id = `task:concurrent:${index}`;
      await concurrentStore.upsertRecord({
        workspaceId: "workspace:sync",
        collectionName: "tasks",
        recordId: id,
        userId: "account:owner",
        sourceType: "manual",
        sourceId: id,
        sourceLabel: null,
        provider: null,
        providerRecordId: null,
        evidenceIds: [],
        targetType: null,
        targetId: null,
        occurredAt: null,
        lifecycleState: "active",
        searchText: "",
        payload: { task: { id } },
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      });
    }));
    const concurrentRows = await pool.query<{ revision: string }>(`
      select sync_revision::text as revision from orbit_records
      where record_id like 'task:concurrent:%'
    `);
    const concurrent = concurrentRows.rows.map(({ revision }) => Number(revision));
    assert.equal(new Set(concurrent).size, concurrent.length);
    assert.ok(concurrent.every((revision) => revision > deleteRevision));

    const sequence = await pool.query<{ last_value: string }>("select last_value::text from orbit_records_sync_revision_seq");
    const maximum = await pool.query<{
      count: string;
      distinct_count: string;
      max_revision: string;
      null_count: string;
    }>(`
      select count(*)::text as count,
        count(distinct sync_revision)::text as distinct_count,
        count(*) filter (where sync_revision is null)::text as null_count,
        max(sync_revision)::text as max_revision
      from orbit_records
    `);
    assert.ok(Number(sequence.rows[0]?.last_value) >= Number(maximum.rows[0]?.max_revision));
    assert.equal(maximum.rows[0]?.null_count, "0");
    assert.equal(maximum.rows[0]?.count, maximum.rows[0]?.distinct_count);

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

test("syncable revisions follow commit visibility and tolerate rollback gaps", databaseTest, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_commit_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = "workspace:commit-order";
  const actorId = "account:commit-order";
  const timestamp = "2026-09-16T08:00:00.000Z";
  const admin = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  const first = await pool.connect();
  const second = await pool.connect();
  const write = async (client: typeof first, id: string) => {
    await createPostgresLiveRecordStore({ client }).upsertRecord({
      workspaceId,
      collectionName: "notes",
      recordId: id,
      userId: actorId,
      sourceType: "manual",
      sourceId: id,
      sourceLabel: null,
      provider: null,
      providerRecordId: null,
      evidenceIds: [],
      targetType: null,
      targetId: null,
      occurredAt: null,
      lifecycleState: "active",
      searchText: "",
      payload: canonicalNote(id, actorId, timestamp),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    return client.query<{ revision: string }>(`
      select sync_revision::text as revision from orbit_records
      where workspace_id = $1 and collection_name = 'notes' and record_id = $2
    `, [workspaceId, id]);
  };

  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const secondPid = Number((await second.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid);

    await first.query("begin");
    const firstWrite = await write(first, "note:commit-first");
    await second.query("begin");
    let secondSettled = false;
    const secondWrite = write(second, "note:commit-second").then(
      (result) => { secondSettled = true; return result; },
      (error) => { secondSettled = true; throw error; },
    );
    await waitForAdvisoryLockWait(admin, secondPid);
    assert.equal(secondSettled, false);
    await first.query("commit");
    const secondResult = await secondWrite;
    await second.query("commit");
    assert.ok(Number(secondResult.rows[0]?.revision) > Number(firstWrite.rows[0]?.revision));

    await first.query("begin");
    const rolledBack = await write(first, "note:rolled-back");
    await second.query("begin");
    secondSettled = false;
    const afterRollback = write(second, "note:after-rollback").then(
      (result) => { secondSettled = true; return result; },
      (error) => { secondSettled = true; throw error; },
    );
    await waitForAdvisoryLockWait(admin, secondPid);
    assert.equal(secondSettled, false);
    await first.query("rollback");
    const afterRollbackResult = await afterRollback;
    await second.query("commit");
    assert.ok(Number(afterRollbackResult.rows[0]?.revision) > Number(rolledBack.rows[0]?.revision));

    const sqlClient = {
      async query<TRow = Record<string, unknown>>(text: string, values: readonly unknown[] = []) {
        const result = await pool.query(text, [...values]);
        return { rows: result.rows as TRow[] };
      },
    };
    const reader = createIncrementalSyncReadService({
      client: sqlClient,
      cursorSecret: "test-only-commit-order-cursor-secret",
      now: () => timestamp,
    });
    const seen: string[] = [];
    let page = await reader.readPage({ actorId, workspaceId, limit: 1 });
    seen.push(...page.changes.map((change) => change.id));
    while (page.hasMore) {
      page = await reader.readPage({ actorId, workspaceId, cursor: page.nextCursor, limit: 1 });
      seen.push(...page.changes.map((change) => change.id));
    }
    assert.deepEqual(seen, ["note:commit-first", "note:commit-second", "note:after-rollback"]);
  } finally {
    await first.query("rollback").catch(() => undefined);
    await second.query("rollback").catch(() => undefined);
    first.release();
    second.release();
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});

test("production upsert and delete acquire the sync lock before touching the same tuple", databaseTest, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_deadlock_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = "workspace:deadlock";
  const actorId = "account:deadlock";
  const recordId = "note:deadlock";
  const timestamp = "2026-09-16T08:00:00.000Z";
  const testBarrierKey = 2_033_000_001;
  const admin = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 6,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000 -c deadlock_timeout=100`,
  });
  const barrier = await pool.connect();
  const deleting = await pool.connect();
  const upserting = await pool.connect();
  const record = {
    workspaceId,
    collectionName: "notes",
    recordId,
    userId: actorId,
    sourceType: "manual",
    sourceId: recordId,
    sourceLabel: null,
    provider: null,
    providerRecordId: null,
    evidenceIds: [],
    targetType: null,
    targetId: null,
    occurredAt: null,
    lifecycleState: "active" as const,
    searchText: recordId,
    payload: canonicalNote(recordId, actorId, timestamp),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };

  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await createPostgresLiveRecordStore({ client: pool }).upsertRecord(record);
    await pool.query(`
      create function aaa_test_pause_sync_delete()
      returns trigger language plpgsql as $$
      begin
        if new.record_id = '${recordId}' and new.lifecycle_state = 'deleted' then
          perform pg_advisory_xact_lock(${testBarrierKey});
        end if;
        return new;
      end;
      $$;
      create trigger aaa_test_pause_sync_delete_trigger
        before update on orbit_records
        for each row execute function aaa_test_pause_sync_delete();
    `);
    await barrier.query("select pg_advisory_lock($1)", [testBarrierKey]);
    const deletingPid = Number((await deleting.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid);
    const upsertingPid = Number((await upserting.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid);
    const deletingStore = createPostgresLiveRecordStore({ client: deleting });
    const upsertingStore = createPostgresLiveRecordStore({ client: upserting });

    await deleting.query("begin");
    const deleteOperation = deletingStore.deleteRecord({
      workspaceId,
      collectionName: "notes",
      recordId,
      deletedAt: timestamp,
    });
    await waitForAdvisoryLockWait(admin, deletingPid);

    await upserting.query("begin");
    const upsertOperation = upsertingStore.upsertRecord({
      ...record,
      updatedAt: "2026-09-16T08:01:00.000Z",
    });
    await waitForAdvisoryLockWait(admin, upsertingPid);
    await barrier.query("select pg_advisory_unlock($1)", [testBarrierKey]);

    const deleted = await deleteOperation;
    await deleting.query("commit");
    const upserted = await upsertOperation;
    await upserting.query("commit");
    assert.equal(deleted?.lifecycleState, "deleted");
    assert.equal(upserted.lifecycleState, "active");
  } finally {
    await barrier.query("select pg_advisory_unlock($1)", [testBarrierKey]).catch(() => undefined);
    await deleting.query("rollback").catch(() => undefined);
    await upserting.query("rollback").catch(() => undefined);
    barrier.release();
    deleting.release();
    upserting.release();
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});

test("sync write guard rejects bypasses while supported writes serialize only sync collections", databaseTest, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_guard_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = "workspace:guard";
  const actorId = "account:guard";
  const timestamp = "2026-09-16T08:00:00.000Z";
  const admin = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  const locker = await pool.connect();
  const writer = await pool.connect();
  const store = createPostgresLiveRecordStore({ client: writer });
  const record = (collectionName: string, recordId: string) => ({
    workspaceId,
    collectionName,
    recordId,
    userId: actorId,
    sourceType: "manual",
    sourceId: recordId,
    sourceLabel: null,
    provider: null,
    providerRecordId: null,
    evidenceIds: [],
    targetType: null,
    targetId: null,
    occurredAt: null,
    lifecycleState: "active" as const,
    searchText: recordId,
    payload: collectionName === "notes"
      ? canonicalNote(recordId, actorId, timestamp)
      : { id: recordId, actorId, createdAt: timestamp, updatedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });

  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const writerPid = Number((await writer.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]?.pid);

    for (const collectionName of ["notes", "tasks", "personal_schedule_items"]) {
      await locker.query("begin");
      await locker.query("select orbit_records_acquire_sync_write_lock('notes')");
      let settled = false;
      const writing = Promise.resolve(store.upsertRecord(record(collectionName, `${collectionName}:waits`))).then(
        (result) => { settled = true; return result; },
        (error) => { settled = true; throw error; },
      );
      await waitForAdvisoryLockWait(admin, writerPid);
      assert.equal(settled, false, `${collectionName} must wait for the sync lock`);
      await locker.query("commit");
      await writing;
    }

    await locker.query("begin");
    await locker.query("select orbit_records_acquire_sync_write_lock('notes')");
    await store.upsertRecord(record("events", "event:does-not-wait"));
    const visible = await admin.query<{ count: string }>(`
      select count(*)::text as count from ${schema}.orbit_records
      where collection_name = 'events' and record_id = 'event:does-not-wait'
    `);
    assert.equal(visible.rows[0]?.count, "1", "a non-sync write commits while the sync lock is held");
    await locker.query("rollback");

    await locker.query("begin");
    await locker.query("select orbit_records_acquire_sync_write_lock('notes')");
    await writer.query("set statement_timeout = 250");
    await assert.rejects(
      writer.query(`
        insert into orbit_records (
          workspace_id, collection_name, record_id, user_id, source_type, source_id,
          evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
        ) values ($1, 'notes', 'note:raw-bypass', $2, 'manual', 'note:raw-bypass', '{}',
          'active', '', $3, $4, $4)
      `, [workspaceId, actorId, canonicalNote("note:raw-bypass", actorId, timestamp), timestamp]),
      (error: unknown) => error instanceof Error && error.message.includes("SYNC_WRITE_LOCK_REQUIRED"),
    );
    await writer.query("set statement_timeout = 10000");
    await locker.query("rollback");
    await assert.rejects(
      writer.query(`
        insert into orbit_records (
          workspace_id, collection_name, record_id, user_id, source_type, source_id,
          evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at
        ) values ($1, 'notes', 'note:raw-bypass-uncontended', $2, 'manual',
          'note:raw-bypass-uncontended', '{}', 'active', '', $3, $4, $4)
      `, [workspaceId, actorId, canonicalNote("note:raw-bypass-uncontended", actorId, timestamp), timestamp]),
      (error: unknown) => error instanceof Error && error.message.includes("SYNC_WRITE_LOCK_REQUIRED"),
    );
  } finally {
    await locker.query("rollback").catch(() => undefined);
    locker.release();
    writer.release();
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});

test("syncable upsert cannot transfer an existing record between actors", databaseTest, async () => {
  assert.ok(databaseUrl);
  const schema = `sync_owner_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = "workspace:owner-guard";
  const timestamp = "2026-09-16T08:00:00.000Z";
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  const store = createPostgresLiveRecordStore({ client: pool });
  const schedule = (userId: string) => ({
    workspaceId,
    collectionName: "personal_schedule_items",
    recordId: "schedule:shared-id",
    userId,
    sourceType: "manual",
    sourceId: "schedule:shared-id",
    sourceLabel: null,
    provider: null,
    providerRecordId: null,
    evidenceIds: [],
    targetType: null,
    targetId: null,
    occurredAt: null,
    lifecycleState: "active" as const,
    searchText: "",
    payload: { id: "schedule:shared-id", actorId: userId, createdAt: timestamp, updatedAt: timestamp },
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });

  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await store.upsertRecord(schedule("account:original"));
    await assert.rejects(
      Promise.resolve(store.upsertRecord(schedule("account:attacker"))),
      /upsert returned no row/i,
    );
    const persisted = await pool.query<{ user_id: string; payload: { actorId: string } }>(`
      select user_id, payload from orbit_records
      where workspace_id = $1 and collection_name = 'personal_schedule_items'
        and record_id = 'schedule:shared-id'
    `, [workspaceId]);
    assert.deepEqual(persisted.rows[0], {
      user_id: "account:original",
      payload: { id: "schedule:shared-id", actorId: "account:original", createdAt: timestamp, updatedAt: timestamp },
    });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});

test("sync lock keys are table-scoped and non-sync upserts retain cross-owner compatibility", databaseTest, async () => {
  assert.ok(databaseUrl);
  const suffix = randomUUID().replaceAll("-", "");
  const firstSchema = `sync_key_a_${suffix}`;
  const secondSchema = `sync_key_b_${suffix}`;
  const workspaceId = "workspace:non-sync-owner";
  const timestamp = "2026-09-16T08:00:00.000Z";
  const admin = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
  const first = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${firstSchema} -c statement_timeout=10000`,
  });
  const second = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${secondSchema} -c statement_timeout=10000`,
  });
  const event = (userId: string) => ({
    workspaceId,
    collectionName: "events",
    recordId: "event:shared-id",
    userId,
    sourceType: "manual",
    sourceId: "event:shared-id",
    sourceLabel: null,
    provider: null,
    providerRecordId: null,
    evidenceIds: [],
    targetType: "event",
    targetId: "event:shared-id",
    occurredAt: timestamp,
    lifecycleState: "active" as const,
    searchText: "",
    payload: { id: "event:shared-id", actorId: userId },
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });

  try {
    await admin.query(`create schema ${firstSchema}`);
    await admin.query(`create schema ${secondSchema}`);
    await first.query(ORBIT_RECORDS_SCHEMA_SQL);
    await second.query(ORBIT_RECORDS_SCHEMA_SQL);
    const firstKey = await first.query<{ key: string }>("select orbit_records_sync_write_lock_key()::text as key");
    const secondKey = await second.query<{ key: string }>("select orbit_records_sync_write_lock_key()::text as key");
    assert.notEqual(firstKey.rows[0]?.key, secondKey.rows[0]?.key);

    const store = createPostgresLiveRecordStore({ client: first });
    await store.upsertRecord(event("account:original"));
    const transferred = await store.upsertRecord(event("account:replacement"));
    assert.equal(transferred.userId, "account:replacement");
    const persisted = await first.query<{ user_id: string }>(`
      select user_id from orbit_records
      where workspace_id = $1 and collection_name = 'events' and record_id = 'event:shared-id'
    `, [workspaceId]);
    assert.equal(persisted.rows[0]?.user_id, "account:replacement");
  } finally {
    await Promise.all([first.end(), second.end()]);
    try {
      await admin.query(`drop schema if exists ${firstSchema} cascade`);
      await admin.query(`drop schema if exists ${secondSchema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
