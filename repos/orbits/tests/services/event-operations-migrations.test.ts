import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  EVENT_OPERATIONS_SCHEMA_MIGRATIONS,
  runEventOperationsMigrations,
} from "../../features/events/event-operations/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

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
  assert.match(calls[5] ?? "", /create table event_ops_task_attempts/i);
  assert.match(calls[5] ?? "", /retryable_failed|terminal_failed|lease_lost/i);
  assert.match(
    calls[5] ?? "",
    /event_ops_task_attempts_generation_kind_outcome_idx/i,
  );
  assert.doesNotMatch(calls[5] ?? "", /prompt|raw_response|profile_payload/i);
  assert.match(
    calls[6] ?? "",
    /create table event_ops_profile_response_versions/i,
  );
  assert.match(calls[6] ?? "", /event_attendees|matching_only|private/i);
  assert.match(calls[6] ?? "", /references event_ops_profile_versions/i);
  assert.match(calls[7] ?? "", /visibility = 'private'/i);
  assert.match(calls[7] ?? "", /matching_only/i);
  assert.match(calls[7] ?? "", /drop constraint/i);
  assert.match(calls[8] ?? "", /add column public_code text/i);
  assert.match(calls[8] ?? "", /create table event_event_versions/i);
  assert.match(calls[8] ?? "", /create table event_aliases/i);
  assert.match(
    calls[8] ?? "",
    /unique index event_ops_events_public_code_unique_idx[\s\S]*lower\(btrim\(public_code\)\)/i,
  );
  assert.match(calls[8] ?? "", /normalized_alias = lower\(btrim\(alias_value\)\)/i);
  assert.doesNotMatch(calls[8] ?? "", /alter column title set not null/i);
  assert.match(calls[9] ?? "", /create table event_ops_admission_policy_versions/i);
  assert.match(calls[9] ?? "", /create table event_ops_admission_application_versions/i);
  assert.match(calls[9] ?? "", /policy_version bigint not null/i);
  assert.match(calls[10] ?? "", /profile_edit_deadline_at timestamptz/i);
  assert.match(calls[10] ?? "", /origin text/i);
  assert.match(calls[10] ?? "", /admission_application_version bigint/i);
  assert.match(calls[11] ?? "", /create table event_ops_data_repair_runs/i);
  assert.match(calls[11] ?? "", /create table event_ops_data_repair_items/i);
  assert.match(calls[11] ?? "", /canonical_profile_empty_answer_v1/i);
  assert.doesNotMatch(calls[11] ?? "", /jsonb|answer_payload|response_payload/i);
  assert.match(
    calls[12] ?? "",
    /event_ops_canonical_membership_migration_runs/i,
  );
  assert.match(
    calls[12] ?? "",
    /event_ops_canonical_membership_migration_events/i,
  );
  assert.match(
    calls[13] ?? "",
    /event_ops_event_role_assignment_versions/i,
  );
  assert.match(
    calls[13] ?? "",
    /event_ops_event_role_assignment_heads/i,
  );
  assert.doesNotMatch(calls[13] ?? "", /\bowner\b[^\n]*role/i);
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
          and (
            table_name like 'event_ops_%'
            or table_name in ('event_event_versions', 'event_aliases')
          )
      `);
      assert.ok(tables.rows.some((row) => row.table_name === "event_ops_tasks"));
      assert.ok(
        tables.rows.some((row) => row.table_name === "event_ops_publications"),
      );
      assert.ok(
        tables.rows.some((row) => row.table_name === "event_ops_task_attempts"),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_profile_response_versions",
        ),
      );
      assert.ok(
        tables.rows.some((row) => row.table_name === "event_event_versions"),
      );
      assert.ok(tables.rows.some((row) => row.table_name === "event_aliases"));
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_admission_policy_versions",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_admission_application_heads",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_data_repair_runs",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_data_repair_items",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_canonical_membership_migration_runs",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_canonical_membership_migration_events",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_event_role_assignment_versions",
        ),
      );
      assert.ok(
        tables.rows.some(
          (row) => row.table_name === "event_ops_event_role_assignment_heads",
        ),
      );

      const applied = await migrationPool.query<{ count: string }>(`
        select count(*)::text as count from event_ops_schema_migrations
      `);
      assert.equal(applied.rows[0]?.count, "13");

      await migrationPool.query(`
        insert into event_ops_events (
          workspace_id,
          event_id,
          organizer_actor_id,
          lifecycle_state,
          revision,
          created_at,
          updated_at
        ) values (
          'workspace:legacy-v7',
          'event:legacy-v7',
          'actor:legacy-owner',
          'active',
          1,
          now(),
          now()
        )
      `);
      await migrationPool.query(`
        delete from event_ops_schema_migrations where version = 8;
        drop table event_aliases;
        drop table event_event_versions;
        alter table event_ops_events
          drop column public_code,
          drop column title,
          drop column description,
          drop column venue,
          drop column timezone,
          drop column starts_at,
          drop column ends_at,
          drop column lifecycle_state_v2,
          drop column source_payload,
          drop column cancelled_at,
          drop column archived_at,
          drop column event_version;
      `);
      await runEventOperationsMigrations(migrationPool);
      const legacyRow = await migrationPool.query<{
        lifecycle_state_v2: string | null;
        title: string | null;
      }>(`
        select lifecycle_state_v2, title
        from event_ops_events
        where workspace_id = 'workspace:legacy-v7'
          and event_id = 'event:legacy-v7'
      `);
      assert.deepEqual(legacyRow.rows[0], {
        lifecycle_state_v2: null,
        title: null,
      });

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
