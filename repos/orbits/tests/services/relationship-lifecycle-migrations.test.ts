import assert from "node:assert/strict";
import test from "node:test";
import { RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL, runOrbitRecordsMigration } from "../../shared/storage/migrations";

test("lifecycle schema scopes receipts and supports actor-focused connection/task reads", () => {
  assert.match(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, /create table if not exists relationship_lifecycle_command_receipts/i);
  assert.match(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, /primary key \(workspace_id, actor_id, idempotency_key\)/i);
  for (const field of ["command text not null", "request_hash text not null", "response_snapshot jsonb not null", "created_at timestamptz not null"]) {
    assert.ok(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL.includes(field));
  }
  assert.match(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, /on orbit_records \(workspace_id, collection_name, user_id\)/i);
  assert.match(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, /on orbit_records \(workspace_id, user_id, \(payload ->> 'connectionId'\), \(payload ->> 'status'\), \(payload ->> 'dueAt'\)\)/i);
  assert.match(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, /where collection_name = 'tasks'/i);
});

test("migration registration runs lifecycle after base records and before Event Operations", async () => {
  const calls: string[] = [];
  const client = { async query(sql: string) { calls.push(sql); return { rows: [] }; } };
  await runOrbitRecordsMigration(client);
  assert.equal(calls[0], ORBIT_RECORDS_SCHEMA_SQL);
  assert.equal(calls[1], RELATIONSHIP_LIFECYCLE_SCHEMA_SQL);
  assert.match(calls[2], /create table if not exists event_ops_schema_migrations/i);
  calls.length = 0;
  await runRelationshipLifecycleMigrations(client);
  await runRelationshipLifecycleMigrations(client);
  assert.deepEqual(calls, [RELATIONSHIP_LIFECYCLE_SCHEMA_SQL, RELATIONSHIP_LIFECYCLE_SCHEMA_SQL]);
});

test("lifecycle schema failure stops dependent migrations and surfaces the same error", async () => {
  const calls: string[] = [];
  const failure = new Error("schema failed");
  await assert.rejects(runOrbitRecordsMigration({ async query(sql: string) {
    calls.push(sql);
    if (sql === RELATIONSHIP_LIFECYCLE_SCHEMA_SQL) throw failure;
    return { rows: [] };
  } }), (error) => error === failure);
  assert.deepEqual(calls, [ORBIT_RECORDS_SCHEMA_SQL, RELATIONSHIP_LIFECYCLE_SCHEMA_SQL]);
});
