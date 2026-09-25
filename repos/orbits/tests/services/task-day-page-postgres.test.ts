import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTaskPageReader } from "../../features/tasks/task-page";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

test("day task page filters before limiting and counts without downloading unrelated bodies", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = "task_day_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const add = async (id: string, patch: Record<string, unknown> = {}) => pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values('w','tasks',$1,'a','manual','test',$2::jsonb,now(),now())`, [id, JSON.stringify({ version: 1, activities: [], task: {
        id, accountId: "a", ownerUserId: "a", title: id, notes: "private-note".repeat(1000), status: "open", category: "work", priority: "normal", source: "manual",
        createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z", ...patch,
      } })]);
    const dueWindow = { plannedThrough: "2026-09-25", dueBefore: "2026-09-25T15:00:00.000Z" };
    const expected: string[] = [];
    for (let n = 0; n < 7; n++) { const id = `today:${n}`; await add(id, { plannedDate: "2026-09-25" }); expected.push(id); }
    for (const [id, patch] of Object.entries({
      yesterday: { plannedDate: "2026-09-24" }, lastMillisecond: { dueAt: "2026-09-25T14:59:59.999Z" },
      offsetIncluded: { dueAt: "2026-09-26T13:59:00+23:59" },
      plannedOrDue: { plannedDate: "2026-09-25", dueAt: "2026-10-01T00:00:00Z" },
      normalizedFebruary: { dueAt: "2026-02-31T00:00:00Z" }, ancient: { dueAt: "0000-01-01T00:00:00Z" },
    })) { await add(id, patch); expected.push(id); }
    await add("unscheduled"); await add("tomorrow", { plannedDate: "2026-09-26" });
    await add("midnight", { dueAt: "2026-09-26T00:00:00+09:00" });
    await add("twentyFourHours", { dueAt: "2026-09-25T24:00:00Z" });
    await add("foreign", { ownerUserId: "b", plannedDate: "2026-09-25" });
    let bytes = 0, queries = 0;
    const reader = createTaskPageReader({ workspaceId: "w", secret: "local-secret-".repeat(4), client: { async query(sql, values) {
      const result = await pool.query(sql, values as unknown[]); bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++; return result;
    } } });
    const query = { status: "open" as const, limit: 5, dueWindow };
    const first = await reader.read("a", query);
    assert.equal(first.total, expected.length); assert.equal(first.items.length, 5); assert.equal(queries, 1);
    assert.deepEqual(first.dueWindow, dueWindow);
    const before = bytes; const ids = first.items.map(item => item.id);
    let page = first;
    while (page.nextCursor) { page = await reader.read("a", { ...query, cursor: page.nextCursor }); ids.push(...page.items.map(item => item.id)); }
    assert.deepEqual(new Set(ids), new Set(expected)); assert.equal(ids.length, expected.length);
    for (const changed of [undefined, { ...dueWindow, plannedThrough: "2026-09-26" }, { ...dueWindow, dueBefore: "2026-09-26T15:00:00.000Z" }])
      await assert.rejects(reader.read("a", { ...query, dueWindow: changed, cursor: first.nextCursor }), /CURSOR/);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','unrelated:'||n,'a','manual','test',jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
      'id','unrelated:'||n,'accountId','a','ownerUserId','a','title','Unrelated','notes',repeat('x',4096),'status','open','category','work','priority','normal','source','manual',
      'plannedDate','2027-01-01','createdAt','2026-09-25T00:00:00.000Z','updatedAt','2026-09-25T00:00:00.000Z')),now(),now() from generate_series(1,10000) n`);
    bytes = 0; queries = 0;
    const grown = await reader.read("a", query);
    assert.equal(grown.total, expected.length); assert.equal(queries, 1); assert.equal(bytes, before);
    assert.ok(bytes < 5000); assert.ok(!JSON.stringify(grown).includes("private-note"));
    // JS Date.parse normalization and extreme valid offsets must agree with the old view's selection.
    for (const [dueBefore, expectedIds] of [
      ["2026-03-03T00:00:00.000Z", ["ancient"]],
      ["2026-03-03T00:00:00.001Z", ["ancient", "normalizedFebruary"]],
    ] as const) {
      const result = await reader.read("a", { status: "open", dueWindow: { plannedThrough: "2026-01-01", dueBefore } });
      assert.deepEqual(new Set(result.items.map(item => item.id)), new Set(expectedIds));
    }
    console.log(JSON.stringify({ metric: "day_task_page", unrelatedTasks: 10000, visible: first.total, firstPageBytes: before, queries: 1 }));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
