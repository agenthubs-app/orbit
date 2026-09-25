import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createNoteTaskPageReader } from "../../features/tasks/note-task-page";
import { createNoteTaskPageGetHandler } from "../../app/api/tasks/note-page/handler";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const url = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test("note task pages retain all statuses, enforce owner/provenance, and do not grow with unrelated tasks", { skip: !url, timeout: 30000 }, async () => {
  assert.ok(url); const address = new URL(url); assert.ok(["localhost", "127.0.0.1"].includes(address.hostname)); assert.equal(address.search, "");
  const schema = "note_tasks_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString: url, max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const at = "2026-09-25T00:00:00.000Z", secret = "local-test-secret-".repeat(3);
  let bytes = 0, queries = 0, lastSql = "", lastValues: readonly unknown[] = [];
  const client = { async query<T>(sql: string, values?: readonly unknown[]) {
    const result = await pool.query(sql, values as unknown[]); queries++; bytes += Buffer.byteLength(JSON.stringify(result.rows)); lastSql = sql; lastValues = values ?? [];
    return { rows: result.rows as T[] };
  } };
  const reader = createNoteTaskPageReader({ client, workspaceId: "w", secret, now: () => at });
  const task = (id: string) => ({ id, accountId: "a", ownerUserId: "a", title: id, status: "open", category: "work", priority: "normal", source: "manual", sourceNoteId: "note:one", sourceNoteVersion: 1, notes: "private-body-".repeat(400), createdAt: at, updatedAt: at });
  const insert = async (id: string, patch: Record<string, unknown> = {}, record: { user?: string; workspace?: string; state?: string } = {}) => {
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,lifecycle_state,payload,created_at,updated_at)
      values($1,'tasks',$2,$3,'manual',$2,$4,$5::jsonb,now(),now())`, [record.workspace ?? "w", id, record.user ?? "a", record.state ?? "active", JSON.stringify({ version: 1, task: { ...task(id), ...patch }, activities: [] })]);
  };
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (let n = 0; n < 35; n++) await insert(`task:${String(n).padStart(2, "0")}`, n % 3 === 0 ? { status: "cancelled" } : n % 3 === 1 ? { status: "completed", completedAt: at, completedBy: "a", completionSource: "user" } : {});
    await insert("other-note", { sourceNoteId: "note:two" });
    await insert("wrong-owner", { ownerUserId: "b" });
    await insert("wrong-account", { accountId: "b" });
    await insert("wrong-row", {}, { user: "b" });
    await insert("wrong-workspace", {}, { workspace: "b" });
    await insert("deleted", {}, { state: "deleted" });
    await insert("missing-version", { sourceNoteVersion: undefined });
    await insert("fractional-version", { sourceNoteVersion: 1.1 });
    await insert("unsafe-version", { sourceNoteVersion: Number.MAX_SAFE_INTEGER + 1 });
    await insert("wrong-id", { id: "another" });
    const first = await reader.read("a", { noteId: "note:one" });
    assert.equal(first.items.length, 20); assert.equal(first.total, 35); assert.equal(first.hasMore, true); assert.equal(queries, 1);
    assert.deepEqual(new Set(first.items.map(t => t.status)), new Set(["open", "completed", "cancelled"]));
    assert.ok(bytes < 9000); assert.ok(!JSON.stringify(first).includes("private-body"));
    const firstBytes = bytes;
    const second = await reader.read("a", { noteId: "note:one", cursor: first.nextCursor });
    assert.equal(second.items.length, 15); assert.equal(second.hasMore, false); assert.equal(new Set([...first.items, ...second.items].map(t => t.id)).size, 35);
    for (const [actorId, noteId] of [["b", "note:one"], ["a", "note:two"]]) await assert.rejects(reader.read(actorId, { noteId, cursor: first.nextCursor }), /CURSOR_INVALID/);
    await assert.rejects(createNoteTaskPageReader({ client, workspaceId: "other", secret }).read("a", { noteId: "note:one", cursor: first.nextCursor }), /CURSOR_INVALID/);
    await assert.rejects(reader.read("a", { noteId: "note:one", cursor: first.nextCursor + "bad" }), /CURSOR_INVALID/);
    assert.equal((await reader.read("b", { noteId: "note:one" })).total, 0);
    assert.equal((await reader.read("a", { noteId: "absent" })).total, 0);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','growth:'||n,'a','manual','growth:'||n,jsonb_build_object('version',1,'activities','[]'::jsonb,'task',
        $1::jsonb||jsonb_build_object('id','growth:'||n,'sourceNoteId','other-note:'||n)),now(),now() from generate_series(1,10000) n`, [JSON.stringify(task("growth"))]);
    bytes = 0; queries = 0;
    assert.deepEqual(await reader.read("a", { noteId: "note:one" }), first);
    assert.equal(bytes, firstBytes); assert.equal(queries, 1);
    console.log(JSON.stringify({ metric: "note_task_page", unrelatedTasks: 10000, pageItems: first.items.length, total: first.total, bytes, queries }));
    await pool.query("analyze orbit_records");
    const plan = await pool.query("explain (format json) " + lastSql, [...lastValues]);
    assert.match(JSON.stringify(plan.rows), /orbit_records_tasks_note_source_idx/, 'source filter must happen before expanding all task histories');
    const response = await createNoteTaskPageGetHandler({ resolveActor: async () => ({ id: "a", workspaceId: "w" }), reader: () => reader })(new Request("http://localhost/api/tasks/note-page?noteId=note%3Aone&limit=20"));
    assert.equal(response.status, 200); assert.equal((await response.json()).data.total, 35);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
