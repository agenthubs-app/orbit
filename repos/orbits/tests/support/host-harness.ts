/** R17 主催：Postgres 测试库（每个测试一个临时 schema，跑全量 event-operations 迁移 + 记录表 + sync_revision）。 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient, type EventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventSyncRevisionMigration } from "../../features/events/event-operations/storage/sync-revision";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { assertLoopbackDatabaseUrl } from "./plan-matching-harness";

export const hostDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
export const hostDatabaseTest = { skip: hostDatabaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 120_000 };

export interface HostDatabase {
  pool: Pool;
  client: EventOperationsPostgresClient;
  workspaceId: string;
  schema: string;
}

export async function withHostDatabase(run: (db: HostDatabase) => Promise<void>): Promise<void> {
  assert.ok(hostDatabaseUrl);
  assertLoopbackDatabaseUrl(hostDatabaseUrl);
  const suffix = randomUUID().replaceAll("-", "");
  const schema = `r17_host_${suffix}`;
  const admin = new Pool({ connectionString: hostDatabaseUrl, max: 1 });
  const pool = new Pool({ connectionString: hostDatabaseUrl, max: 8, options: `-c search_path=${schema}` });
  const client = createEventOperationsPostgresClient({ connectionString: hostDatabaseUrl, max: 8, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runEventOperationsMigrations(pool);
    await runEventSyncRevisionMigration(pool);
    await run({ client, pool, schema, workspaceId: `workspace:r17:${suffix}` });
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
}
