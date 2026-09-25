import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTaskPageReader } from "../../features/tasks/task-page";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskPageGetHandler } from "../../app/api/tasks/page/handler";

const at = "2026-09-25T00:00:00.000Z";
test("canonical task pages are owned, globally filtered, signed, compact and do not download histories", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = "task_page_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const service = createTaskService({ repository: createTaskRepository({ store, workspaceId: "w" }) });
    for (let n = 0; n < 65; n++) await service.create({ actorId: "a", title: `Task ${String(n).padStart(3,"0")}`, notes: n === 64 ? "隐藏关键词 東京" : "private-body-".repeat(8000),
      category: n % 2 ? "relationship" : "work", priority: "normal", idempotencyKey: String(n), now: at, ...(n % 3 ? { plannedDate: "2026-09-26" } : {}) });
    await service.create({ actorId: "b", title: "foreign-private", category: "work", idempotencyKey: "foreign", now: at });
    let bytes = 0, queries = 0;
    const measured = { async query(sql: string, values?: readonly unknown[]) { const result = await pool.query(sql, values as unknown[]); queries++; bytes += Buffer.byteLength(JSON.stringify(result.rows)); return result; } };
    const reader = createTaskPageReader({ client: measured, workspaceId: "w", secret: "local-secret-".repeat(4) });
    const first = await reader.read("a", { status: "open" });
    assert.equal(first.items.length, 30); assert.equal(first.total, 65); assert.equal(first.counts.completed, 0); assert.equal(queries, 1);
    assert.ok(bytes < 32_000); assert.ok(!JSON.stringify(first).includes("private-body"));
    const firstPageBytes = bytes;
    const ids = first.items.map(item => item.id);
    let page = first;
    while (page.nextCursor) { page = await reader.read("a", { status: "open", cursor: page.nextCursor }); ids.push(...page.items.map(item => item.id)); }
    assert.equal(ids.length, 65); assert.equal(new Set(ids).size, 65);
    assert.deepEqual(new Set(ids), new Set((await service.list({ actorId: "a" })).map(task => task.id)));
    const search = await reader.read("a", { status: "open", query: "東京" });
    assert.equal(search.total, 1); assert.equal(search.items[0]?.titlePreview, "Task 064");
    assert.equal((await reader.read("a", { status: "open", scope: "relationship" })).total, 32);
    for (const query of [{ status: "completed" as const }, { status: "open" as const, scope: "relationship" as const }, { status: "open" as const, query: "東京" }])
      await assert.rejects(reader.read("a", { ...query, cursor: first.nextCursor }), /CURSOR/);
    await assert.rejects(reader.read("b", { status: "open", cursor: first.nextCursor }), /CURSOR/);
    await assert.rejects(reader.read("a", { status: "open", cursor: first.nextCursor!.slice(0,-4) + "evil" }), /CURSOR/);
    await service.complete({ actorId: "a", taskId: ids[0]!, completedBy: "a", completionSource: "user", idempotencyKey: "complete", now: "2026-09-25T01:00:00.000Z" });
    assert.equal((await reader.read("a", { status: "completed" })).items[0]?.id, ids[0]);
    await pool.query("update orbit_records set user_id='b' where record_id=$1", [ids[1]]);
    assert.equal((await reader.read("a", { status: "open" })).total, 63);
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{task,ownerUserId}','\"b\"') where record_id=$1", [ids[2]]);
    assert.equal((await reader.read("a", { status: "open" })).total, 62);
    bytes = 0; queries = 0;
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','growth:'||n,'a','manual','test', jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
        'id','growth:'||n,'accountId','a','ownerUserId','a','title','Growth '||n,'notes',repeat('x',4096),'status','open','category','work','priority','normal','source','manual',
        'createdAt',$1::text,'updatedAt',$1::text)),now(),now() from generate_series(1,10000) n`, [at]);
    const grown = await reader.read("a", { status: "open" });
    assert.equal(grown.total, 10062); assert.equal(grown.items.length, 30); assert.ok(bytes < 32_000); assert.equal(queries, 1);
    console.log(JSON.stringify({ metric: "canonical_task_page", total: grown.total, bytes, queries, firstPageBytes }));
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','growth:'||n,'a','manual','test', jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
        'id','growth:'||n,'accountId','a','ownerUserId','a','title','Growth '||n,'notes',repeat('x',4096),'status','open','category','work','priority','normal','source','manual',
        'createdAt',$1::text,'updatedAt',$1::text)),now(),now() from generate_series(10001,100000) n`, [at]);
    bytes = 0; queries = 0;
    const large = await reader.read("a", { status: "open" });
    assert.equal(large.total,100062); assert.equal(large.items.length,30); assert.ok(bytes<32_000); assert.equal(queries,1);
    console.log(JSON.stringify({ metric:"canonical_task_page",total:large.total,bytes,queries,firstPageBytes }));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});

