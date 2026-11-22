/**
 * agent-design AG13-4 through PostgreSQL (random schema, loopback only; PLANNER 易错边界 4): deleting a private event.
 *
 * - Its references of the four kinds (attendance notes, memos, to-dos, schedule items) are listed, by index.
 * - With any reference left, the event is kept and the references are said; after unlinking and deleting them it goes.
 * - A reference added at the moment of deletion never dangles: the to-do's write and the deletion take the same locks, so
 *   either the to-do links an event that is still there, or the event is gone and the to-do's link was refused.
 * - Restoring brings the event back alone (never its former links).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { createAttendanceService } from "../../features/events/attendance-notes/service";
import { createPrivateEventService, type PrivateEventService } from "../../features/events/private-events/service";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService, TaskServiceError } from "../../features/tasks/service";
import { ORBIT_AGENT_V1_EVENTS_SCHEMA_SQL, ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "no local test database";
const WS = "workspace:private-event-delete";
const ACTOR = "actor:a";
const schema = `private_event_delete_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;
let client: TransactionalPostgresClient;
let clock = Date.parse("2026-11-15T01:00:00.000Z");
const now = () => new Date((clock += 1)).toISOString();

before(async () => {
  if (!databaseUrl) return;
  assert.ok(/^(localhost|127\.0\.0\.1|\[::1\])$/u.test(new URL(databaseUrl).hostname), "loopback database only");
  pool = new Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema}` });
  await pool.query(`create schema ${schema}`);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await pool.query(ORBIT_AGENT_V1_EVENTS_SCHEMA_SQL);
  client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as unknown as TransactionalPostgresPool });
});

after(async () => {
  if (!databaseUrl) return;
  await pool.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await pool.end();
});

function services() {
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  return {
    attendance: createAttendanceService({ client, now, store, workspaceId: WS }),
    events: createPrivateEventService({ client, now, store, workspaceId: WS }),
    notes: createNoteService({ repository: createNoteRepository({ store, workspaceId: WS }) }),
    schedule: createPersonalScheduleService({ client, now, store, workspaceId: WS }),
    store,
    tasks: createTaskService({ repository: createTaskRepository({ store, transactionClient: client, workspaceId: WS }) }),
  };
}

async function eventWithFourReferences(kit: ReturnType<typeof services>, key: string) {
  const event = await kit.events.create(ACTOR, { idempotencyKey: key, startsAt: "2026-11-08T09:00:00.000Z", title: "大学同学聚会", venue: "新宿" });
  const ref = { id: event.id, kind: "private" as const };
  const note = await kit.attendance.create(ACTOR, { attendedOn: "2026-11-08", dayParts: ["evening"], eventRef: ref, idempotencyKey: `${key}:a` });
  const memo = await kit.notes.create({ actorId: ACTOR, body: "同学聚会上听说老周在做独立出版，回头联系。", contactIds: [], idempotencyKey: `${key}:m`, now: now() });
  // A memo's private link is put on by the record itself here (the note service only removes one).
  const repository = createNoteRepository({ store: kit.store, workspaceId: WS });
  const stored = (await repository.get(ACTOR, memo.id))!;
  await repository.saveIfVersion({ ...stored, note: { ...stored.note, eventRefs: [ref] } }, { updatedAt: stored.note.updatedAt, version: stored.note.version });
  const todo = (await kit.tasks.create({ actorId: ACTOR, category: "relationship", idempotencyKey: `${key}:t`, now: now(), relatedEventRefs: [ref], title: "联系老周" })).task;
  const item = (await kit.schedule.create(ACTOR, { eventRefs: [ref], idempotencyKey: `${key}:s`, startsAt: "2026-11-08T09:00:00.000Z", title: "同学聚会" } as never)).scheduleItem;
  return { event, item, memo, note, todo };
}

test("the four kinds of reference are listed; with any left the event is kept and says which", { skip }, async () => {
  const kit = services();
  const { event, item, memo, note, todo } = await eventWithFourReferences(kit, "e1");
  const references = await kit.events.references(ACTOR, event.id);
  assert.deepEqual(references.map((ref) => [ref.kind, ref.id]).sort(), [["attendance", note.id], ["memo", memo.id], ["schedule", item.id], ["todo", todo.id]].sort());
  assert.equal(references.find((ref) => ref.kind === "todo")?.label, "联系老周");
  const kept = await kit.events.delete(ACTOR, event.id);
  assert.equal(kept.deleted, false);
  assert.equal((kept as { references: unknown[] }).references.length, 4);
  assert.ok(await kit.events.get(ACTOR, event.id), "still there");
  // Unlink and delete what links to it (what a card does before its last item), then the event goes.
  await kit.attendance.delete(ACTOR, note.id);
  const currentMemo = (await createNoteRepository({ store: kit.store, workspaceId: WS }).get(ACTOR, memo.id))!.note;
  const unlinked = await kit.notes.update({ actorId: ACTOR, eventRefs: [], expectedVersion: currentMemo.version, idempotencyKey: "e1:m:unlink", noteId: memo.id, now: now() });
  assert.equal(unlinked.body, "同学聚会上听说老周在做独立出版，回头联系。", "the memo's text is untouched");
  const task = (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!;
  const updated = await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: task.updatedAt, idempotencyKey: "e1:t:unlink", now: now(), patch: { relatedEventRefs: [] }, taskId: todo.id });
  assert.equal(updated.task.status, "open", "the to-do itself is unchanged");
  const current = await kit.schedule.get({ actorId: ACTOR, id: item.id });
  await kit.schedule.update(ACTOR, item.id, { expectedUpdatedAt: current.updatedAt, idempotencyKey: "e1:s:unlink", patch: { eventRefs: null } } as never);
  assert.deepEqual(await kit.events.references(ACTOR, event.id), []);
  const gone = await kit.events.delete(ACTOR, event.id, { expectedVersion: event.version });
  assert.equal(gone.deleted, true);
  assert.equal(await kit.events.get(ACTOR, event.id), null);
  // Restoring brings the event back alone.
  const restored = await kit.events.restore(ACTOR, event.id);
  assert.equal(restored.id, event.id);
  assert.deepEqual(await kit.events.references(ACTOR, event.id), [], "its former links are not brought back");
});

test("a to-do linking the event at the moment it is deleted never leaves a dangling link (20 races)", { skip }, async () => {
  const kit = services();
  for (let round = 0; round < 20; round += 1) {
    const event = await kit.events.create(ACTOR, { idempotencyKey: `race:${round}`, startsAt: "2026-11-08T09:00:00.000Z", title: `聚会${round}` });
    const todo = (await kit.tasks.create({ actorId: ACTOR, category: "work", idempotencyKey: `race:${round}:t`, now: now(), title: `待办${round}` })).task;
    const link = kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: todo.updatedAt, idempotencyKey: `race:${round}:link`, now: now(), patch: { relatedEventRefs: [{ id: event.id, kind: "private" }] }, taskId: todo.id }).then(() => "linked", (error: unknown) => (error instanceof TaskServiceError && error.code === "TASK_INVALID_LINK" ? "refused" : Promise.reject(error)));
    const removal = (kit.events as PrivateEventService).delete(ACTOR, event.id);
    const [linked, deleted] = await Promise.all([link, removal]);
    const stillThere = await kit.events.get(ACTOR, event.id);
    const task = (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!;
    const links = (task.relatedEventRefs ?? []).filter((ref) => ref.id === event.id);
    if (deleted.deleted) {
      assert.equal(stillThere, null);
      assert.equal(linked, "refused", `round ${round}: the event was deleted, so the to-do's link was refused`);
      assert.equal(links.length, 0);
    } else {
      assert.ok(stillThere, `round ${round}: kept because the to-do linked it first`);
      assert.equal(linked, "linked");
      assert.equal(links.length, 1);
    }
  }
});

test("the reverse lookups go by index (planner with sequential scans off)", { skip }, async () => {
  const run = async (sql: string, value: string) => {
    const tx = await pool.connect();
    try {
      await tx.query("begin");
      await tx.query("set local enable_seqscan = off");
      const plan = (await tx.query(`explain ${sql}`, [WS, ACTOR, value])).rows.map((row) => String(row["QUERY PLAN"])).join("\n");
      await tx.query("rollback");
      return plan;
    } finally {
      tx.release();
    }
  };
  const ref = JSON.stringify([{ id: "private_event:x", kind: "private" }]);
  assert.match(await run("select record_id from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'tasks' and lifecycle_state <> 'deleted' and (payload->'task'->'relatedEventRefs') @> $3::jsonb", ref), /Index Scan|Bitmap Index Scan/u);
  assert.match(await run("select record_id from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'notes' and lifecycle_state <> 'deleted' and (payload->'note'->'eventRefs') @> $3::jsonb", ref), /Index Scan|Bitmap Index Scan/u);
  assert.match(await run("select record_id from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'personal_schedule_items' and lifecycle_state <> 'deleted' and (payload->'eventRefs') @> $3::jsonb", ref), /Index Scan|Bitmap Index Scan/u);
  assert.match(await run("select record_id from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'event_attendance_notes' and lifecycle_state <> 'deleted' and (payload->'eventRef'->>'kind') = 'private' and (payload->'eventRef'->>'id') = ($3::jsonb->>'id')", JSON.stringify({ id: "private_event:x", kind: "private" })), /orbit_records_attendance_event_uidx/u);
});
