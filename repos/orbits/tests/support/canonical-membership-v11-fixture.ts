import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { Pool } from "pg";

import {
  EVENT_OPERATIONS_SCHEMA_MIGRATIONS,
  runEventOperationsMigrations,
} from "../../features/events/event-operations/storage/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

export async function createCanonicalMembershipV11Fixture(
  context: TestContext,
  databaseUrl: string,
) {
  const schema = `canonical_v11_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const connectionString = url.toString();
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString, max: 1 });
  context.after(async () => {
    try {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  });
  await admin.query(`create schema ${schema}`);
  const statements: string[] = [];
  await runEventOperationsMigrations({
    async query(sql) {
      statements.push(sql);
    },
  });
  assert.deepEqual(
    EVENT_OPERATIONS_SCHEMA_MIGRATIONS.slice(0, 11).map((item) => item.version),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  );
  assert.equal(statements.length, EVENT_OPERATIONS_SCHEMA_MIGRATIONS.length + 1);
  // Replay the real bootstrap and v1-v11 SQL without touching the source schema.
  for (const sql of statements.slice(0, 12)) {
    await pool.query(sql);
  }
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const state = await pool.query(`select max(version)::int as version,
    to_regclass('event_ops_canonical_membership_migration_runs')::text as ledger
    from event_ops_schema_migrations`);
  assert.deepEqual(state.rows[0], { version: 11, ledger: null });
  return { connectionString, pool };
}
