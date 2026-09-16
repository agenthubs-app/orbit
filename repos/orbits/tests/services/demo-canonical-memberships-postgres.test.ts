import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { ensureDemoCanonicalMemberships } from "../../scripts/demo-canonical-memberships";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventCoreMigrations } from "../../features/events/core/storage/migrations";

test("Demo activation repairs only empty flags, verifies baselines, rolls back and replays unchanged", {
  skip: process.env.ORBIT_DEMO_TEST_DATABASE_URL ? false : "ORBIT_DEMO_TEST_DATABASE_URL not configured",
}, async () => {
  const connectionString = process.env.ORBIT_DEMO_TEST_DATABASE_URL!;
  const schema = `demo_activation_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  const pool = new Pool({ connectionString, max: 1, options: `-c search_path=${schema}` });
  const client = createEventOperationsPostgresClient({ connectionString, pool });
  const workspaceId = "workspace:orbit-demo-fixtures";
  try {
    await admin.query(`create schema ${schema}`);
    await runEventCoreMigrations(client);
    await client.query(`create table orbit_records (workspace_id text, collection_name text, target_id text, payload jsonb)`);
    for (const [id, state] of [["event_01", "canonical"], ["event_02", "legacy"], ["event_03", "canonical"], ["event_04", "canonical"]]) {
      await client.query(`insert into event_ops_events
        (workspace_id,event_id,organizer_actor_id,created_at,updated_at,lifecycle_state_v2,registration_migration_state)
        values ($1,$2,'demo-owner',now(),now(),'published',$3)`, [workspaceId, id, state]);
    }
    const run = (eventIds: readonly string[]) => ensureDemoCanonicalMemberships({ client, eventIds, workspaceId });
    await assert.rejects(ensureDemoCanonicalMemberships({ client, eventIds: ["event_01"], workspaceId: "production" }), /isolated demo/);
    await assert.rejects(run(["foreign-event"]), /Unreviewed/);
    await assert.rejects(run(["event_01", "event_01"]), /duplicate/);
    assert.equal(await run(["event_01", "event_02"]), 2);
    const snapshot = async () => (await client.query(`select event_id,registration_migration_state,
      registration_migration_count,registration_migration_hash,registration_migrated_at,revision,updated_at
      from event_ops_events where workspace_id=$1 order by event_id`, [workspaceId])).rows;
    const baseline = await snapshot();
    assert.equal(await run(["event_01", "event_02"]), 2);
    assert.deepEqual(await snapshot(), baseline);
    const audits = (await client.query<{ n: string }>(`select count(*)::text n from event_ops_audit_log
      where action='registration_migration_activated'`)).rows;
    assert.equal(audits[0]?.n, "2");
    await client.query(`insert into orbit_records values ($1,'event_registrations','event_04','{}')`, [workspaceId]);
    await assert.rejects(run(["event_03", "event_04"]), /Refusing to replace/);
    assert.deepEqual(await snapshot(), baseline, "activation of event_03 rolls back with event_04 failure");
    await client.query(`update event_ops_audit_log set after_payload='{}' where event_id='event_01'`);
    await assert.rejects(run(["event_01"]), /audit does not match/);
    await client.query(`update event_ops_events set registration_migration_count=0 where event_id='event_03'`);
    await assert.rejects(run(["event_03"]), /metadata is incomplete/);
  } finally {
    await client.close();
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
  }
});
