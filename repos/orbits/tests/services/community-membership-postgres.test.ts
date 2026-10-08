/**
 * W0003：社群加入记录在真实 PostgreSQL `orbit_records` 上的幂等与隔离。
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库，在独立 schema 里建表、用完即删。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { COMMUNITY_MEMBERSHIP_COLLECTION } from "../../features/community/contract";
import {
  communityMembershipWorkspaceId,
  createStorageCommunityMembershipService,
  type CommunityMembershipPayload,
} from "../../features/community/membership";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * 真实库只能是本机回环地址：不满足就让测试失败（不是 skip），也不打印连接串。
 * `scripts/assert-local-test-databases.mjs` 还放行 `postgres` / `db` 容器名，这里更严，只认回环。
 */
function assertLoopbackDatabaseUrl(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    assert.fail("ORBIT_EVENT_DATABASE_URL is not a valid URL.");
  }
  assert.ok(
    LOOPBACK_HOSTS.has(hostname),
    "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL (localhost / 127.0.0.1 / ::1).",
  );
}

test("the PostgreSQL guard accepts only loopback hosts", () => {
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgresql://u:p@localhost:5432/orbit_test"));
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgresql://u:p@127.0.0.1/orbit_test"));
  assert.doesNotThrow(() => assertLoopbackDatabaseUrl("postgresql://u:p@[::1]:5432/orbit_test"));
  assert.throws(() => assertLoopbackDatabaseUrl("postgresql://u:p@ep-cloud.neon.tech/orbit"));
  assert.throws(() => assertLoopbackDatabaseUrl("postgresql://u:p@db:5432/orbit"));
  assert.throws(() => assertLoopbackDatabaseUrl("not a url"));
});

test("PostgreSQL keeps one membership row per actor under concurrent joins", databaseTest, async () => {
  assert.ok(databaseUrl);
  // 在建任何连接池之前先拦截非回环地址。
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `community_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:${randomUUID()}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2000,
    max: 4,
    options: `-c search_path=${schema} -c statement_timeout=5000`,
  });

  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore<CommunityMembershipPayload>({ client: pool });
    const serviceFor = (actorId: string, stamp: string) =>
      createStorageCommunityMembershipService({ actorId, now: () => stamp, store, workspaceId });

    const results = await Promise.all([
      serviceFor("actor:alice", "2026-09-28T01:00:00.000Z").join(),
      serviceFor("actor:alice", "2026-09-28T01:00:01.000Z").join(),
      serviceFor("actor:alice", "2026-09-28T01:00:02.000Z").join(),
    ]);
    assert.equal(new Set(results.map((result) => result.joinedAt)).size, 1);

    // 之后再加入仍是第一次的时间。
    const later = await serviceFor("actor:alice", "2026-10-01T00:00:00.000Z").join();
    assert.equal(later.joinedAt, results[0]!.joinedAt);

    const rows = await pool.query<{ count: string }>(
      "select count(*)::text as count from orbit_records where workspace_id = $1 and collection_name = $2",
      [communityMembershipWorkspaceId(workspaceId, "actor:alice"), COMMUNITY_MEMBERSHIP_COLLECTION],
    );
    assert.equal(rows.rows[0]!.count, "1");

    // 另一个人读不到、也没有被写入。
    assert.deepEqual(await serviceFor("actor:bob", "2026-09-28T02:00:00.000Z").get(), {
      joined: false,
      joinedAt: null,
    });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
