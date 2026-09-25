import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTaskDetailHandlers } from "../../app/api/tasks/[id]/handler";
import { createTaskActivitiesGetHandler } from "../../app/api/tasks/[id]/activities/handler";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { createTaskSuggestionRepository } from "../../features/tasks/suggestion-repository";
import { createTaskSuggestionService } from "../../features/tasks/suggestion-service";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const at = "2026-09-25T00:00:00.000Z";
test("PostgreSQL detail and accepted replay never download unrelated tasks, including foreign IDs", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.search, "");
  const schema = "task_point_" + randomUUID().replaceAll("-", "");
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    let bytes = 0, queries = 0, rows = 0;
    const measured = { async query(sql: string, values?: readonly unknown[]) {
      const result = await pool.query(sql, values as unknown[]);
      bytes += Buffer.byteLength(JSON.stringify(result.rows)); queries++; rows += result.rows.length;
      return result;
    } };
    const store = createPostgresLiveRecordStore({ client: measured });
    const service = createTaskService({ repository: createTaskRepository({ store, workspaceId: "w" }) });
    const suggestions = createTaskSuggestionService({ repository: createTaskSuggestionRepository({ store, workspaceId: "w" }), taskService: service });
    const suggestion = await suggestions.suggest({ actorId: "a", title: "Target", reason: "Reason", category: "work", confidence: 0.9, evidenceIds: [], deduplicationKey: "target", now: at });
    const command = { actorId: "a", suggestionId: suggestion.id, idempotencyKey: "accept", now: at };
    const accepted = await suggestions.accept(command);
    const handler = createTaskDetailHandlers({ service, resolveActor: async () => ({ id: "a", workspaceId: "w" }) });
    const getDetail = async () => {
      bytes = 0; queries = 0; rows = 0;
      const response = await handler.GET(new Request("https://orbit.test/api/tasks/target"), { params: Promise.resolve({ id: accepted.task.id }) });
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).data.task, accepted.task);
      assert.equal(queries, 1); assert.equal(rows, 1);
      return bytes;
    };
    const before = await getDetail();
    const activitiesHandler = createTaskActivitiesGetHandler({ service, resolveActor: async () => ({ id: "a", workspaceId: "w" }) });
    const getActivities = async () => {
      bytes = 0; queries = 0; rows = 0;
      const response = await activitiesHandler(new Request("https://orbit.test/api/tasks/target/activities"), { params: Promise.resolve({ id: accepted.task.id }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.activities.length, 1);
      assert.equal(queries, 1); assert.equal(rows, 1);
      return bytes;
    };
    const activitiesBefore = await getActivities();
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','unrelated:'||n,'a','manual','test',jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
        'id','unrelated:'||n,'accountId','a','ownerUserId','a','title','Unrelated '||n,'notes',repeat('x',4096),'status','open','category','work','priority','normal','source','manual',
        'createdAt',$1::text,'updatedAt',$1::text)),now(),now() from generate_series(1,10000) n`, [at]);
    assert.equal(await getDetail(), before);
    assert.equal(await getActivities(), activitiesBefore);
    bytes = 0; queries = 0; rows = 0;
    assert.deepEqual(await suggestions.accept(command), accepted);
    assert.equal(queries, 2); assert.equal(rows, 2); assert.ok(bytes < 5000);
    const replayBytes = bytes;
    bytes = 0; queries = 0; rows = 0;
    assert.equal(await service.get({ actorId: "b", taskId: accepted.task.id }), null);
    assert.equal(queries, 1); assert.equal(rows, 0); assert.equal(bytes, 2);
    const otherWorkspace = createTaskService({ repository: createTaskRepository({ store, workspaceId: "other" }) });
    assert.equal(await otherWorkspace.get({ actorId: "a", taskId: accepted.task.id }), null);
    await pool.query("update orbit_records set payload=jsonb_set(payload,'{task,accountId}','\"b\"') where collection_name='tasks' and record_id=$1", [accepted.task.id]);
    assert.equal(await service.get({ actorId: "a", taskId: accepted.task.id }), null);
    await assert.rejects(suggestions.accept(command), /cannot be accepted from accepted/);
    console.log(JSON.stringify({ metric: "task_point_read", unrelatedTasks: 10000, detailBytes: before, detailQueries: 1, activitiesBytes: activitiesBefore, activitiesQueries: 1, replayBytes, replayQueries: 2, foreignRows: 0 }));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
