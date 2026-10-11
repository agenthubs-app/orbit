import { Pool } from "pg";

import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const configuredDatabaseEnvKeys = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
] as const;

// Any 64-bit key works; it only has to be the same in every test process.
const PREPARE_LOCK_KEY = "7102026101100001";

/**
 * Tests that go through module-level live runtimes (or check the configured
 * schema itself) read the configured database's public schema. A fresh local
 * test database has no tables there, so run the product migration first —
 * the same `runOrbitRecordsMigration` the setup scripts run on a real
 * database. Idempotent; the advisory lock keeps parallel test files from
 * racing on `create table if not exists`. No-op when no database is set
 * (scripts/run-node-tests.mjs already refuses non-local URLs).
 */
export async function migrateConfiguredTestDatabase(): Promise<void> {
  const urls = new Set(
    configuredDatabaseEnvKeys
      .map((key) => process.env[key]?.trim())
      .filter((value): value is string => Boolean(value)),
  );
  for (const connectionString of urls) {
    const pool = new Pool({ connectionString, max: 1 });
    try {
      const client = await pool.connect();
      try {
        await client.query("select pg_advisory_lock($1)", [PREPARE_LOCK_KEY]);
        try {
          await runOrbitRecordsMigration(client);
        } finally {
          await client.query("select pg_advisory_unlock($1)", [PREPARE_LOCK_KEY]);
        }
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  }
}
