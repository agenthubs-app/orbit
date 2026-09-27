import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createDomainCursorCodec } from "../../features/sync/domain-cursor";
import { createDomainReadService, domainGeneration } from "../../features/sync/domain-read-service";
import { SYNC_REGISTRY_VERSION } from "../../features/sync/domain-registry";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { domainPageSchema } from "../../shared/api-schema/universal-read";
import { personalScheduleSchema } from "../../shared/api-schema/personal-schedule";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0108, SC-03: this local Postgres plays the server holding two
// accounts. Product services write notes, tasks and personal schedules under
// the strict trigger; each "device" follows its bookmark through the real sync
// route handlers and keeps what it receives, the way the App mirror does.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:notes-schedule-topology";
const A = "actor:a";
const B = "actor:b";
const SECRET = "notes-schedule-topology-secret-0123456789abcdef0123";
let clock = "2026-09-27T01:00:00.000Z";

async function host(t: TestContext) {
  clock = "2026-09-27T01:00:00.000Z";
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `notes_schedule_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  for (const actor of [A, B]) {
    await store.upsertRecord({ workspaceId: W, collectionName: "accounts", recordId: actor, userId: actor, sourceType: "manual", sourceId: actor, evidenceIds: [], lifecycleState: "active", createdAt: clock, updatedAt: clock, payload: { id: actor } });
  }
  const now = () => clock;
  const service = createDomainReadService({ client, cursorSecret: SECRET, now });
  const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId: W }) });
  const tasks = createTaskService({ repository: createTaskRepository({ store, workspaceId: W, transactionClient: client }) });
  const schedule = createPersonalScheduleService({ store, client, workspaceId: W, now });
  const handlersFor = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.parse(clock),
  });
  return { pool, store, notes, tasks, schedule, handlersFor };
}

type Host = Awaited<ReturnType<typeof host>>;

/** A device's mirror of one domain: follows its cursor, applies upserts and deletes. */
function device(h: Host, actor: string, domainId: "notes" | "tasks" | "personal-schedule") {
  const rows = new Map<string, Record<string, unknown>>();
  let cursor: string | undefined;
  return {
    rows,
    async pull(): Promise<{ upserts: number; deletes: number }> {
      let upserts = 0, deletes = 0;
      for (let page = 0; page < 20; page += 1) {
        const response = await h.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${domainId}?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), domainId);
        assert.equal(response.status, 200);
        const data = domainPageSchema.parse(((await response.json()) as { data: unknown }).data);
        for (const change of data.changes) {
          if (change.operation === "upsert") { rows.set(change.id, change.payload!); upserts += 1; }
          else { rows.delete(change.id); deletes += 1; }
        }
        cursor = data.nextCursor;
        if (!data.hasMore) return { upserts, deletes };
      }
      throw new Error("pagination did not terminate");
    },
  };
}

async function seed(h: Host) {
  const ids = { a: { notes: [] as string[], schedules: [] as string[] }, b: { notes: [] as string[], schedules: [] as string[] } };
  for (const [actor, bucket, count] of [[A, ids.a, 3], [B, ids.b, 2]] as const) {
    for (let n = 0; n < count; n += 1) {
      bucket.notes.push((await h.notes.create({ actorId: actor, title: `${actor} note ${n}`, body: `private body ${actor} ${n}`, idempotencyKey: `note:${actor}:${n}`, now: clock })).id);
      bucket.schedules.push((await h.schedule.create(actor, { title: `${actor} plan ${n}`, startsAt: "2026-09-28T01:00:00.000Z", idempotencyKey: `schedule:${actor}:${n}` })).scheduleItem.id);
    }
  }
  return ids;
}

test("isolation: each account's device holds only its own notes and personal schedules", options, async (t) => {
  const h = await host(t);
  const ids = await seed(h);
  for (const [actor, own, other] of [[A, ids.a, ids.b], [B, ids.b, ids.a]] as const) {
    const notes = device(h, actor, "notes");
    const schedules = device(h, actor, "personal-schedule");
    await notes.pull();
    await schedules.pull();
    assert.deepEqual([...notes.rows.keys()].sort(), [...own.notes].sort());
    assert.deepEqual([...schedules.rows.keys()].sort(), [...own.schedules].sort());
    for (const payload of [...notes.rows.values(), ...schedules.rows.values()]) assert.equal(payload.accountId, actor);
    assert.ok(![...notes.rows.keys(), ...schedules.rows.keys()].some((id) => other.notes.includes(id) || other.schedules.includes(id)));
    assert.ok(!JSON.stringify([...notes.rows.values()]).includes(actor === A ? "actor:b" : "actor:a"), "no other account's text reaches the device");
    for (const payload of schedules.rows.values()) assert.equal(personalScheduleSchema.safeParse(payload).success, true, "mirror rows are the App's personal DTO");
  }
});

test("incremental: first pull is complete, one edit transfers one row, the next pull transfers none", options, async (t) => {
  const h = await host(t);
  const ids = await seed(h);
  const notes = device(h, A, "notes");
  assert.deepEqual(await notes.pull(), { upserts: 3, deletes: 0 });
  clock = "2026-09-27T01:10:00.000Z";
  await h.notes.update({ actorId: A, noteId: ids.a.notes[1]!, body: "edited on the web", expectedVersion: 1, idempotencyKey: "note:edit", now: clock });
  assert.deepEqual(await notes.pull(), { upserts: 1, deletes: 0 });
  assert.equal(notes.rows.get(ids.a.notes[1]!)?.body, "edited on the web");
  assert.deepEqual(await notes.pull(), { upserts: 0, deletes: 0 });
  // B's edit does not move A's bookmark.
  await h.notes.update({ actorId: B, noteId: ids.b.notes[0]!, body: "B edits", expectedVersion: 1, idempotencyKey: "note:edit:b", now: clock });
  assert.deepEqual(await notes.pull(), { upserts: 0, deletes: 0 });
});

test("deletion: a deleted schedule, task and note disappear from the device on the next pull", options, async (t) => {
  const h = await host(t);
  const ids = await seed(h);
  const schedules = device(h, A, "personal-schedule");
  const notes = device(h, A, "notes");
  const tasks = device(h, A, "tasks");
  const task = await h.tasks.create({ actorId: A, title: "T", category: "work", idempotencyKey: "task:1", now: clock });
  await schedules.pull(); await notes.pull(); await tasks.pull();
  assert.ok(schedules.rows.has(ids.a.schedules[0]!) && notes.rows.has(ids.a.notes[0]!) && tasks.rows.has(task.task.id));
  const item = await h.schedule.get({ actorId: A, id: ids.a.schedules[0]! });
  await h.schedule.remove(A, item.id, { expectedUpdatedAt: item.updatedAt, idempotencyKey: "schedule:delete" });
  await h.tasks.delete({ actorId: A, taskId: task.task.id, idempotencyKey: "task:delete", now: clock });
  // Notes have no delete endpoint; a soft delete through the store is what any future one would write.
  await h.store.deleteRecord({ workspaceId: W, collectionName: "notes", recordId: ids.a.notes[0]!, deletedAt: "2026-09-27T01:20:00.000Z", userId: A });
  assert.deepEqual(await schedules.pull(), { upserts: 0, deletes: 1 });
  assert.deepEqual(await tasks.pull(), { upserts: 0, deletes: 1 });
  assert.deepEqual(await notes.pull(), { upserts: 0, deletes: 1 });
  assert.equal(schedules.rows.has(ids.a.schedules[0]!), false);
  assert.equal(tasks.rows.has(task.task.id), false);
  assert.equal(notes.rows.has(ids.a.notes[0]!), false);
  assert.equal(schedules.rows.size, 2);
});

test("a recurring series carries its occurrence exceptions, and a new exception re-sends the series", options, async (t) => {
  const h = await host(t);
  const created = await h.schedule.create(A, { title: "Weekly 1:1", startsAt: "2026-09-28T01:00:00.000Z", endsAt: "2026-09-28T02:00:00.000Z", timeZone: "Asia/Tokyo", recurrence: { frequency: "weekly" }, idempotencyKey: "weekly" });
  const series = device(h, A, "personal-schedule");
  await series.pull();
  const first = series.rows.get(created.scheduleItem.id)!;
  assert.deepEqual(first.recurrence, { frequency: "weekly" });
  assert.equal(first.timeZone, "Asia/Tokyo");
  assert.equal(Object.hasOwn(first, "occurrenceExceptions"), false, "no exceptions yet");
  const occurrenceId = `${created.scheduleItem.id}:occurrence:2026-10-05`;
  const occurrence = await h.schedule.get({ actorId: A, id: occurrenceId });
  await h.schedule.remove(A, occurrenceId, { expectedUpdatedAt: occurrence.updatedAt, idempotencyKey: "cancel-one", scope: "occurrence" });
  const moved = await h.schedule.get({ actorId: A, id: `${created.scheduleItem.id}:occurrence:2026-10-12` });
  await h.schedule.update(A, moved.id, { expectedUpdatedAt: moved.updatedAt, idempotencyKey: "move-one", scope: "occurrence", patch: { title: "Moved 1:1", startsAt: "2026-10-13T01:00:00.000Z", endsAt: "2026-10-13T02:00:00.000Z" } });
  assert.deepEqual(await series.pull(), { upserts: 1, deletes: 0 }, "the series row itself is re-sent once");
  const after = series.rows.get(created.scheduleItem.id)!;
  assert.deepEqual(after.occurrenceExceptions, [
    { occurrenceDate: "2026-10-05", cancelled: true, patch: {} },
    { occurrenceDate: "2026-10-12", cancelled: false, patch: { title: "Moved 1:1", startsAt: "2026-10-13T01:00:00.000Z", endsAt: "2026-10-13T02:00:00.000Z" } },
  ]);
  const { occurrenceExceptions: _exceptions, ...dto } = after;
  assert.equal(personalScheduleSchema.safeParse(dto).success, true);
});

test("a bookmark issued under the previous page schema is refused, so old devices rebuild once", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const lease = await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"));
  const epoch = ((await lease.json()) as { data: { grants: { authorizationEpoch: string }[] } }).data.grants[0]!.authorizationEpoch;
  const oldCursor = createDomainCursorCodec({ secret: SECRET }).encode({
    actorId: A, workspaceId: W, domainId: "notes", authorizationEpoch: epoch, generation: domainGeneration(epoch), schemaVersion: 1, registryVersion: SYNC_REGISTRY_VERSION, afterRevision: "0", highWatermark: "0",
  }, Date.parse(clock));
  const response = await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/notes?cursor=${encodeURIComponent(oldCursor)}`), "notes");
  assert.equal(response.status, 409);
});
