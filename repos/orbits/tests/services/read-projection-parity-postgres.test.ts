import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createStorageAppBootstrapProvider } from "../../features/bootstrap/storage/bootstrap-live-record-provider";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test("Postgres projections preserve the full generated bootstrap/dashboard graph and actor boundary", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local parity test only");
  const schema = `projection_parity_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  const workspaceId = "workspace:projection-parity";
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, collectionNames: ["accounts", "agentActions", "connections", "contacts", "events", "evidence", "notifications", "permissions", "profiles", "tasks"] });
    const oldBootstrap = createStorageAppBootstrapProvider({ store, workspaceId });
    const newBootstrap = createStorageAppBootstrapProvider({ store, workspaceId, sqlClient: client });
    const oldDashboard = createStorageDashboardAggregateProvider({ store, workspaceId });
    const newDashboard = createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client });
    // The old SQL has no tie-breaker for equal occurred_at/updated_at. Compare
    // complete contents first, without asserting an order it never guaranteed.
    const canonicalContents = (graph: object) => Object.fromEntries(Object.entries(graph).map(([key, value]) => [
      key, Array.isArray(value) ? [...value].sort((left, right) => String(left?.id ?? left).localeCompare(String(right?.id ?? right))) : value,
    ]));
    assert.deepEqual(canonicalContents(await newBootstrap.readBootstrapGraph()), canonicalContents(await oldBootstrap.readBootstrapGraph()));
    assert.deepEqual(canonicalContents(await newDashboard.readDashboardGraph()), canonicalContents(await oldDashboard.readDashboardGraph()));
    // Also compare exact result ordering with distinct SQL sort keys. Payload
    // fields remain the real generated fixtures, not simplified replacement DTOs.
    await client.query(`with ranked as (
      select workspace_id,collection_name,record_id,row_number() over (order by collection_name,record_id) as n
      from orbit_records where workspace_id=$1
    ) update orbit_records r set occurred_at=timestamptz '2026-09-17 02:00:00+00' - ranked.n * interval '1 second'
      from ranked where r.workspace_id=ranked.workspace_id and r.collection_name=ranked.collection_name and r.record_id=ranked.record_id`, [workspaceId]);
    assert.deepEqual(await newBootstrap.readBootstrapGraph(), await oldBootstrap.readBootstrapGraph());
    assert.deepEqual(await newDashboard.readDashboardGraph(), await oldDashboard.readDashboardGraph());
    for (const actor of [...defaultMockFixtures.accounts.map(account => account.id), "actor:unrelated", "__unscoped__"]) {
      assert.deepEqual(await newBootstrap.readBootstrapGraphForAccount!(actor), await oldBootstrap.readBootstrapGraphForAccount!(actor), `bootstrap ${actor}`);
      assert.deepEqual(await newDashboard.readDashboardGraphForAccount!(actor), await oldDashboard.readDashboardGraphForAccount!(actor), `dashboard ${actor}`);
    }
    const [unscoped, sentinel] = await Promise.all([newBootstrap.readBootstrapGraph(), newBootstrap.readBootstrapGraphForAccount!("__unscoped__")]);
    assert.ok(unscoped.contacts.length > 0);
    assert.equal(sentinel.contacts.length, 0, "A literal actor ID cannot collide with the unscoped coalescing key");
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});
