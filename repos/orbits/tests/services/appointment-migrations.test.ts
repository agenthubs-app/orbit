import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresAppointmentNotificationProjector } from "../../features/appointments/notification-projector";
import { runAppointmentOutboxBatch } from "../../features/appointments/outbox-worker";
import { APPOINTMENT_MIGRATIONS, APPOINTMENT_SCHEMA_SQL, runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

test("appointment migration persists versioned aggregate, receipts, and independently claimable outbox", () => {
  assert.match(APPOINTMENT_SCHEMA_SQL, /appointment_aggregates/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /version bigint not null/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /appointment_command_receipts/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /idempotency_key text not null/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /primary key \(workspace_id, actor_id, idempotency_key\)/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /appointment_outbox/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /unique \(workspace_id, dedupe_key\)/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /lease_expires_at timestamptz/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /reschedule_pending/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /relationship_pair_id/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /appointment_active_relationship_pair_idx/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /appointment-v4|Requeued after appointment action notification projector repair/);
  assert.match(APPOINTMENT_SCHEMA_SQL, /appointment\.reschedule\.proposed/);
});

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test("appointment migrations upgrade v1, serialize concurrent runners, and roll back a failed migration on real PostgreSQL", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(client, [APPOINTMENT_MIGRATIONS[0]!]);
    const v1 = await pool.query<{ count: string }>("select count(*)::text as count from appointment_schema_migrations");
    assert.equal(v1.rows[0]?.count, "1");
    await Promise.all([runAppointmentMigrations(client), runAppointmentMigrations(client)]);
    const upgraded = await pool.query<{ count: string }>(`select count(*)::text as count
      from information_schema.columns where table_schema = current_schema()
        and table_name = 'appointment_aggregates'
        and column_name in ('relationship_pair_id', 'authority_request_id', 'contact_ids_by_actor')`);
    assert.equal(upgraded.rows[0]?.count, "3");
    const versions = await pool.query<{ count: string }>("select count(*)::text as count from appointment_schema_migrations");
    assert.equal(versions.rows[0]?.count, "4");
    const receiptColumns = await pool.query<{ count: string }>(`select count(*)::text as count
      from information_schema.columns where table_schema = current_schema()
        and table_name = 'appointment_command_receipts'
        and column_name in ('resource_id', 'command', 'request_hash', 'response_snapshot')`);
    assert.equal(receiptColumns.rows[0]?.count, "4");

    const failing = { name: "appointment-v5-deliberate-rollback", version: 5, sql: "create table appointment_failure_probe (id text primary key); select appointment_missing_function()" } as const;
    await assert.rejects(() => runAppointmentMigrations(client, [...APPOINTMENT_MIGRATIONS, failing]), /appointment_missing_function/);
    const rolledBack = await pool.query<{ table_name: string | null }>("select to_regclass('appointment_failure_probe')::text as table_name");
    assert.equal(rolledBack.rows[0]?.table_name, null);
    const failedVersion = await pool.query<{ count: string }>("select count(*)::text as count from appointment_schema_migrations where version = 5");
    assert.equal(failedVersion.rows[0]?.count, "0");
    assert.equal((await pool.query("select 1 as usable")).rows[0]?.usable, 1);
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});

test("appointment v4 repair requeues only missed action notifications and unknown events retry on a real PostgreSQL worker", { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" }, async () => {
  assert.ok(databaseUrl);
  const schema = `appointment_repair_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = "workspace:appointment-repair";
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await runAppointmentMigrations(client, APPOINTMENT_MIGRATIONS.slice(0, 3));
    await pool.query(`insert into appointment_aggregates (
      workspace_id, appointment_id, owner_actor_id, invitee_actor_id, contact_id,
      event_id, status, version, payload, created_at, updated_at,
      relationship_pair_id, authority_request_id, contact_ids_by_actor
    ) values ($1, 'appointment:repair', 'actor:a', 'actor:b', null,
      'event:launch', 'completed', 4, '{}'::jsonb, now(), now(),
      'pair:a-b', 'request:a-b', '{"actor:a":"contact:b","actor:b":"contact:a"}'::jsonb)`, [workspaceId]);
    const projection = JSON.stringify({ projection: { notificationIds: [], policy: "provider_not_configured" } });
    const delivered = JSON.stringify({ projection: { notificationIds: ["notification:existing"], policy: "in_app" } });
    await pool.query(`insert into appointment_outbox (
      workspace_id, outbox_event_id, appointment_id, aggregate_version, event_type,
      dedupe_key, payload, status, available_at, attempt_count, created_at, updated_at
    ) values
      ($1, 'outbox:missed', 'appointment:repair', 4, 'appointment.countered', 'dedupe:missed', $2::jsonb, 'completed', now(), 1, now(), now()),
      ($1, 'outbox:provider', 'appointment:repair', 4, 'appointment.meeting.requested', 'dedupe:provider', $2::jsonb, 'completed', now(), 1, now(), now()),
      ($1, 'outbox:delivered', 'appointment:repair', 4, 'appointment.proposed', 'dedupe:delivered', $3::jsonb, 'completed', now(), 1, now(), now())`, [workspaceId, projection, delivered]);

    await runAppointmentMigrations(client);
    const repaired = await pool.query<{ attempt_count: number; outbox_event_id: string; status: string }>("select outbox_event_id, status, attempt_count from appointment_outbox order by outbox_event_id");
    assert.deepEqual(repaired.rows, [
      { attempt_count: 1, outbox_event_id: "outbox:delivered", status: "completed" },
      { attempt_count: 0, outbox_event_id: "outbox:missed", status: "retry" },
      { attempt_count: 1, outbox_event_id: "outbox:provider", status: "completed" },
    ]);

    await pool.query("delete from appointment_outbox");
    await pool.query(`insert into appointment_outbox (
      workspace_id, outbox_event_id, appointment_id, aggregate_version, event_type,
      dedupe_key, payload, status, available_at, attempt_count, created_at, updated_at
    ) values ($1, 'outbox:unknown', 'appointment:repair', 4, 'appointment.unknown',
      'dedupe:unknown', '{"participantActorIds":["actor:a","actor:b"],"revision":1}'::jsonb,
      'pending', now(), 0, now(), now())`, [workspaceId]);
    const runtime = { client, workspaceId };
    const result = await runAppointmentOutboxBatch({ projector: createPostgresAppointmentNotificationProjector(runtime), runtime });
    assert.deepEqual(result, { completed: 0, failed: 0, retried: 1 });
    const unknown = await pool.query<{ attempt_count: number; status: string }>("select status, attempt_count from appointment_outbox where outbox_event_id = 'outbox:unknown'");
    assert.deepEqual(unknown.rows[0], { attempt_count: 1, status: "retry" });
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
