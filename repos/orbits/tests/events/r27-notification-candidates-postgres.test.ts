/** R27 SC-R27-13：通知候选查询在真实 schema 上能跑（列名 / 连接条件与迁移一致；空库返回空）。 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { readEventNotificationCandidates } from "../../features/events/journey/notification-job";
import { runPlanMigrations } from "../../features/plans/migrations";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

test("event notification candidates query runs against the migrated schema", databaseTest, async () => {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `r27_notify_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runEventOperationsMigrations(pool as never);
    await runPlanMigrations(pool);
    const rows = await readEventNotificationCandidates((sql, values) => pool.query(sql, values as unknown[]) as never, "workspace:r27", new Date("2026-10-07T00:00:00.000Z"));
    assert.deepEqual(rows, []);
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  }
});
