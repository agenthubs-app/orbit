import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTodoFollowupReaders } from "../../features/todo/followups";
import { createTodoPageService } from "../../features/todo/service";
import { isOpenFollowUpTask } from "../../shared/compute/follow-up-task";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTodoPageHandlers } from "../../features/todo/handlers";

const at = "2026-10-18T00:00:00.000Z";
test("To-do SQL follows the shared open predicate, exact counts and timezone overdue without downloading histories", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.search, "");
  const schema = `todo_followups_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=30000` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const tasks = createTaskService({ repository: createTaskRepository({ store, workspaceId: "w" }) });
    const plain = [];
    for (const [index, patch] of [{ category: "relationship" as const, dueAt: "2026-10-17T14:59:59Z" },
      { category: "work" as const, relatedContactId: "c", dueAt: "2026-10-17T15:00:00Z" },
      { category: "relationship" as const, plannedDate: "2026-10-17" }, { category: "work" as const },
      { category: "relationship" as const }].entries()) {
      const created = await tasks.create({ actorId: "a", title: `Plain ${index}`, idempotencyKey: String(index), now: at, notes: "PRIVATE_NOTES".repeat(1000), ...patch });
      plain.push(created.task);
    }
    await tasks.complete({ actorId: "a", taskId: plain[4]!.id, completedBy: "a", completionSource: "user", idempotencyKey: "done", now: at });
    plain[4]!.status = "completed";
    await tasks.create({ actorId: "b", title: "PRIVATE_FOREIGN", category: "relationship", idempotencyKey: "foreign", now: at });
    const linked = (collectionName: string, id: string, payload: Record<string, unknown>) => store.upsertRecord({ workspaceId: "w", collectionName, recordId: id, userId: "a",
      sourceType: "manual", sourceId: "s", evidenceIds: ["e"], lifecycleState: "active", createdAt: at, updatedAt: at,
      payload: { id, source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: at, updatedAt: at, ...payload } });
    await linked("contacts", "c", { displayName: "Contact", stage: "active" });
    await linked("connections", "cn", { accountId: "a", contactId: "c", stage: "active", summary: "Private summary" });
    const lifecycle = [{ id: "l1", status: "open", contactId: "c", dueAt: "2026-10-17T14:00:00Z" },
      { id: "l2", status: "scheduled", connectionId: "cn" }, { id: "orphan", status: "open", contactId: "missing" },
      { id: "closed", status: "completed", contactId: "c" }, { id: "unlinked", status: "open" }];
    for (const task of lifecycle) await linked("tasks", task.id, { ...task, title: task.id });
    await linked("tasks", "duplicate-record", { ...lifecycle[1], title: "l2" });
    let bytes = 0, queries = 0;
    const client = { async query(sql: string, values?: readonly unknown[]) { const reply = await pool.query(sql, values as unknown[]); queries++; bytes += Buffer.byteLength(JSON.stringify(reply.rows)); return reply; } };
    const checked: string[] = [];
    const readers = createTodoFollowupReaders({ client, workspaceId: "w", assertAllowed: collection => checked.push(collection) });
    const live = createTodoPageService({ workspaceId: "w", secret: "local-secret-".repeat(4), readers, now: () => at });
    const input = { actorId: "a", date: "2026-10-18", timeZone: "Asia/Tokyo" };
    const page = await live.read(input);
    const expected = plain.filter(isOpenFollowUpTask).length + lifecycle.filter(task => isOpenFollowUpTask({ ...task, kind: "lifecycle" })).length;
    assert.equal(page.counts.followups, expected);
    assert.equal(page.counts.overdue, 3);
    assert.equal(page.followups.items.length, expected);
    assert.equal(page.followups.items.filter(item => item.overdue).length, 3);
    assert.ok(page.followups.items.some(item => item.sourceId === "orphan"));
    assert.ok(page.followups.items.filter(item => item.kind === "task").every(item => item.deferralCount === 0));
    assert.ok(page.followups.items.filter(item => item.kind === "lifecycle").every(item => item.deferralCount === undefined));
    assert.ok(!JSON.stringify(page).includes("PRIVATE"));
    assert.equal(queries, 2);
    assert.deepEqual(new Set(checked), new Set(["tasks", "contacts", "connections"]));
    const previousMode = process.env.ORBIT_MODULE_MODE;
    process.env.ORBIT_MODULE_MODE = "live";
    try {
      const handler = createTodoPageHandlers({ resolveActor: async () => ({ id: "a", workspaceId: "w" }), live: () => ({ service: live, accountTimeZone: async () => "Asia/Tokyo" }) }).get;
      const response = await handler(new Request("http://localhost/api/todo/page?date=2026-10-18&timeZone=Asia%2FTokyo"));
      assert.equal(response.status, 200); assert.equal((await response.json()).data.counts.followups, expected);
    } finally { if (previousMode === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previousMode; }
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','growth:'||n,'a','manual','test',jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
        'id','growth:'||n,'accountId','a','ownerUserId','a','title','Growth '||n,'notes',repeat('x',4096),'status','open','category','relationship','priority','normal','source','manual',
        'createdAt',$1::text,'updatedAt',$1::text)),now(),now() from generate_series(1,10000) n`, [at]);
    queries = 0; bytes = 0;
    const grown = await live.read(input);
    assert.equal(grown.counts.followups, expected + 10000);
    assert.equal(grown.counts.overdue, 3);
    assert.equal(grown.followups.items.length, 20);
    assert.equal(queries, 2);
    assert.ok(bytes < 32000, String(bytes));
    assert.ok(grown.followups.next.task);
    console.info(JSON.stringify({ metric: "r20a_todo_followups", total: grown.counts.followups, bytes, queries }));
    await linked("tasks", "conflicting-record", { id: "l1", status: "open", contactId: "c", title: "Conflicting title" });
    await assert.rejects(readers.relationship_task!({ ...input, cursor: null, limit: 20 }), /TODO_FOLLOWUP_INTEGRITY/);
    const denied = createTodoFollowupReaders({ client, workspaceId: "w", assertAllowed() { throw Error("READ_BUDGET_EXCEEDED"); } });
    const before = queries;
    await assert.rejects(denied.task!({ ...input, cursor: null, limit: 20 }), /READ_BUDGET_EXCEEDED/);
    assert.equal(queries, before);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