test("task page matches valid canonical records and never exposes another owner's contact", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = "task_page_rules_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString:url.toString(),max:1,options:`-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({client:pool});
    const service = createTaskService({repository:createTaskRepository({store,workspaceId:"w"})});
    const insert = async (id:string, taskPatch:Record<string,unknown>={}, activities:unknown[]=[]) => {
      const task = {id,accountId:"a",ownerUserId:"a",title:id,category:"work",status:"open",priority:"normal",source:"manual",createdAt:at,updatedAt:at,...taskPatch};
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('w','tasks',$1,'a','manual','test',$2::jsonb,now(),now())`,[id,JSON.stringify({version:1,task,activities})]);
    };
    const activity = (taskId:string,id="created",occurredAt=at) => ({id,taskId,accountId:"a",ownerUserId:"a",type:"created",actorType:"user",occurredAt,taskSnapshot:{title:taskId,category:"work"}});
    const cases:Record<string,Record<string,unknown>> = {
      valid:{}, leap:{plannedDate:"2024-02-29"}, normalizes:{dueAt:"2026-02-31T00:00:00Z"}, midnight:{dueAt:"2026-09-25T24:00:00.000Z"},
      offset:{dueAt:"2026-09-25T01:00:00+23:59"}, ancient:{plannedDate:"0100-01-01"},
      completed:{status:"completed",completedAt:at,completedBy:"a",completionSource:"user"},
      cancelled:{status:"cancelled"}, blank:{title:"\uFEFF\u00A0"}, nullNotes:{notes:null}, badDate:{plannedDate:"2025-02-29"},
      yearZero:{plannedDate:"0000-01-01"}, badMidnight:{dueAt:"2026-09-25T24:01:00Z"}, leapSecond:{dueAt:"2026-09-25T00:00:60Z"},
      badOffset:{dueAt:"2026-09-25T00:00:00+24:00"}, owner:{ownerUserId:"b"}, account:{accountId:"b"},
      accountArray:{accountId:["a"]}, noCompletion:{status:"completed"}, staleCompletion:{completedAt:at},
      noteVersion:{sourceNoteId:"n",sourceNoteVersion:1}, missingVersion:{sourceNoteId:"n"}, fractionalVersion:{sourceNoteId:"n",sourceNoteVersion:1.5},
    };
    for(const [id,patch] of Object.entries(cases)) await insert(id,patch);
    await insert("goodHistory",{},[activity("goodHistory")]);
    await insert("duplicateHistory",{},[activity("duplicateHistory"),activity("duplicateHistory")]);
    await insert("foreignHistory",{},[{...activity("foreignHistory"),ownerUserId:"b"}]);
    await insert("reversedHistory",{},[activity("reversedHistory","later","2026-09-26T00:00:00Z"),activity("reversedHistory","earlier")]);
    await insert("wrongSnapshot",{},[{...activity("wrongSnapshot"),taskSnapshot:{title:"private",category:"unknown"}}]);
    const reader=createTaskPageReader({client:pool,workspaceId:"w",secret:"local-secret-".repeat(4)});
    for(const status of ["open","completed"] as const){
      const expected=(await service.list({actorId:"a",status})).map(item=>item.id);
      const actual=await reader.read("a",{status});
      assert.deepEqual(new Set(actual.items.map(item=>item.id)),new Set(expected),status);
      assert.equal(actual.total,expected.length);
    }
    // V1 cards reject malformed enum arrays even though the old decoder's
    // String(value) accidentally accepts them. Never coerce them into a card.
    await insert("arrayPriority",{priority:["normal"]});
    assert.ok(!(await reader.read("a",{status:"open"})).items.some(item=>item.id==="arrayPriority"));
    for(const [id,owner,account] of [["own","a","a"],["foreign","b","b"],["conflicting","a","b"],["arrayAccount","a",["a"]]] as const){
      await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('w','contacts',$1,$2,'manual','test',$3::jsonb,now(),now())`,[id,owner,JSON.stringify({id,accountId:account,displayName:`PRIVATE ${id}`,organization:"org"})]);
      await insert(`linked:${id}`,{relatedContactId:id});
    }
    await insert("linked:missing",{relatedContactId:"missing"});
    const linked=await reader.read("a",{status:"open",query:"linked:"});
    assert.equal(linked.total,5);
    assert.equal(linked.items.find(item=>item.id==="linked:own")?.relatedContact?.namePreview,"PRIVATE own");
    for(const id of ["foreign","conflicting","arrayAccount","missing"]) assert.equal(linked.items.find(item=>item.id===`linked:${id}`)?.relatedContact,null,id);
    await pool.query("update orbit_records set user_id='b' where collection_name='contacts' and record_id='own'");
    assert.equal((await reader.read("a",{status:"open",query:"linked:own"})).items[0]?.relatedContact,null);
    const handler=createTaskPageGetHandler({resolveActor:async()=>({id:"a",workspaceId:"w"}),reader:()=>reader});
    const response=await handler(new Request("https://orbit.test/api/tasks/page?query=linked%3A&limit=2"));
    assert.equal(response.status,200);
    const envelope=await response.json();assert.equal(envelope.data.items.length,2);assert.equal(envelope.data.total,5);
    assert.ok(!JSON.stringify(envelope).includes("PRIVATE"));
    // Malformed oversized IDs must fail WITHOUT returning that ID over PG.
    await insert("tooLongContact",{relatedContactId:"x".repeat(100_000),plannedDate:"2026-01-01"});
    let bytes=0;
    const measured=createTaskPageReader({workspaceId:"w",secret:"local-secret-".repeat(4),client:{async query(sql,values){const result=await pool.query(sql,values as unknown[]);bytes+=Buffer.byteLength(JSON.stringify(result.rows));return result;}}});
    await assert.rejects(measured.read("a",{status:"open"}));
    assert.ok(bytes<1000,`Invalid data should return only a small failure, got ${bytes} bytes`);
  } finally {await pool.query(`drop schema if exists ${schema} cascade`);await pool.end();}
});
