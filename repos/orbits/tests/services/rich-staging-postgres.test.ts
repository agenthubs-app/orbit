import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Client, type QueryResult } from "pg";
import type { EventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { applyRichStagingExpansion, RICH_STAGING_LIMITS } from "../../scripts/lib/rich-staging";
import { STAGING_WORKSPACE, validateStagingTarget } from "../../scripts/lib/minimal-staging";

test("owned local staging: real lifecycle, exact counts, auth, isolation, replay and rollback", {
  skip: !process.env.ORBIT_RICH_STAGING_PRIVATE_CONFIG,
}, async () => {
  const config = JSON.parse(readFileSync(process.env.ORBIT_RICH_STAGING_PRIVATE_CONFIG!, "utf8")) as {password: string};
  const connectionString = "postgresql://li@localhost:5432/orbit_staging_20260917";
  validateStagingTarget(connectionString, false);
  const pg = new Client({connectionString});
  let queries = 0, returnedBytes = 0;
  const client: EventOperationsPostgresClient = {
    async query<T>(sql: string, values?: readonly unknown[]) {
      assert.ok(++queries < RICH_STAGING_LIMITS.queries);
      const raw = await pg.query(sql, values ? [...values] : undefined);
      const results: QueryResult[] = Array.isArray(raw) ? raw : [raw];
      const rows = results.flatMap(r => r.rows) as T[];
      returnedBytes += Buffer.byteLength(JSON.stringify(rows));
      assert.ok(returnedBytes < RICH_STAGING_LIMITS.returnedBytes);
      return {rows, rowCount: results.reduce((n,r) => n + (r.rowCount ?? r.rows.length), 0)};
    },
    transaction: async operation => operation(client),
    close: async () => {},
  };
  await pg.connect();
  try {
    const before = (await pg.query("select count(*)::int as records from orbit_records")).rows;
    await pg.query("begin isolation level serializable");
    const result = await applyRichStagingExpansion(client, config.password, "2026-09-17T09:00:00.000Z");
    assert.equal(result.contacts, 30);
    assert.equal(result.events, 10);
    assert.equal(result.replayed, false);
    assert.ok("lifecycleIssues" in result);
    assert.equal(result.lifecycleIssues, 0);
    const stages = await pg.query("select payload->>'stage' as stage,count(*)::int as count from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='connections' group by payload->>'stage' order by stage", [STAGING_WORKSPACE, result.actorId]);
    assert.deepEqual(stages.rows, [{stage: "active", count: 9}, {stage: "archived", count: 6}, {stage: "needs_follow_up", count: 9}, {stage: "nurture", count: 6}]);
    const activeTasks = await pg.query("select count(*)::int as count from orbit_records where workspace_id=$1 and user_id=$2 and collection_name='tasks' and payload->>'status'='open'", [STAGING_WORKSPACE, result.actorId]);
    assert.equal(activeTasks.rows[0].count, 15);
    const empty = await pg.query("select count(*)::int as count from orbit_records where workspace_id=$1 and collection_name='contacts' and user_id=(select user_id from orbit_records where workspace_id=$1 and collection_name='auth_users' and payload->>'email'='empty@orbit.example.test')", [STAGING_WORKSPACE]);
    assert.equal(empty.rows[0].count, 0);
    const preReplay = (await pg.query("select count(*)::int as records from orbit_records")).rows;
    const replay = await applyRichStagingExpansion(client, config.password, "2026-09-18T09:00:00.000Z");
    assert.equal(replay.replayed, true);
    assert.deepEqual((await pg.query("select count(*)::int as records from orbit_records")).rows, preReplay);
    console.info(JSON.stringify({localQueries: queries, approximateReturnedBytes: returnedBytes, records: result.records, seedBytes: result.seedBytes}));
    await pg.query("rollback");
    assert.deepEqual((await pg.query("select count(*)::int as records from orbit_records")).rows, before);
    assert.equal((await pg.query("select count(*)::int as count from event_ops_events")).rows[0].count, 2);
  } finally {
    await pg.query("rollback").catch(() => {});
    await pg.end();
  }
});
