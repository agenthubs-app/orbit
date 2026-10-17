import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTodoRecordReaders } from "../../features/todo/record-sources";
import { createTodoPageService } from "../../features/todo/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const at = "2026-10-18T00:00:00.000Z";
test("To-do record sources read bounded actor-only projections without source writes or private payloads", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = `todo_sources_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=30000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const insert = async (collection: string, id: string, payload: Record<string, unknown>, workspace = "w", actor: string | null = "a") => {
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values($1,$2,$3,$4,'manual','test',$5::jsonb,$6,$6)`, [workspace, collection, id, actor, JSON.stringify({ createdAt: at, updatedAt: at, ...payload, privateBody: "PRIVATE_BODY".repeat(1000) }), at]);
    };
    await insert("agentActionsV2", "action", { entity: { actionId: "action", title: "Review action", whyNow: "Reason", status: "awaiting_confirmation", createdAt: at, updatedAt: at } }, "w:agent-actor:a", null);
    await insert("agentActionsV2", "foreign", { entity: { actionId: "foreign", title: "PRIVATE_FOREIGN", status: "awaiting_confirmation", createdAt: at, updatedAt: at } }, "w:agent-actor:b", null);
    await insert("agent_entity_drafts", "draft", { draftId: "draft", conversationId: "conversation", kind: "task", state: "pending_confirmation", fields: { title: "Conversation task" }, revision: 1 });
    await insert("agentSignals", "signal", { signal: { signalId: "signal", title: "Next move", reason: "Follow-up", status: "new", firstObservedAt: at, lastMeaningfulChangeAt: at, importance: 10, targetType: "task", targetId: "t" } }, "w:agent-actor:a", null);
    await insert("agentSignals", "resolved", { signal: { signalId: "resolved", title: "Resolved", status: "resolved" } }, "w:agent-actor:a", null);
    const checked: string[] = [];
    let bytes = 0;
    const client = { async query(sql: string, values?: readonly unknown[]) { assert.match(sql.trimStart(), /^with\b/i); const reply = await pool.query(sql, values as unknown[]); bytes += Buffer.byteLength(JSON.stringify(reply.rows)); return reply; } };
    const readers = createTodoRecordReaders({ client, workspaceId: "w", assertAllowed: collection => checked.push(collection) });
    await readers.agent_action!({ actorId: "a", date: "2026-10-18", timeZone: "Asia/Tokyo", cursor: null, limit: 5 });
    const live = createTodoPageService({ workspaceId: "w", secret: "local-secret-".repeat(4), readers, now: () => at });
    const input = { actorId: "a", date: "2026-10-18", timeZone: "Asia/Tokyo" };
    const before = (await pool.query("select md5(string_agg(payload::text,'' order by workspace_id,collection_name,record_id)) as hash from orbit_records")).rows[0].hash;
    const page = await live.read(input);
    assert.equal(page.counts.decisions, 2);
    assert.equal(page.counts.nextMoves, 1);
    assert.equal(page.decisions.items.find(item => item.source === "entity_draft")?.conversationId, "conversation");
    assert.equal(page.nextMoves.items[0]?.taskId, "t");
    assert.ok(!JSON.stringify(page).includes("PRIVATE"));
    assert.equal((await pool.query("select md5(string_agg(payload::text,'' order by workspace_id,collection_name,record_id)) as hash from orbit_records")).rows[0].hash, before);
    assert.deepEqual(new Set(checked), new Set(["agentActionsV2", "agent_entity_drafts", "agentSignals"]));
    assert.equal((await live.read({ ...input, actorId: "b" })).counts.decisions, 1);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','agent_entity_drafts','growth:'||n,'a','manual','test',jsonb_build_object('draftId','growth:'||n,'conversationId','conversation:'||n,'state','pending_confirmation','fields',jsonb_build_object('title','Draft '||n),'privateBody',repeat('x',4096),'createdAt',$1::text),$1::timestamptz,$1::timestamptz from generate_series(1,150) n`, [at]);
    bytes = 0;
    const grown = await live.read(input);
    assert.equal(grown.counts.decisions, 101);
    assert.equal(grown.countsCapped.decisions, true);
    assert.ok(bytes < 15000, String(bytes));
    const seen = new Set(grown.decisions.items.filter(item => item.source === "entity_draft").map(item => item.key));
    let cursor = grown.decisions.next.entity_draft;
    for (let round = 0; cursor && round < 20; round++) {
      const next = await live.read({ ...input, section: "decisions", source: "entity_draft", cursor, limit: 25 });
      for (const item of next.decisions.items) { assert.ok(!seen.has(item.key)); seen.add(item.key); }
      cursor = next.decisions.next.entity_draft;
    }
    assert.equal(cursor, undefined); assert.equal(seen.size, 151);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
