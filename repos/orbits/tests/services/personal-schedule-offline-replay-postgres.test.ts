import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createPersonalScheduleAssociationReader } from "../../features/personal-schedule/association-reader";
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from "../../features/notifications/storage/inbox-projection-work";
import { runInboxProjectionPass } from "../../features/notifications/inbox-projection-worker";
import { createInboxRuntime } from "../../features/notifications/inbox-record-service-factory";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPersonalScheduleHandlers } from "../../app/api/schedule-items/personal-handler";

// Sprint 0134: a phone replays its frozen offline schedule requests through the
// existing schedule API. These cases run that API and service on a real
// PostgreSQL schema: replays execute once, stale versions conflict, another
// account's id is refused, and reminders already due at upload time are skipped.
const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: url ? false : "Explicit isolated ORBIT_LIFECYCLE_TEST_DATABASE_URL required", timeout: 30_000 };
const W = "workspace:offline-schedule";
const V3 = { "content-type": "application/json", "x-orbit-personal-schedule-version": "3" };

async function host(prefix: string) {
  assert.ok(url);
  const address = new URL(url);
  assert.ok(["localhost", "127.0.0.1"].includes(address.hostname), "local Postgres only");
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  const pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schema} -c statement_timeout=10000 -c lock_timeout=2000` });
  const client = createTransactionalPostgresClient({ connectionString: url, pool });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
  const clock = { now: "2026-10-03T10:00:00.000Z" };
  const now = () => clock.now;
  const store = createPostgresLiveRecordStore({ client });
  const service = createPersonalScheduleService({
    store, client, workspaceId: W, now,
    inboxProjection: createInboxProjectionWorkRepository({ client, workspaceId: W, now }),
    associationReaderForStore: transactionStore => createPersonalScheduleAssociationReader({ store: transactionStore, workspaceId: W }),
  });
  const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId: W }) });
  let actor = "account:a";
  const handlers = createPersonalScheduleHandlers({ service, resolveActor: async () => ({ id: actor, workspaceId: W }) as never });
  const count = async (sql: string, values: unknown[] = []) => (await pool.query(sql, values)).rows[0].n as number;
  const receipts = (userId: string) => count("select count(*)::int as n from orbit_records where collection_name='personal_schedule_mutations' and user_id=$1", [userId]);
  const scheduledPlans = (userId: string) => count("select count(*)::int as n from orbit_records where collection_name='reminderPlans' and user_id=$1 and payload->'entity'->>'status'='scheduled'", [userId]);
  const allPlans = () => count("select count(*)::int as n from orbit_records where collection_name='reminderPlans'");
  const work = async () => (await pool.query("select source_id, source_revision, generation::text, available_at from orbit_inbox_projection_work order by source_id, source_revision")).rows;
  const row = async (id: string) => (await pool.query("select payload, lifecycle_state, updated_at from orbit_records where collection_name='personal_schedule_items' and record_id=$1", [id])).rows[0];
  async function call(method: "POST" | "PATCH" | "DELETE" | "GET", id: string | null, body?: unknown) {
    const path = id ? `https://orbit.local/api/schedule-items/${encodeURIComponent(id)}` : "https://orbit.local/api/schedule-items";
    const request = new Request(path, { method, headers: V3, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const context = { params: Promise.resolve({ id: id ?? "" }) };
    const response = method === "POST" ? await handlers.POST(request) : method === "PATCH" ? await handlers.PATCH(request, context)
      : method === "DELETE" ? await handlers.DELETE(request, context) : await handlers.GET(request, context);
    return { status: response.status, json: await response.json() as { data?: { scheduleItem: Record<string, string> & { id: string; updatedAt: string }; deleted?: boolean }; error?: { code: string } } };
  }
  return {
    clock, service, notes, receipts, scheduledPlans, allPlans, work, row, call, pool,
    as(id: string) { actor = id; },
    pass: () => runInboxProjectionPass({ client, workspaceId: W, now, enabled: true }),
    inbox: createInboxRuntime({ client, workspaceId: W, now }),
    async close() { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } },
  };
}

