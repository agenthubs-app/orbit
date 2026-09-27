import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { SYNC_WRITE_LOCK_KEY_SQL } from "../../features/sync/commit-order-lock";
import { SYNC_REVISION_MIGRATION_SQL } from "../../features/sync/migrations";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { SYNC_REVISION_ASSIGN_ONLY_SQL } from "../support/sync-revision-fixture";

// Sprint 0108: the strict sync_revision trigger rejects any write to a sync
// collection that does not hold the commit-order lock. These tests run the
// product write paths against that trigger on a real Postgres schema.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:commit-order";
const A = "actor:a";
const SECRET = "commit-order-lock-test-secret-0123456789abcdef012345";
const NOW = "2026-09-27T01:00:00.000Z";

async function host(t: TestContext, trigger: "strict" | "relaxed" = "strict") {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `commit_order_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(trigger === "strict" ? SYNC_REVISION_MIGRATION_SQL : SYNC_REVISION_ASSIGN_ONLY_SQL);
  const store = createPostgresLiveRecordStore({ client });
  const reader = createDomainReadService({ client, cursorSecret: SECRET, now: () => NOW });
  // An identity row makes the actor authorized for the domain pages.
  await store.upsertRecord(record("accounts", A, { id: A }));
  return { pool, client, store, reader };
}

function record(collectionName: string, recordId: string, payload: Record<string, unknown>, at = NOW): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId: W, collectionName, recordId, userId: A, sourceType: "manual", sourceId: recordId,
    evidenceIds: [], lifecycleState: "active", createdAt: at, updatedAt: at, payload,
  };
}

function note(id: string, at = NOW): Record<string, unknown> {
  return {
    schemaVersion: 2,
    note: { id, accountId: A, ownerUserId: A, title: id, body: `body ${id}`, manualContactIds: [], mentions: [], contactIds: [], eventIds: [], version: 1, createdAt: at, updatedAt: at },
    operations: [],
  };
}

async function revision(pool: Pool, collection: string, id: string): Promise<bigint> {
  const rows = (await pool.query("select sync_revision::text as r from orbit_records where workspace_id=$1 and collection_name=$2 and record_id=$3", [W, collection, id])).rows;
  assert.equal(rows.length, 1, `${collection}/${id} exists`);
  return BigInt(rows[0].r);
}

/** Follows a device bookmark through every page and returns the ids seen. */
async function pull(reader: ReturnType<typeof createDomainReadService>, domainId: string, cursor?: string) {
  const ids: string[] = [];
  for (let page = 0; page < 20; page += 1) {
    const data = await reader.readDomainPage({ actorId: A, workspaceId: W, domainId, limit: 10, ...(cursor ? { cursor } : {}) });
    ids.push(...data.changes.map((change) => change.id));
    cursor = data.nextCursor;
    if (!data.hasMore) return { ids, cursor };
  }
  throw new Error("pagination did not terminate");
}

test("the inline lock key equals the migration's orbit_records_sync_write_lock_key()", options, async (t) => {
  const h = await host(t);
  const rows = (await h.pool.query(`select orbit_records_sync_write_lock_key()::text as migration, (${SYNC_WRITE_LOCK_KEY_SQL})::text as inline`)).rows;
  assert.equal(rows[0].inline, rows[0].migration);
});

test("every store write to a sync collection passes the strict trigger, autocommit and inside a transaction", options, async (t) => {
  const h = await host(t);
  for (const collection of ["notes", "tasks", "personal_schedule_items"]) {
    const saved = await h.store.upsertRecord(record(collection, `${collection}:1`, { id: `${collection}:1` }));
    assert.equal(saved.recordId, `${collection}:1`);
    const inserted = await h.store.insertRecordIfAbsent(record(collection, `${collection}:2`, { id: `${collection}:2` }));
    assert.ok(inserted, "insertRecordIfAbsent writes a new row");
    assert.equal(await h.store.insertRecordIfAbsent(record(collection, `${collection}:2`, { id: "ignored" })), null, "conflict still returns null");
    const updated = await h.store.updateRecordIfCurrent({ ...record(collection, `${collection}:2`, { id: `${collection}:2`, v: 2 }), updatedAt: "2026-09-27T02:00:00.000Z" }, { userId: A, updatedAt: NOW });
    assert.deepEqual(updated?.payload, { id: `${collection}:2`, v: 2 });
    const deleted = await h.store.deleteRecord({ workspaceId: W, collectionName: collection, recordId: `${collection}:1`, deletedAt: "2026-09-27T03:00:00.000Z", userId: A });
    assert.equal(deleted?.lifecycleState, "deleted");
    await h.client.transaction(async (tx) => {
      const txStore = createPostgresLiveRecordStore({ client: tx });
      await txStore.upsertRecord(record(collection, `${collection}:3`, { id: `${collection}:3` }));
      await txStore.upsertRecord(record(collection, `${collection}:4`, { id: `${collection}:4` }));
    });
  }
  // Non-sync collections keep the plain statement and need no lock.
  await h.store.upsertRecord(record("contacts", "contact:1", { id: "contact:1" }));
  const count = (await h.pool.query("select count(*)::int as n from orbit_records where collection_name in ('notes','tasks','personal_schedule_items')")).rows[0].n;
  assert.equal(count, 12);
  // A raw unlocked write is still refused: the trigger is really strict here.
  await assert.rejects(
    h.pool.query("insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at) values ($1,'notes','raw',$2,'manual','raw','{}',$3,$3)", [W, A, NOW]),
    /SYNC_WRITE_LOCK_REQUIRED/,
  );
});

test("the note, task and personal-schedule services write under the strict trigger", options, async (t) => {
  const h = await host(t);
  const notes = createNoteService({ repository: createNoteRepository({ store: h.store, workspaceId: W }) });
  const created = await notes.create({ actorId: A, title: "N", body: "hello", idempotencyKey: "note-1", now: NOW });
  await notes.update({ actorId: A, noteId: created.id, body: "hello again", expectedVersion: 1, idempotencyKey: "note-2", now: "2026-09-27T01:05:00.000Z" });
  const tasks = createTaskService({ repository: createTaskRepository({ store: h.store, workspaceId: W, transactionClient: h.client }) });
  const task = await tasks.create({ actorId: A, title: "T", category: "work", idempotencyKey: "task-1", now: NOW });
  await tasks.complete({ actorId: A, taskId: task.task.id, completedBy: A, completionSource: "user", idempotencyKey: "task-2", now: "2026-09-27T01:06:00.000Z" });
  await tasks.delete({ actorId: A, taskId: task.task.id, idempotencyKey: "task-3", now: "2026-09-27T01:07:00.000Z" });
  const schedule = createPersonalScheduleService({ store: h.store, client: h.client, workspaceId: W, now: () => NOW });
  const item = await schedule.create(A, { title: "S", startsAt: "2026-09-28T01:00:00.000Z", idempotencyKey: "schedule-1" });
  const moved = await schedule.update(A, item.scheduleItem.id, { expectedUpdatedAt: item.scheduleItem.updatedAt, idempotencyKey: "schedule-2", patch: { title: "S2" } });
  await schedule.remove(A, item.scheduleItem.id, { expectedUpdatedAt: moved.scheduleItem.updatedAt, idempotencyKey: "schedule-3" });
  const pages = { notes: await pull(h.reader, "notes"), tasks: await pull(h.reader, "tasks"), schedule: await pull(h.reader, "personal-schedule") };
  assert.deepEqual(pages.notes.ids, [created.id]);
  assert.deepEqual(pages.tasks.ids, [task.task.id]);
  assert.deepEqual(pages.schedule.ids, [item.scheduleItem.id]);
});

/**
 * Two writers: T1 takes a revision and holds its transaction open; T2 writes
 * while T1 is still open. A device syncs in between and again after both commit.
 */
async function interleave(h: Awaited<ReturnType<typeof host>>, write: (tx: TransactionalSqlExecutor, id: string) => Promise<void>) {
  let releaseFirst!: () => void;
  const firstMayCommit = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstWrote!: () => void;
  const firstHasWritten = new Promise<void>((resolve) => { firstWrote = resolve; });
  const first = h.client.transaction(async (tx) => { await write(tx, "note:first"); firstWrote(); await firstMayCommit; });
  await firstHasWritten;
  let secondDone = false;
  const second = h.client.transaction(async (tx) => { await write(tx, "note:second"); }).then(() => { secondDone = true; });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const secondFinishedWhileFirstOpen = secondDone;
  const between = await pull(h.reader, "notes");
  releaseFirst();
  await first;
  await second;
  const after = await pull(h.reader, "notes", between.cursor);
  return { secondFinishedWhileFirstOpen, seen: [...between.ids, ...after.ids] };
}

test("a revision taken before a later one commits is never skipped by a device bookmark (store writers hold the lock)", options, async (t) => {
  const h = await host(t);
  const result = await interleave(h, async (tx, id) => { await createPostgresLiveRecordStore({ client: tx }).upsertRecord(record("notes", id, note(id))); });
  assert.equal(result.secondFinishedWhileFirstOpen, false, "the second writer waits for the first to commit");
  assert.ok(await revision(h.pool, "notes", "note:first") < await revision(h.pool, "notes", "note:second"), "commit order equals revision order");
  assert.deepEqual([...result.seen].sort(), ["note:first", "note:second"], "the device sees both rows");
});

test("control: without the lock the same interleaving loses a row, so the test above can fail", options, async (t) => {
  const h = await host(t, "relaxed");
  const raw = `insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values ($1,'notes',$2,$3,'manual',$2,$4::jsonb,$5,$5)`;
  const result = await interleave(h, async (tx, id) => { await tx.query(raw, [W, id, A, JSON.stringify(note(id)), NOW]); });
  assert.equal(result.secondFinishedWhileFirstOpen, true, "nothing orders the writers");
  assert.ok(await revision(h.pool, "notes", "note:first") < await revision(h.pool, "notes", "note:second"));
  assert.deepEqual(result.seen, ["note:second"], "the first row's smaller revision committed behind the bookmark");
});
