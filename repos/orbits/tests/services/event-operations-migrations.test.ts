import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  EVENT_OPERATIONS_SCHEMA_MIGRATIONS,
  runEventOperationsMigrations,
} from "../../features/events/event-operations/storage/migrations";

test("event operations migrations use one implicit transaction per statement", async () => {
  const calls: string[] = [];

  await runEventOperationsMigrations({
    async query(text) {
      calls.push(text);
    },
  });

  assert.equal(calls.length, EVENT_OPERATIONS_SCHEMA_MIGRATIONS.length + 1);
  for (const sql of calls) {
    assert.doesNotMatch(sql, /\bbegin\s*;/i);
    assert.doesNotMatch(sql, /\bcommit\s*;/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /^\s*do\s+\$/i);
  }
  assert.match(calls[1] ?? "", /create table event_ops_tasks/i);
  assert.equal(calls[1]?.match(/\blease_epoch\b\s+bigint/gi)?.length, 1);
  assert.match(calls[1] ?? "", /for update skip locked|event_ops_tasks_claim_idx/i);
  assert.match(calls[2] ?? "", /registration_migration_state/i);
  assert.match(calls[2] ?? "", /membership_version bigint/i);
  assert.match(calls[3] ?? "", /durable_outbox|lease_epoch bigint/i);
  assert.match(calls[3] ?? "", /completion_payload jsonb/i);
  assert.match(calls[4] ?? "", /ai_request_fingerprint/i);
  assert.match(calls[4] ?? "", /legacy:unversioned/i);
});

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test(
  "event operations migration executes idempotently and leaves the pool usable after failure",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_test_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const migrationPool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      options: `-c search_path=${schema}`,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(migrationPool);
      await runEventOperationsMigrations(migrationPool);

      const tables = await migrationPool.query<{ table_name: string }>(`
        select table_name
        from information_schema.tables
        where table_schema = current_schema()
          and table_name like 'event_ops_%'
      `);
      assert.ok(tables.rows.some((row) => row.table_name === "event_ops_tasks"));
      assert.ok(
        tables.rows.some((row) => row.table_name === "event_ops_publications"),
      );

      const applied = await migrationPool.query<{ count: string }>(`
        select count(*)::text as count from event_ops_schema_migrations
      `);
      assert.equal(applied.rows[0]?.count, "4");

      await migrationPool.query(`
        delete from event_ops_schema_migrations where version = 2;
        alter table event_ops_generation_participants
          drop column membership_version;
        alter table event_ops_profile_versions
          drop column effective_at;
        alter table event_ops_membership_versions
          drop column effective_at;
        alter table event_ops_events
          drop column registration_migration_state,
          drop column registration_migration_count,
          drop column registration_migration_hash,
          drop column registration_migrated_at;
      `);
      await runEventOperationsMigrations(migrationPool);
      const upgraded = await migrationPool.query<{ count: string }>(`
        select count(*)::text as count
        from information_schema.columns
        where table_schema = current_schema()
          and (
            (table_name = 'event_ops_events'
              and column_name = 'registration_migration_state')
            or
            (table_name = 'event_ops_generation_participants'
              and column_name = 'membership_version')
          )
      `);
      assert.equal(upgraded.rows[0]?.count, "2");
      await runEventOperationsMigrations(migrationPool);

      await migrationPool.query(`
        update event_ops_schema_migrations
        set checksum = 'deliberate-checksum-mismatch'
        where version = 1
      `);
      await assert.rejects(
        runEventOperationsMigrations(migrationPool),
        /checksum mismatch/i,
      );

      const usable = await migrationPool.query<{ answer: number }>(
        "select 1 as answer",
      );
      assert.equal(usable.rows[0]?.answer, 1);
    } finally {
      await migrationPool.end();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