test("an offline schedule create, edit and delete each execute once when replayed; plans and inbox work stay single", options, async () => {
  const h = await host("offline_schedule_replay");
  try {
    const note = await h.notes.create({ actorId: "account:a", title: "Agenda", body: "three things", idempotencyKey: "note-create", now: h.clock.now });
    const createBody = { title: "Call Chen", startsAt: "2026-10-04T09:00:00.000Z", endsAt: "2026-10-04T09:30:00.000Z", timeZone: "UTC", reminderMinutes: 15, noteIds: [note.id], idempotencyKey: "ios:personal:create-1" };
    const created = await h.call("POST", null, createBody);
    assert.equal(created.status, 201);
    const item = created.json.data!.scheduleItem;
    assert.deepEqual(item.noteIds, [note.id] as never);
    const afterCreate = { plans: await h.allPlans(), work: await h.work() };
    assert.equal(await h.scheduledPlans("account:a"), 1);
    assert.equal(afterCreate.work.length, 1, "one reminder is projected into the inbox work queue");
    h.clock.now = "2026-10-03T10:05:00.000Z"; // The lost-ack retry arrives later; it must not run again.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const replay = await h.call("POST", null, createBody);
      assert.equal(replay.status, 201);
      assert.deepEqual(replay.json.data, created.json.data);
    }
    assert.equal(await h.receipts("account:a"), 1);
    assert.deepEqual({ plans: await h.allPlans(), work: await h.work() }, afterCreate, "a replayed create adds no plan and no inbox work");

    const updateBody = { expectedUpdatedAt: item.updatedAt, idempotencyKey: "ios:personal:update-1", patch: { title: "Call Chen (moved)", startsAt: "2026-10-04T10:00:00.000Z", endsAt: "2026-10-04T10:30:00.000Z" } };
    const updated = await h.call("PATCH", item.id, updateBody);
    assert.equal(updated.status, 200);
    const afterUpdate = { plans: await h.allPlans(), work: await h.work(), row: await h.row(item.id) };
    assert.equal(await h.scheduledPlans("account:a"), 1, "the moved reminder replaces the old one");
    h.clock.now = "2026-10-03T10:10:00.000Z";
    for (let attempt = 0; attempt < 2; attempt += 1) assert.deepEqual((await h.call("PATCH", item.id, updateBody)).json.data, updated.json.data);
    assert.equal(await h.receipts("account:a"), 2);
    assert.deepEqual({ plans: await h.allPlans(), work: await h.work(), row: await h.row(item.id) }, afterUpdate, "a replayed edit changes nothing");

    const deleteBody = { expectedUpdatedAt: updated.json.data!.scheduleItem.updatedAt, idempotencyKey: "ios:personal:delete-1" };
    const removed = await h.call("DELETE", item.id, deleteBody);
    assert.equal(removed.status, 200);
    assert.equal(removed.json.data!.deleted, true);
    const afterDelete = { plans: await h.allPlans(), work: await h.work(), row: await h.row(item.id) };
    assert.equal(afterDelete.row.lifecycle_state, "deleted");
    assert.equal(await h.scheduledPlans("account:a"), 0, "deleting cancels the pending reminder");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const replay = await h.call("DELETE", item.id, deleteBody);
      assert.equal(replay.status, 200, "a delete replay after a lost 2xx is acknowledged again");
      assert.deepEqual(replay.json.data, removed.json.data);
    }
    assert.equal(await h.receipts("account:a"), 3, "exactly one receipt per mutation");
    assert.deepEqual({ plans: await h.allPlans(), work: await h.work(), row: await h.row(item.id) }, afterDelete);
  } finally { await h.close(); }
});

