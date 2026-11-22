import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { applyApprovedTodoUpdate } from "../../features/agent-v1/domains/todo/write";
import { ACTOR, createCardKit, decide, freeze } from "../services/agent-ledger-card-kit";

/**
 * agent-design AG06-3 against a real PostgreSQL schema (local test database only): the to-do update
 * executor re-reads the record when it runs.
 * - Another field changed since the card was shown: it writes anyway, against the version just read.
 * - A value the card showed changed: nothing is written (a permanent failure, not retried).
 * - The multi-value links a record already has (relatedContactIds, relatedEventRefs) are kept.
 * - The same operation key again writes nothing new (the to-do service's mutation receipt).
 * - Before the click nothing is written.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `agent_v1_todo_${randomUUID().replaceAll("-", "")}`;
const workspaceId = `workspace:agent-v1-todo:${schema}`;

let admin: Pool;
let pool: Pool;
let client: TransactionalPostgresClient;

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  pool = new Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema} -c statement_timeout=20000` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  await runOrbitRecordsMigration(client);
}, { timeout: 120_000 });

after(async () => {
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

async function storedTask(taskId: string) {
  const result = await pool.query("select payload from orbit_records where collection_name = 'tasks' and record_id = $1", [taskId]);
  return (result.rows[0]?.payload as { task: Record<string, unknown> } | undefined)?.task ?? null;
}

test("another field changed after the card was shown: the update still writes, against the version read now", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId });
  const todo = await kit.todo("给小林发修订报价", "2026-11-18");
  const card = await freeze(kit, [{ capability: "todo.update", set: { plannedDate: "2026-11-20" }, targetId: todo.id }]);
  assert.equal((await storedTask(todo.id))?.plannedDate, "2026-11-18", "nothing is written before the click");
  // Another device changes a field the card did not show — before the click, and again between the click and the run.
  const current = (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!;
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: current.updatedAt, idempotencyKey: "other-device", now: kit.now(), patch: { notes: "先确认实施费" } as never, taskId: todo.id });
  assert.equal((await decide(kit, card, "confirm", "decision:1"))?.accepted, true);
  const clicked = (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!;
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: clicked.updatedAt, idempotencyKey: "other-device-late", now: kit.now(), patch: { notes: "实施费单列" } as never, taskId: todo.id });
  await kit.runtime.processOutbox({ actionId: card.actionId });
  const after = await storedTask(todo.id);
  assert.equal(after?.plannedDate, "2026-11-20");
  assert.equal(after?.title, "给小林发修订报价");
});

test("a value the card showed changed by the time it runs: nothing is written, the item fails for good", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId });
  const todo = await kit.todo("约山本吃饭", "2026-11-18");
  const stored = (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!;
  const payload = { before: { plannedDate: "2026-11-18" }, patch: { plannedDate: "2026-11-21" }, shown: { title: "约山本吃饭" }, taskId: todo.id };
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: stored.updatedAt, idempotencyKey: "other-device-2", now: kit.now(), patch: { plannedDate: "2026-11-19" }, taskId: todo.id });
  await assert.rejects(applyApprovedTodoUpdate({ actorId: ACTOR, tasks: kit.tasks }, payload, { idempotencyKey: "action:x:r1:op1", now: kit.now() }), (error: unknown) => (error as { code?: string }).code === "EXECUTION_PERMANENT" && /plannedDate changed/u.test(String((error as Error).message)));
  assert.equal((await storedTask(todo.id))?.plannedDate, "2026-11-19", "the other device's value stays");
  await kit.tasks.update({ actorId: ACTOR, expectedUpdatedAt: (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!.updatedAt, idempotencyKey: "rename-2", now: kit.now(), patch: { plannedDate: "2026-11-18", title: "约山本吃午饭" }, taskId: todo.id });
  await assert.rejects(applyApprovedTodoUpdate({ actorId: ACTOR, tasks: kit.tasks }, payload, { idempotencyKey: "action:x:r1:op1", now: kit.now() }), /renamed/u, "the name the card showed changed");
});

test("multi-value links on the record are kept; the same key again writes nothing new", { skip, timeout: 60_000 }, async () => {
  const kit = createCardKit({ client, workspaceId });
  const todo = await kit.todo("益子陶器市の搬入を手配する（什器）", "2026-11-18");
  // The links of 附录 E as a later sprint writes them: fields the to-do service does not know yet.
  const row = await pool.query("select payload from orbit_records where collection_name = 'tasks' and record_id = $1", [todo.id]);
  const payload = row.rows[0].payload as { task: Record<string, unknown> };
  payload.task.relatedContactIds = ["contact:lc1", "contact:lc2"];
  payload.task.relatedEventRefs = [{ id: "event:mashiko", kind: "platform" }];
  await pool.query("update orbit_records set payload = $2 where collection_name = 'tasks' and record_id = $1", [todo.id, payload]);
  const input = { actorId: ACTOR, tasks: kit.tasks };
  // expectedUpdatedAt: the version read at the click (decision.ts adds it to the outbox payload).
  const clicked = (await kit.tasks.get({ actorId: ACTOR, taskId: todo.id }))!.updatedAt;
  const change = { before: { plannedDate: "2026-11-18" }, expectedUpdatedAt: clicked, patch: { plannedDate: "2026-11-19" }, shown: { title: "益子陶器市の搬入を手配する（什器）" }, taskId: todo.id };
  await applyApprovedTodoUpdate(input, change, { idempotencyKey: "action:links:r1:op1", now: kit.now() });
  const written = await storedTask(todo.id);
  assert.equal(written?.plannedDate, "2026-11-19");
  assert.deepEqual(written?.relatedContactIds, ["contact:lc1", "contact:lc2"]);
  assert.deepEqual(written?.relatedEventRefs, [{ id: "event:mashiko", kind: "platform" }]);
  const updatedAt = written?.updatedAt;
  await applyApprovedTodoUpdate(input, change, { idempotencyKey: "action:links:r1:op1", now: kit.now() });
  assert.equal((await storedTask(todo.id))?.updatedAt, updatedAt, "a replay of the same key does not write again");
});
