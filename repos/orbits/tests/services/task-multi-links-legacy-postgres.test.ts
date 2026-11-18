/**
 * agent-design AG13-5 through PostgreSQL (random schema, loopback only; PLANNER 易错边界 5): a to-do's people and events as
 * lists, and the old clients beside them.
 *
 * - A to-do written before AG13 (single fields) reads as lists of zero or one; nothing is written into it by reading.
 * - The lists mirror their first person and first platform event into the single fields.
 * - An old client that sends only a title (PATCH /api/tasks/:id, the old endpoint) leaves both lists as they are; an old
 *   client's offline replay of the same request returns the first result.
 * - An old client that changes the single person replaces only that mirrored item; the other people stay.
 * - An old to-do changed by an old client keeps the old shape (no lists appear).
 * - A private event of another account, or one that does not exist, cannot be linked.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { createTaskDetailHandlers } from "../../app/api/tasks/[id]/handler";
import { createPrivateEventService } from "../../features/events/private-events/service";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { taskLinksOf } from "../../features/tasks/task-links";
import { TODO_DOMAIN } from "../../features/agent-v1/domains/todo/read";
import { ORBIT_AGENT_V1_EVENTS_SCHEMA_SQL, ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "no local test database";
const WS = "workspace:task-links";
const ACTOR = "actor:a";
const schema = `task_links_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;
let client: TransactionalPostgresClient;
let clock = Date.parse("2026-11-15T01:00:00.000Z");
const now = () => new Date((clock += 1000)).toISOString();

before(async () => {
  if (!databaseUrl) return;
  assert.ok(/^(localhost|127\.0\.0\.1|\[::1\])$/u.test(new URL(databaseUrl).hostname), "loopback database only");
  pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema}` });
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

function kit() {
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  const tasks = createTaskService({ repository: createTaskRepository({ store, transactionClient: client, workspaceId: WS }) });
  const handlers = createTaskDetailHandlers({ now, resolveActor: async () => ({ id: ACTOR }) as never, service: tasks });
  const patch = async (id: string, body: Record<string, unknown>) => {
    const response = await handlers.PATCH(new Request(`http://local/api/tasks/${id}`, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "PATCH" }), { params: Promise.resolve({ id }) });
    return { body: (await response.json()) as { data?: { task?: Record<string, unknown> }; error?: { code?: string } }, status: response.status };
  };
  const stored = async (id: string) => (await pool.query("select payload from orbit_records where workspace_id = $1 and collection_name = 'tasks' and record_id = $2", [WS, id])).rows[0]?.payload.task as Record<string, unknown>;
  return { events: createPrivateEventService({ client, now, store, workspaceId: WS }), patch, store, stored, tasks };
}

test("an older to-do reads as lists of one; an old client's title change keeps it in the old shape", { skip }, async () => {
  const { patch, stored, tasks } = kit();
  const old = (await tasks.create({ actorId: ACTOR, category: "relationship", idempotencyKey: "old", now: now(), relatedContactId: "contact:c17", relatedEventId: "event:e1", title: "给小林发修订报价" })).task;
  assert.deepEqual(taskLinksOf(old), { contactIds: ["contact:c17"], eventRefs: [{ id: "event:e1", kind: "platform" }] });
  const fields = TODO_DOMAIN.fieldsOf({ payload: { task: old } } as never) as Record<string, unknown>;
  assert.deepEqual([fields.contactIds, fields.eventRefs], [["contact:c17"], ["platform:event:e1"]], "the Agent's read sees the lists");
  const result = await patch(old.id, { action: "update", expectedUpdatedAt: old.updatedAt, idempotencyKey: "old:title", patch: { title: "给小林发修订报价（实施费单列）" } });
  assert.equal(result.status, 200);
  const after = await stored(old.id);
  assert.equal(after.title, "给小林发修订报价（实施费单列）");
  assert.equal("relatedContactIds" in after, false, "no lists are written into an older to-do");
  assert.equal(after.relatedContactId, "contact:c17");
});

test("lists mirror their first items; an old client's title-only edit and its offline replay keep both lists", { skip }, async () => {
  const { events, patch, stored, tasks } = kit();
  const reunion = await events.create(ACTOR, { idempotencyKey: "p1", startsAt: "2026-11-08T09:00:00.000Z", title: "大学同学聚会" });
  const todo = (await tasks.create({ actorId: ACTOR, category: "relationship", idempotencyKey: "t48", now: now(), relatedEventRefs: [{ id: reunion.id, kind: "private" }], title: "联系老周" })).task;
  const linked = await tasks.update({ actorId: ACTOR, expectedUpdatedAt: todo.updatedAt, idempotencyKey: "t48:links", now: now(), patch: { relatedContactIds: ["contact:c31", "contact:c41", "contact:c31"], relatedEventRefs: [{ id: reunion.id, kind: "private" }, { id: "event:e105", kind: "platform" }] }, taskId: todo.id });
  assert.deepEqual(linked.task.relatedContactIds, ["contact:c31", "contact:c41"], "de-duplicated in order");
  assert.equal(linked.task.relatedContactId, "contact:c31", "the first person is mirrored");
  assert.equal(linked.task.relatedEventId, "event:e105", "the first platform event is mirrored (a private one has no single field)");
  const body = { action: "update", expectedUpdatedAt: linked.task.updatedAt, idempotencyKey: "app:offline:1", patch: { title: "联系老周聊独立出版" } };
  const first = await patch(todo.id, body);
  assert.equal(first.status, 200);
  const replay = await patch(todo.id, body);
  assert.equal(replay.status, 200, "the offline queue's replay of the same request");
  assert.deepEqual(replay.body.data?.task, first.body.data?.task, "returns the first result");
  const after = await stored(todo.id);
  assert.equal(after.title, "联系老周聊独立出版");
  assert.deepEqual(after.relatedContactIds, ["contact:c31", "contact:c41"]);
  assert.deepEqual(after.relatedEventRefs, [{ id: reunion.id, kind: "private" }, { id: "event:e105", kind: "platform" }]);
});

test("an old client changing the single person replaces only the mirrored item; the others stay", { skip }, async () => {
  const { patch, stored, tasks } = kit();
  const todo = (await tasks.create({ actorId: ACTOR, category: "relationship", idempotencyKey: "lt11", now: now(), relatedContactIds: ["contact:lc01", "contact:lc05"], title: "准备曜石终面的候选人材料" })).task;
  const result = await patch(todo.id, { action: "update", expectedUpdatedAt: todo.updatedAt, idempotencyKey: "app:contact", patch: { relatedContactId: "contact:lc06" } });
  assert.equal(result.status, 200);
  const after = await stored(todo.id);
  assert.deepEqual(after.relatedContactIds, ["contact:lc06", "contact:lc05"]);
  assert.equal(after.relatedContactId, "contact:lc06");
});

test("a private event that is not the account's, or does not exist, cannot be linked", { skip }, async () => {
  const { events, patch, tasks } = kit();
  const theirs = await events.create("actor:b", { idempotencyKey: "pb", startsAt: "2026-11-08T09:00:00.000Z", title: "别人的聚会" });
  const todo = (await tasks.create({ actorId: ACTOR, category: "work", idempotencyKey: "tx", now: now(), title: "x" })).task;
  for (const id of [theirs.id, "private_event:none"]) {
    const result = await patch(todo.id, { action: "update", expectedUpdatedAt: todo.updatedAt, idempotencyKey: `link:${id}`, patch: { relatedEventRefs: [{ id, kind: "private" }] } });
    assert.equal(result.status, 400, id);
  }
  const bad = await patch(todo.id, { action: "update", expectedUpdatedAt: todo.updatedAt, idempotencyKey: "link:bad", patch: { relatedEventRefs: [{ id: "x", kind: "other" }] } });
  assert.equal(bad.status, 400, "an unknown kind of event reference");
});
