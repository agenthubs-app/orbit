import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresRelationshipScopeReader } from "../../shared/storage/relationship-read-scope";
import { createStorageFollowupTaskProvider } from "../../features/followups/storage/followup-live-record-provider";
import { createStorageReminderScheduleNotificationProvider } from "../../features/notifications/storage/reminder-notification-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createReadCostLedger } from "./read-cost-ledger";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test('a scoped graph read preserves the configured budget barrier before issuing SQL', async()=>{
  let queries=0;
  const read=createPostgresRelationshipScopeReader({workspaceId:'test',purpose:'followups',client:{query:async()=>{queries++;return {rows:[]};}},beforeRead:()=>{throw new Error('Budget exceeded');}});
  await assert.rejects(read('actor'),/Budget exceeded/);assert.equal(queries,0);
});
const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => Array.isArray(item)
  ? [...item].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : item);

test("followup and legacy scope preserve complete legal graphs without foreign-data amplification", {
  skip: !databaseUrl, timeout: 120_000,
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local PostgreSQL only");
  const schema = `graph_cost_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const ledger = createReadCostLedger();
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool, readMetrics: ledger.observer });
  const workspaceId = "workspace:scope-test", actorId = "account_orbit_generated";
  const store = createPostgresLiveRecordStore({ client });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, now: () => "2026-09-18T00:00:00.000Z" });
    const followups = createStorageFollowupTaskProvider({ store, workspaceId,
      scopeRecordReader: createPostgresRelationshipScopeReader({ client, workspaceId, purpose: "followups" }) });
    const legacy = createStorageReminderScheduleNotificationProvider({ store, workspaceId,
      scopeRecordReader: createPostgresRelationshipScopeReader({ client, workspaceId, purpose: "legacy-notifications" }) });
    const checks = [
      ["followups", () => followups.readFollowupGraph(actorId), () => createStorageFollowupTaskProvider({ store, workspaceId }).readFollowupGraph(actorId)],
      ["legacy", () => legacy.readReminderNotificationGraph(actorId), () => createStorageReminderScheduleNotificationProvider({ store, workspaceId }).readReminderNotificationGraph(actorId)],
    ] as const;
    const before = new Map<string, Awaited<ReturnType<typeof ledger.measure>>>();
    for (const [name, scoped, original] of checks) {
      const baseline = await ledger.measure(`${name}.original`, async () => await original());
      const measured = await ledger.measure(`${name}.scoped`, async () => await scoped());
      assert.equal(canonical(measured.result), canonical(baseline.result), `${name}: suggestions, source references and legal shared contacts preserved`);
      before.set(name, measured);
    }
    await client.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select $1,collection,collection||':foreign:'||n,'actor:foreign','manual','test',
      jsonb_build_object('id',collection||':foreign:'||n,'accountId','actor:foreign','private',repeat('x',2048)),now(),now()
      from generate_series(1,1000) n cross join (values ('tasks'),('contacts'),('connections'),('evidence'),('notifications')) c(collection)`, [workspaceId]);
    for (const [name, scoped, original] of checks) {
      const after = await ledger.measure(`${name}.after-foreign-growth`, async () => await scoped());
      const expected = before.get(name)!;
      assert.equal(canonical(after.result), canonical(expected.result));
      assert.deepEqual(after.cost, expected.cost, "Foreign records must not cross SQL boundary");
      const old = await ledger.measure(`${name}.unscoped-after-growth`, async () => await original());
      assert.ok(old.cost.bytes > after.cost.bytes, "Probe must detect old full-workspace amplification");
    }
    // Payload aliases on a row owned by another actor cannot grant access.
    await client.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values ($1,'connections','forged-owner','other','manual','test',$2,now(),now())`, [workspaceId, { accountId: actorId, contactId: "foreign-contact" }]);
    for (const purpose of ["followups", "legacy-notifications"] as const) {
      const read = createPostgresRelationshipScopeReader({ client, workspaceId, purpose });
      assert.ok(!(await read(actorId)).connections.some(record => record.recordId === "forged-owner"));
      assert.deepEqual(await read(""), { tasks: [], contacts: [], connections: [], evidence: [], notifications: [] });
    }
    console.log(JSON.stringify({ kind: "local_synthetic_result_json_not_neon_billing", costs: ledger.book() }));
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
