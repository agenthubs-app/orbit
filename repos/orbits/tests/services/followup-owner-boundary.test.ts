import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createStorageFollowupTaskProvider } from "../../features/followups/storage/followup-live-record-provider";
import { createRelationshipLifecycleFactsReader } from "../../features/followups/storage/relationship-lifecycle-facts-reader";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createPostgresRelationshipScopeReader } from "../../shared/storage/relationship-read-scope";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const at = "2026-09-25T00:00:00.000Z";
const records: LiveRecord[] = [];
for (const collectionName of ["tasks", "connections"] as const) {
  for (const [suffix, userId, accountId] of [
    ["consistent", "a", "a"], ["owner-only", "a", null],
    ["association-only", null, "a"], ["conflict", "b", "a"], ["reverse-conflict", "a", "b"],
  ] as const) {
    records.push({ workspaceId: "w", collectionName, recordId: `${collectionName}:${suffix}`, userId,
      sourceType: "manual", sourceId: "test", evidenceIds: ["e"], lifecycleState: "active", createdAt: at, updatedAt: at,
      payload: { id: `${collectionName}:${suffix}`, accountId, title: suffix, status: "open", contactId: "c", stage: "active", summary: suffix,
        source: { type: "manual", id: "test" }, evidenceIds: ["e"], createdAt: at, updatedAt: at },
    });
  }
}

test("followup fallback grants no access from an associated account or inconsistent owner", async () => {
  const provider = createStorageFollowupTaskProvider({ store: createMemoryLiveRecordStore(records), workspaceId: "w" });
  const graph = await provider.readFollowupGraph("a");
  assert.deepEqual(graph.tasks.map(item => item.id).sort(), ["tasks:consistent", "tasks:owner-only"]);
  // A valid connection requires its accountId, as before; owner-only malformed
  // connection payloads do not become usable merely because ownership passes.
  assert.deepEqual(graph.connections.map(item => item.id), ["connections:consistent"]);
  assert.equal((await provider.readFollowupGraph("b")).tasks.length, 0);
});

test("both PostgreSQL followup readers exclude association-only/conflicting rows before transfer", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.search, "");
  const schema = `followup_owner_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema}` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    for (const row of records) await store.upsertRecord(row);
    const scoped = createPostgresRelationshipScopeReader({ client: pool, workspaceId: "w", purpose: "followups" });
    const rows = await scoped("a");
    assert.deepEqual(rows.tasks.map(row => row.recordId).sort(), ["tasks:consistent", "tasks:owner-only"]);
    assert.deepEqual(rows.connections.map(row => row.recordId).sort(), ["connections:consistent", "connections:owner-only"]);
    const provider = createStorageFollowupTaskProvider({ store, workspaceId: "w", scopeRecordReader: scoped });
    assert.deepEqual(await provider.readFollowupGraph("a"), await createStorageFollowupTaskProvider({ store, workspaceId: "w" }).readFollowupGraph("a"));
    const facts = await createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w" }).readRelationshipLifecycleFacts("a");
    assert.deepEqual(facts.tasks.map(item => item.id).sort(), ["tasks:consistent", "tasks:owner-only"]);
    assert.equal((await createRelationshipLifecycleFactsReader({ client: pool, workspaceId: "w" }).readRelationshipLifecycleFacts("b")).tasks.length, 0);
    // The clarified ownership rule also applies to legacy notification sources.
    const legacy = await createPostgresRelationshipScopeReader({ client: pool, workspaceId: "w", purpose: "legacy-notifications" })("a");
    assert.ok(!legacy.tasks.some(row => row.recordId === "tasks:association-only"));
  } finally { await pool.query(`drop schema ${schema} cascade`); await pool.end(); }
});
