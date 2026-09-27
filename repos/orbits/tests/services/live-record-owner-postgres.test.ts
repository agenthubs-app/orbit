import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { promisify } from "node:util";
import { Pool } from "pg";
import * as notificationProjector from "../../features/appointments/notification-projector";
import * as encounterProjection from "../../features/encounters/projection-repository";
import type { LiveRecord, LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0113, SC-02: the universal upsert used to write `user_id =
// excluded.user_id` on conflict, so an update that did not pass the owner
// cleared it. These run on a real local Postgres (strict sync schema) and on
// the in-memory store, which must behave the same way.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:owner";
const A = "actor:a";
const B = "actor:b";
const T0 = "2026-09-28T01:00:00.000Z";
const T1 = "2026-09-28T02:00:00.000Z";
const execFileAsync = promisify(execFile);

async function database(t: TestContext) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `owner_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  return { schema, pool, client, store: createPostgresLiveRecordStore({ client }) };
}

function record(collectionName: string, recordId: string, userId: string | null | undefined, payload: Record<string, unknown>, at = T0): LiveRecord {
  return {
    workspaceId: W, collectionName, recordId, ...(userId === undefined ? {} : { userId }),
    sourceType: "manual", sourceId: recordId, evidenceIds: [], lifecycleState: "active",
    createdAt: T0, updatedAt: at, payload,
  };
}

async function owner(pool: Pool, collectionName: string, recordId: string): Promise<string | null> {
  const result = await pool.query<{ user_id: string | null }>("select user_id from orbit_records where workspace_id = $1 and collection_name = $2 and record_id = $3", [W, collectionName, recordId]);
  assert.equal(result.rows.length, 1);
  return result.rows[0]!.user_id;
}

async function ownerlessUpdateKeepsOwner(store: LiveRecordStoreLike, read: (collection: string, id: string) => Promise<string | null | undefined>) {
  for (const collection of ["notes", "contacts"]) {
    await store.upsertRecord(record(collection, `${collection}-1`, A, { v: 1 }));
    const omitted = await store.upsertRecord(record(collection, `${collection}-1`, undefined, { v: 2 }, T1));
    assert.equal(omitted.userId, A, `${collection}: an update without an owner returns the kept owner`);
    assert.equal(await read(collection, `${collection}-1`), A, `${collection}: an update without an owner keeps the stored owner`);
    const nulled = await store.upsertRecord(record(collection, `${collection}-1`, null, { v: 3 }, T1));
    assert.equal(nulled.userId, A, `${collection}: userId null means "not given", not "clear"`);
    assert.deepEqual(nulled.payload, { v: 3 }, "the rest of the update is applied");
  }
}

test("an upsert that omits the owner keeps the stored owner (sync and non-sync collections)", options, async (t) => {
  const { store, pool } = await database(t);
  await ownerlessUpdateKeepsOwner(store, (collection, id) => owner(pool, collection, id));
});

test("the in-memory store keeps the owner the same way", async () => {
  const store = createMemoryLiveRecordStore();
  await ownerlessUpdateKeepsOwner(store, async (collection, id) => (await store.getRecord({ workspaceId: W, collectionName: collection, recordId: id }))?.userId);
});

test("an upsert with the same owner, a new owned row, and a first owner on an unowned row still work", options, async (t) => {
  const { store, pool } = await database(t);
  await store.upsertRecord(record("notes", "n1", A, { v: 1 }));
  await store.upsertRecord(record("notes", "n1", A, { v: 2 }, T1));
  assert.equal(await owner(pool, "notes", "n1"), A);
  await store.upsertRecord(record("contacts", "c1", null, { v: 1 }));
  assert.equal(await owner(pool, "contacts", "c1"), null);
  const claimed = await store.upsertRecord(record("contacts", "c1", B, { v: 2 }, T1));
  assert.equal(claimed.userId, B, "an unowned row can be given its first owner (0114 backfill)");
  assert.equal(await owner(pool, "contacts", "c1"), B);
});

async function transferIsRefused(store: LiveRecordStoreLike, read: (collection: string, id: string) => Promise<unknown>) {
  for (const collection of ["notes", "contacts"]) {
    await store.upsertRecord(record(collection, `${collection}-x`, A, { v: 1 }));
    await assert.rejects(
      async () => store.upsertRecord(record(collection, `${collection}-x`, B, { v: 2 }, T1)),
      (error: unknown) => (error as { code?: string }).code === "LIVE_RECORD_OWNER_CONFLICT",
      `${collection}: naming another owner is not a silent transfer`,
    );
    assert.equal(await read(collection, `${collection}-x`), A, `${collection}: the owner is unchanged`);
  }
}

test("an upsert naming another owner is refused and changes nothing", options, async (t) => {
  const { store, pool } = await database(t);
  await transferIsRefused(store, (collection, id) => owner(pool, collection, id));
  const payload = await pool.query("select payload from orbit_records where record_id = 'notes-x'");
  assert.deepEqual(payload.rows[0]?.payload, { v: 1 }, "the refused write left the payload alone");
});

test("the in-memory store refuses a transfer the same way", async () => {
  const store = createMemoryLiveRecordStore();
  await transferIsRefused(store, async (collection, id) => (await store.getRecord({ workspaceId: W, collectionName: collection, recordId: id }))?.userId);
});

type Reassign = (input: { workspaceId: string; collectionName: string; recordId: string; fromUserId: string | null; toUserId: string | null; updatedAt: string; handler?: string }) => Promise<LiveRecord | null>;

test("an intended owner change goes through reassignRecordOwner; a registered sync domain needs a registered handler", options, async (t) => {
  const { store, pool } = await database(t);
  const reassign = (store as { reassignRecordOwner?: Reassign }).reassignRecordOwner;
  assert.equal(typeof reassign, "function", "the store has an explicit owner-change interface");
  await store.upsertRecord(record("contacts", "c1", A, { v: 1 }));
  const moved = await reassign!({ workspaceId: W, collectionName: "contacts", recordId: "c1", fromUserId: A, toUserId: B, updatedAt: T1 });
  assert.equal(moved?.userId, B);
  assert.equal(await owner(pool, "contacts", "c1"), B);
  assert.equal(await reassign!({ workspaceId: W, collectionName: "contacts", recordId: "c1", fromUserId: A, toUserId: B, updatedAt: T1 }), null, "a stale expected owner changes nothing");
  await store.upsertRecord(record("notes", "n1", A, { v: 1 }));
  await assert.rejects(
    () => reassign!({ workspaceId: W, collectionName: "notes", recordId: "n1", fromUserId: A, toUserId: B, updatedAt: T1 }),
    (error: unknown) => (error as { code?: string }).code === "SYNC_OWNER_CHANGE_UNREGISTERED",
  );
  await assert.rejects(
    () => reassign!({ workspaceId: W, collectionName: "notes", recordId: "n1", fromUserId: A, toUserId: B, updatedAt: T1, handler: "made-up" }),
    (error: unknown) => (error as { code?: string }).code === "SYNC_OWNER_CHANGE_UNREGISTERED",
    "a handler name that is not in SYNC_OWNER_CHANGE_HANDLERS is refused",
  );
  assert.equal(await owner(pool, "notes", "n1"), A);
});

test("the appointment reminder projector and the encounter projector never move a row to another owner", options, async (t) => {
  const { pool, client } = await database(t);
  const upsertNotification = (notificationProjector as Record<string, unknown>).upsertAppointmentReminderNotification as ((input: Record<string, unknown>) => Promise<void>) | undefined;
  const writeContactDetail = (encounterProjection as Record<string, unknown>).writeContactDetailState as ((input: Record<string, unknown>) => Promise<void>) | undefined;
  assert.equal(typeof upsertNotification, "function");
  assert.equal(typeof writeContactDetail, "function");
  const runtime = { client, workspaceId: W };
  const notification = (actorId: string) => ({ actionHref: null, actorId, contactId: null, dueAt: T1, evidenceIds: ["e1"], now: T1, reminderId: "reminder-1", runtime, title: "Call back", transaction: client });
  await upsertNotification!(notification(A));
  await upsertNotification!(notification(A));
  assert.equal(await owner(pool, "notifications", "reminder-1"), A, "the owner's own re-projection still updates");
  await assert.rejects(() => upsertNotification!(notification(B)), (error: unknown) => (error as { code?: string }).code === "LIVE_RECORD_OWNER_CONFLICT");
  assert.equal(await owner(pool, "notifications", "reminder-1"), A);

  const state = { actorId: A, contactId: "contact-1", notes: [], status: "met", tags: [], updatedAt: T1 };
  await writeContactDetail!({ existingCreatedAt: null, runtime, state, transaction: client });
  const recordId = "contact-detail:actor%3Aa:contact-1";
  assert.equal(await owner(pool, "contact_detail_states", recordId), A);
  // A foreign row under the same id (never produced by the product) must not be taken over.
  await pool.query("update orbit_records set user_id = $1 where record_id = $2", [B, recordId]);
  await assert.rejects(() => writeContactDetail!({ existingCreatedAt: null, runtime, state, transaction: client }), (error: unknown) => (error as { code?: string }).code === "LIVE_RECORD_OWNER_CONFLICT");
  assert.equal(await owner(pool, "contact_detail_states", recordId), B);
});

test("scripts/sync-cloud-records keeps local owners: an owner-less cloud row keeps the local owner, a conflicting one is skipped and fails the run", options, async (t) => {
  const local = await database(t);
  const cloud = await database(t);
  const localStore = local.store;
  await localStore.upsertRecord(record("notes", "same", A, { v: "local" }));
  await localStore.upsertRecord(record("notes", "ownerless", A, { v: "local" }));
  await localStore.upsertRecord(record("notes", "moved", A, { v: "local" }));
  await cloud.store.upsertRecord(record("notes", "same", A, { v: "cloud" }, T1));
  await cloud.store.upsertRecord(record("notes", "ownerless", null, { v: "cloud" }, T1));
  await cloud.store.upsertRecord(record("notes", "moved", B, { v: "cloud" }, T1));
  await cloud.store.upsertRecord(record("notes", "new", B, { v: "cloud" }, T1));
  const url = (schema: string) => {
    const parsed = new URL(databaseUrl!);
    parsed.searchParams.set("options", `-c search_path=${schema}`);
    return parsed.toString();
  };
  const run = execFileAsync("npx", ["tsx", join(__dirname, "../../scripts/sync-cloud-records.ts"), "notes"], {
    cwd: join(__dirname, "../.."),
    env: { ...process.env, ORBIT_CLOUD_DATABASE_URL: url(cloud.schema), ORBIT_EVENT_DATABASE_URL: url(local.schema) },
  });
  const failure = await run.then(() => null, (error: { code?: number; stdout?: string; stderr?: string }) => error);
  assert.ok(failure, "a skipped owner conflict fails the run");
  assert.equal(failure.code, 1);
  assert.match(`${failure.stdout}${failure.stderr}`, /owner conflict.*notes\/moved/i);
  assert.equal(await owner(local.pool, "notes", "same"), A);
  assert.equal(await owner(local.pool, "notes", "ownerless"), A, "an owner-less cloud copy does not clear the local owner");
  assert.equal(await owner(local.pool, "notes", "moved"), A, "a conflicting owner is not copied");
  assert.equal(await owner(local.pool, "notes", "new"), B, "new rows are copied with their owner");
  const moved = await local.pool.query("select payload from orbit_records where record_id = 'moved'");
  assert.deepEqual(moved.rows[0]?.payload, { v: "local" });
  const ownerless = await local.pool.query("select payload from orbit_records where record_id = 'ownerless'");
  assert.deepEqual(ownerless.rows[0]?.payload, { v: "cloud" }, "the rest of the owner-less copy is applied");
});