test("stale offline schedule edits and deletes conflict, both versions survive, and another account's id is refused", options, async () => {
  const h = await host("offline_schedule_conflict");
  try {
    const created = await h.call("POST", null, { title: "Original", startsAt: "2026-10-05T01:00:00.000Z", idempotencyKey: "ios:personal:create-a" });
    assert.equal(created.status, 201);
    const original = created.json.data!.scheduleItem;
    h.clock.now = "2026-10-03T10:01:00.000Z";
    const web = await h.call("PATCH", original.id, { expectedUpdatedAt: original.updatedAt, idempotencyKey: "web:edit", patch: { title: "Web title" } });
    assert.equal(web.status, 200);
    const current = await h.row(original.id);
    const receiptsBefore = await h.receipts("account:a");

    h.clock.now = "2026-10-03T10:02:00.000Z";
    const staleEdit = await h.call("PATCH", original.id, { expectedUpdatedAt: original.updatedAt, idempotencyKey: "ios:personal:stale-edit", patch: { title: "Phone title" } });
    assert.equal(staleEdit.status, 409);
    assert.equal(staleEdit.json.error!.code, "CONFLICT");
    const staleDelete = await h.call("DELETE", original.id, { expectedUpdatedAt: original.updatedAt, idempotencyKey: "ios:personal:stale-delete" });
    assert.equal(staleDelete.status, 409);
    assert.deepEqual(await h.row(original.id), current, "the web version is untouched by both stale requests");
    assert.equal(await h.receipts("account:a"), receiptsBefore, "a conflict leaves no receipt, so a retry is not short-circuited");

    // Keeping the phone version re-sends it against the server snapshot under a new key: both edits are in history.
    const snapshot = await h.call("GET", original.id);
    assert.equal(snapshot.json.data!.scheduleItem.title, "Web title");
    const kept = await h.call("PATCH", original.id, { expectedUpdatedAt: snapshot.json.data!.scheduleItem.updatedAt, idempotencyKey: "ios:personal:keep-local", patch: { title: "Phone title" } });
    assert.equal(kept.status, 200);
    assert.equal(kept.json.data!.scheduleItem.title, "Phone title");

    // Another account replays requests against A's schedule id.
    h.as("account:b");
    const foreignEdit = await h.call("PATCH", original.id, { expectedUpdatedAt: kept.json.data!.scheduleItem.updatedAt, idempotencyKey: "ios:personal:foreign-edit", patch: { title: "B was here" } });
    const foreignDelete = await h.call("DELETE", original.id, { expectedUpdatedAt: kept.json.data!.scheduleItem.updatedAt, idempotencyKey: "ios:personal:foreign-delete" });
    const foreignRead = await h.call("GET", original.id);
    assert.deepEqual([foreignEdit.status, foreignDelete.status, foreignRead.status], [404, 404, 404]);
    assert.equal(foreignEdit.json.error!.code, "NOT_FOUND");
    // The same idempotency key under another account is its own create, never A's receipt.
    const sameKey = await h.call("POST", null, { title: "Original", startsAt: "2026-10-05T01:00:00.000Z", idempotencyKey: "ios:personal:create-a" });
    assert.equal(sameKey.status, 201);
    assert.notEqual(sameKey.json.data!.scheduleItem.id, original.id);
    assert.equal(sameKey.json.data!.scheduleItem.ownerUserId, "account:b");
    h.as("account:a");
    const owned = await h.row(original.id);
    assert.equal(owned.payload.title, "Phone title");
    assert.equal(owned.payload.ownerUserId, "account:a");
    assert.equal(await h.receipts("account:b"), 1, "B's refused requests left no receipt");

    // Server-side guards behind the App's online-only rules.
    const series = await h.call("POST", null, { title: "Daily", startsAt: "2026-10-05T02:00:00.000Z", timeZone: "UTC", recurrence: { frequency: "daily", until: "2026-10-09" }, idempotencyKey: "web:series" });
    assert.equal(series.status, 201);
    const unscoped = await h.call("PATCH", series.json.data!.scheduleItem.id, { expectedUpdatedAt: series.json.data!.scheduleItem.updatedAt, idempotencyKey: "ios:personal:series-edit", patch: { title: "No scope" } });
    assert.equal(unscoped.status, 400, "a repeating series cannot be edited without a scope");
    const before = await h.receipts("account:a");
    const localNote = await h.call("POST", null, { title: "Local ref", startsAt: "2026-10-05T03:00:00.000Z", noteIds: ["local:7f3a0000-0000-4000-8000-000000000001"], idempotencyKey: "ios:personal:local-ref" });
    assert.equal(localNote.status, 400, "a temporary note id never reaches storage");
    assert.equal(await h.receipts("account:a"), before);
  } finally { await h.close(); }
});

test("a schedule created offline whose reminder time passed before upload creates no due reminder", options, async () => {
  const h = await host("offline_schedule_expired");
  try {
    h.clock.now = "2026-10-03T10:00:00.000Z"; // Upload time. The phone queued these at 09:00 while offline.
    const elapsedLead = await h.call("POST", null, { title: "Starts soon", startsAt: "2026-10-03T10:10:00.000Z", timeZone: "UTC", reminderMinutes: 15, idempotencyKey: "ios:personal:elapsed-lead" });
    const alreadyStarted = await h.call("POST", null, { title: "Already started", startsAt: "2026-10-03T09:30:00.000Z", endsAt: "2026-10-03T10:30:00.000Z", timeZone: "UTC", reminderMinutes: 5, idempotencyKey: "ios:personal:started" });
    assert.deepEqual([elapsedLead.status, alreadyStarted.status], [201, 201]);
    assert.equal(elapsedLead.json.data!.scheduleItem.reminderMinutes as unknown, 15, "the reminder setting itself is kept");
    assert.equal(await h.allPlans(), 0, "no reminder plan is created for a fire time already in the past");
    assert.equal((await h.work()).length, 0, "nothing is queued for the inbox");
    assert.equal((await h.pass()).projectionClaimed, 0);
    assert.equal((await h.inbox.service.list("account:a", { limit: 10 })).items.length, 0, "no reminder is sent late");

    const future = await h.call("POST", null, { title: "Later", startsAt: "2026-10-03T11:00:00.000Z", timeZone: "UTC", reminderMinutes: 15, idempotencyKey: "ios:personal:future" });
    assert.equal(future.status, 201);
    assert.equal(await h.scheduledPlans("account:a"), 1, "a reminder still ahead is planned as usual");
    const fireAt = (await h.work())[0]?.available_at as Date;
    assert.equal(new Date(fireAt).toISOString(), "2026-10-03T10:45:00.000Z");
  } finally { await h.close(); }
});
