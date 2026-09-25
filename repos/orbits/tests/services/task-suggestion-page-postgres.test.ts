import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTaskSuggestionPageReader } from "../../features/tasks/suggestion-page";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";

const at = "2026-09-25T00:00:00.000Z";
test("suggestion cards paginate owned visible suggestions without downloading evidence or full reasons", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = "suggestion_page_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const repository = createTaskSuggestionRepository({ store: createPostgresLiveRecordStore({ client: pool }), workspaceId: "w" });
    for (let n = 0; n < 45; n++) await repository.save({
      id: `s:${String(n).padStart(3,"0")}`, accountId: "a", ownerUserId: "a", title: `Suggestion ${n}`,
      reason: "private-long-reason".repeat(8000), category: n % 2 ? "work" : "relationship", status: "pending",
      evidenceIds: ["private-evidence".repeat(2000)], confidence: 0.8, deduplicationKey: String(n), createdAt: at, updatedAt: at,
    });
    let bytes = 0, queries = 0;
    const reader = createTaskSuggestionPageReader({ workspaceId: "w", secret: "local-cursor-secret-".repeat(3), now: () => at,
      client: { async query(sql, values) { const result = await pool.query(sql, values as unknown[]); queries++; bytes += Buffer.byteLength(JSON.stringify(result.rows)); return result; } } });
    const first = await reader.read("a", { scope: "all" });
    assert.equal(first.items.length, 20); assert.equal(first.total, 45); assert.equal(queries, 1); assert.ok(bytes < 25000);
    assert.ok(!JSON.stringify(first).includes("private-evidence")); assert.equal(first.items[0]?.reasonPreview.length, 320);
    const ids = first.items.map(item => item.id); let page = first;
    while (page.nextCursor) { page = await reader.read("a", { scope: "all", cursor: page.nextCursor }); ids.push(...page.items.map(item => item.id)); }
    assert.equal(ids.length, 45); assert.equal(new Set(ids).size, 45);
    assert.equal((await reader.read("a", { scope: "relationship" })).total, 23);
    await assert.rejects(reader.read("b", { scope: "all", cursor: first.nextCursor }), /CURSOR/);
    await assert.rejects(reader.read("a", { scope: "relationship", cursor: first.nextCursor }), /CURSOR/);
    await pool.query("update orbit_records set user_id='b' where record_id='s:000'");
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion,ownerUserId}','\"b\"') where record_id='s:001'");
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion,accountId}','[\"a\"]') where record_id='s:002'");
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion,id}','\"wrong\"') where record_id='s:003'");
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion,expiresAt}',to_jsonb($1::text)) where record_id='s:004'", ["2026-09-25T00:00:00Z"]);
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion,status}','\"dismissed\"') where record_id='s:005'");
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion}',(payload->'suggestion') || $1::jsonb) where record_id in ('s:006','s:007')", [JSON.stringify({status:"snoozed",nextVisibleAt:"2026-09-26T00:00:00.000Z"})]);
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{suggestion,nextVisibleAt}',to_jsonb($1::text)) where record_id='s:007'", ["2026-09-25T00:00:00Z"]);
    const remaining = await reader.read("a", { scope: "all" });
    assert.equal(remaining.total, 38); assert.ok(remaining.items.some(item => item.id === "s:007"));
    assert.equal((await repository.get("a", "s:007"))?.status, "snoozed", "a list read must not rewrite lifecycle state");
    const base=await repository.get("a","s:008"); assert.ok(base);
    for(const [id,patch] of Object.entries({badConfidence:{confidence:"bad"},badEvidence:{evidenceIds:{}},blank:{reason:"\uFEFF\u00A0"},
      sourceVersion:{sourceNoteId:"n"},badDate:{suggestedPlannedDate:"2025-02-29"},badInstant:{expiresAt:"2026-02-31T00:00:00Z"},
      duplicateContacts:{relatedContactIds:["c","c"]},wrongReference:{relatedContactId:"c",relatedContactIds:["other"]}})) {
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('w','taskSuggestions',$1,'a','manual','bad',$2::jsonb,now(),now())`,[id,JSON.stringify({version:1,suggestion:{...base,id,...patch}})]);
    }
    assert.equal((await reader.read("a",{scope:"all"})).total,38,"invalid records cannot inflate previews or counts");
    const otherWorkspace=createTaskSuggestionPageReader({client:pool,workspaceId:"another",secret:"local-cursor-secret-".repeat(3),now:()=>at});
    assert.equal((await otherWorkspace.read("a",{scope:"all"})).total,0);
    await assert.rejects(otherWorkspace.read("a",{scope:"all",cursor:first.nextCursor}),/CURSOR/);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','taskSuggestions','growth:'||n,'a','manual','test',jsonb_build_object('version',1,'suggestion',jsonb_build_object(
      'id','growth:'||n,'accountId','a','ownerUserId','a','title','Later','reason',repeat('x',4096),'category','work','status','pending',
      'confidence',0.1,'deduplicationKey','growth:'||n,'evidenceIds','[]'::jsonb,'createdAt',$1::text,'updatedAt',$1::text)),now(),now() from generate_series(1,10000) n`, [at]);
    bytes=0; queries=0;
    const grown = await reader.read("a", {scope:"all"});
    assert.equal(grown.total,10038); assert.equal(grown.items.length,20); assert.ok(bytes<25000); assert.equal(queries,1);
    console.log(JSON.stringify({metric:"task_suggestion_page",total:grown.total,bytes,queries}));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
