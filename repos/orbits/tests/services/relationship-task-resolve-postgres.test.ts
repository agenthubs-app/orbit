import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createRelationshipTaskResolver } from "../../features/connections/lifecycle/task-resolve";
import { createRelationshipTaskPageReader } from "../../features/connections/lifecycle/task-page";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const at = "2026-10-18T00:00:00.000Z";
test("exact resolver matches valid lifecycle page but never downloads whole graphs or foreign payloads", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = `task_resolve_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=15000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const record = (collectionName: string, recordId: string, payload: Record<string, unknown>, userId = "a", workspaceId = "w") => store.upsertRecord({ workspaceId, collectionName, recordId, userId,
      sourceType: "manual", sourceId: "s", evidenceIds: ["e"], lifecycleState: "active", createdAt: at, updatedAt: at,
      payload: { id: recordId, source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: at, updatedAt: at, ...payload } });
    await record("contacts", "c", { displayName: "Contact", stage: "active" });
    await record("connections", "cn", { accountId: "a", contactId: "c", stage: "active", summary: "PRIVATE".repeat(10000) });
    await record("tasks", "t", { accountId: "a", connectionId: "cn", contactId: "c", title: "Follow up", status: "open", relationshipPurpose: "follow_up", dueAt: at, notes: "PRIVATE".repeat(10000) });
    let queries = 0, bytes = 0;
    const client = { async query(sql: string, values?: readonly unknown[]) { const response = await pool.query(sql, values as unknown[]); queries++; bytes += Buffer.byteLength(JSON.stringify(response.rows)); return response; } };
    const gates: string[] = [];
    const resolver = createRelationshipTaskResolver({ client, workspaceId: "w", assertAllowed: collection => gates.push(collection) });
    const mapping = await resolver.read("a", "t");
    assert.deepEqual(mapping, { taskId: "t", connectionId: "cn", contactId: "c" });
    assert.equal(queries, 1); assert.ok(bytes < 2048, String(bytes)); assert.deepEqual(new Set(gates), new Set(["tasks", "connections", "contacts"]));
    const page = await createRelationshipTaskPageReader({ client: pool, workspaceId: "w", secret: "s".repeat(32) }).read("a", { mode: "open" });
    const item = page.items.find(row => row.taskId === "t")!;
    assert.deepEqual(mapping, { taskId: item.taskId, connectionId: item.connectionId, contactId: item.contactId });
    assert.equal(await resolver.read("b", "t"), null);
    assert.equal(await createRelationshipTaskResolver({ client, workspaceId: "other", assertAllowed() {} }).read("a", "t"), null);
    for (const collection of ["tasks", "connections", "contacts"]) {
      for (const patch of ["user_id='b'", "payload=payload||'{\"accountId\":\"b\"}'::jsonb", "deleted_at=now()", "lifecycle_state='deleted'"]) {
        await pool.query(`update orbit_records set ${patch} where collection_name=$1`, [collection]);
        assert.equal(await resolver.read("a", "t"), null, `${collection}: ${patch}`);
        await pool.query("update orbit_records set user_id='a',payload=payload||'{\"accountId\":\"a\"}'::jsonb,deleted_at=null,lifecycle_state='active' where collection_name=$1", [collection]);
      }
    }
    await record("tasks", "foreign", { accountId: "a", connectionId: "cn", contactId: "c", title: "PRIVATE_FOREIGN", status: "open" }, "b");
    assert.equal(await resolver.read("a", "foreign"), null);
    await record("tasks", "orphan", { contactId: "missing", title: "Orphan", status: "open" });
    assert.equal(await resolver.read("a", "orphan"), null);
    await record("contacts", "other-contact", { displayName: "Other", stage: "active" });
    await record("tasks", "mismatch", { connectionId: "cn", contactId: "other-contact", title: "Mismatch", status: "open" });
    await assert.rejects(resolver.read("a", "mismatch"), /RELATIONSHIP_TASK_MAPPING_CONFLICT/);
    await record("tasks", "duplicate", { id: "t", accountId: "a", connectionId: "cn", contactId: "c", title: "Follow up", status: "open", relationshipPurpose: "follow_up", dueAt: at });
    await assert.rejects(resolver.read("a", "t"), /RELATIONSHIP_TASK_MAPPING_CONFLICT/);
    await pool.query("delete from orbit_records where record_id='duplicate'");
    await pool.query("update orbit_records set deleted_at=now() where record_id='t'");
    assert.equal(await resolver.read("a", "t"), null);
    await pool.query("update orbit_records set deleted_at=null where record_id='t'");
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','tasks','unrelated:'||n,'a','manual','s',jsonb_build_object('id','unrelated:'||n,'notes',repeat('PRIVATE',1000)),now(),now() from generate_series(1,10000) n`);
    queries = 0; bytes = 0;
    assert.deepEqual(await resolver.read("a", "t"), mapping);
    assert.equal(queries, 1); assert.ok(bytes < 2048, String(bytes));
    const denied = createRelationshipTaskResolver({ client, workspaceId: "w", assertAllowed() { throw Error("READ_BUDGET_EXCEEDED"); } });
    await assert.rejects(denied.read("a", "t"), /READ_BUDGET_EXCEEDED/); assert.equal(queries, 1);
    console.info(JSON.stringify({ metric: "r20a_task_resolver", unrelated: 10000, queries, bytes }));
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
