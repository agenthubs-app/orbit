import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import {
  EVENT_EXPERIENCE_MIGRATIONS,
  EVENT_EXPERIENCE_SCHEMA_MIGRATIONS,
  runEventExperienceMigrations,
} from "../../features/events/experience/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const postgresSmokeEnabled = process.env.ORBIT_RUN_POSTGRES_SMOKE === "1";

test("experience migration uses canonical event-ops tables and a checksum ledger", () => {
  const sql = EVENT_EXPERIENCE_MIGRATIONS[0]?.sql ?? "";
  const migration = EVENT_EXPERIENCE_SCHEMA_MIGRATIONS[0];
  assert.equal(migration?.version, 1);
  assert.match(migration?.name ?? "", /event-experience-v1-versioned-heads/);
  assert.match(
    migration?.checksum ?? "",
    /^[0-9a-f]{64}$/,
  );
  assert.match(sql, /create table event_ops_experience_versions/i);
  assert.match(sql, /create table event_ops_experience_heads/i);
  assert.doesNotMatch(sql, /create table if not exists event_ops_experience_/i);
  assert.match(sql, /references event_ops_events \(workspace_id, event_id\)/i);
});

test("experience migration is versioned, idempotent, and anchored to event operations", {
  skip:
    postgresSmokeEnabled && databaseUrl
      ? false
      : "set ORBIT_RUN_POSTGRES_SMOKE=1 with ORBIT_EVENT_DATABASE_URL to run",
}, async () => {
  assert.ok(databaseUrl);
  const schema = `event_experience_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
  const migrationPool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    options: `-c search_path=${schema}`,
  });
  const client = createEventOperationsPostgresClient({
    connectionString: databaseUrl,
    pool: migrationPool,
  });

  try {
    await adminPool.query(`create schema ${schema}`);
    await migrationPool.query(`
      create table event_ops_events (
        workspace_id text not null,
        event_id text not null,
        primary key (workspace_id, event_id)
      )
    `);
    await Promise.all([
      runEventExperienceMigrations(client),
      runEventExperienceMigrations(client),
    ]);

    const ledger = await migrationPool.query<{ count: string }>(
      "select count(*)::text as count from event_ops_experience_schema_migrations",
    );
    assert.equal(ledger.rows[0]?.count, "1");
    assert.equal(
      (await migrationPool.query("select to_regclass('event_ops_experience_versions') as relation")).rows[0]?.relation,
      "event_ops_experience_versions",
    );
    assert.equal(
      (await migrationPool.query("select to_regclass('event_experience_versions') as relation")).rows[0]?.relation,
      null,
    );
    assert.deepEqual(
      (
        await migrationPool.query<{ count: string }>(`
          select count(*)::text as count
          from pg_constraint
          where conrelid in (
            'event_ops_experience_versions'::regclass,
            'event_ops_experience_heads'::regclass
          )
            and confrelid = 'event_ops_events'::regclass
        `)
      ).rows[0]?.count,
      "2",
    );
    assert.equal(
      EVENT_EXPERIENCE_SCHEMA_MIGRATIONS[0]?.name,
      "event-experience-v1-versioned-heads",
    );
  } finally {
    await client.close();
    await adminPool.query(`drop schema if exists ${schema} cascade`);
    await adminPool.end();
  }
});
