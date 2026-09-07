import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { EVENT_OPERATIONS_SCHEMA_MIGRATIONS } from "../../features/events/event-operations/storage/migrations";

test("the web runtime migration CLI initializes an empty database and preserves data on rerun", async () => {
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  assert.ok(config, "The migration smoke test requires a local test database.");
  const schema = `web_migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: config.connectionString, max: 1 });
  const url = new URL(config.connectionString);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const migrate = () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate-web-runtime.ts"], {
      env: { ...process.env, ORBIT_EVENT_DATABASE_URL: url.toString(), ORBIT_WORKSPACE_ID: `test:${schema}` },
      encoding: "utf8", timeout: 60_000,
    });
    // The CLI deliberately returns phase-only errors, never connection strings.
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Web runtime schemas migrated; no demo data seeded/);
  };
  const ledgers = ["event_ops_schema_migrations", "event_ops_experience_schema_migrations", "event_analytics_schema_migrations", "appointment_schema_migrations", "bc_ingest_schema_migrations"];
  try {
    await admin.query(`create schema ${schema}`);
    migrate();
    const tables = (await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname=$1", [schema])).rows.map((row) => row.tablename);
    for (const table of ["orbit_records", "event_ops_events", "event_ops_experience_versions", "event_analytics_roi_snapshots", "appointment_outbox", "bc_ingest_batches", ...ledgers]) {
      assert.ok(tables.includes(table), `missing runtime table ${table}`);
    }
    for (const table of tables.filter((name) => !ledgers.includes(name))) {
      const quoted = `"${table.replaceAll('"', '""')}"`;
      assert.equal((await pool.query(`select count(*)::int as count from ${quoted}`)).rows[0].count, 0, `${table} was seeded`);
    }
    assert.deepEqual((await pool.query("select version, name, checksum from event_ops_schema_migrations order by version")).rows,
      EVENT_OPERATIONS_SCHEMA_MIGRATIONS.map(({ version, name, checksum }) => ({ version, name, checksum })));
    const before = await Promise.all(ledgers.map(async (table) => (await pool.query(`select * from ${table} order by version`)).rows));
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,source_type,source_id,payload,created_at,updated_at)
      values ('test','migrationSmoke','sentinel','manual','migration-test','{"keep":true}',now(),now())`);
    migrate();
    const after = await Promise.all(ledgers.map(async (table) => (await pool.query(`select * from ${table} order by version`)).rows));
    assert.deepEqual(after, before, "rerun must preserve migration history, including application timestamps");
    assert.deepEqual((await pool.query("select payload from orbit_records where record_id='sentinel'")).rows, [{ payload: { keep: true } }]);
  } finally {
    await pool.end();
    try { await admin.query(`drop schema if exists ${schema} cascade`); }
    finally { await admin.end(); }
  }
});
