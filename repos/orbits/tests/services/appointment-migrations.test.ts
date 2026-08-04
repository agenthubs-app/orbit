import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
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
    assert.equal(versions.rows[0]?.count, "3");
    const receiptColumns = await pool.query<{ count: string }>(`select count(*)::text as count
      from information_schema.columns where table_schema = current_schema()
        and table_name = 'appointment_command_receipts'
        and column_name in ('resource_id', 'command', 'request_hash', 'response_snapshot')`);
    assert.equal(receiptColumns.rows[0]?.count, "4");

    const failing = { name: "appointment-v4-deliberate-rollback", version: 4, sql: "create table appointment_failure_probe (id text primary key); select appointment_missing_function()" } as const;
    await assert.rejects(() => runAppointmentMigrations(client, [...APPOINTMENT_MIGRATIONS, failing]), /appointment_missing_function/);
    const rolledBack = await pool.query<{ table_name: string | null }>("select to_regclass('appointment_failure_probe')::text as table_name");
    assert.equal(rolledBack.rows[0]?.table_name, null);
    const failedVersion = await pool.query<{ count: string }>("select count(*)::text as count from appointment_schema_migrations where version = 4");
    assert.equal(failedVersion.rows[0]?.count, "0");
    assert.equal((await pool.query("select 1 as usable")).rows[0]?.usable, 1);
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
