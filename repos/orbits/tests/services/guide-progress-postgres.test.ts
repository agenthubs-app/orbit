/**
 * W0004 SC-02：真实 PostgreSQL `orbit_records` 上的已确认联系人计数与引导记录，按 actor 隔离。
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库，在独立 schema 里建表、用完即删。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  createStorageGuideStateService,
  type GuideStatePayload,
} from "../../features/guide/guide-state";
import {
  createPostgresConfirmedContactCounter,
  createPostgresConfirmedContactSampler,
} from "../../features/guide/progress";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** 真实库只能是本机回环地址：不满足就失败（不是 skip），也不打印连接串。 */
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

async function withSchema(run: (pool: Pool, workspaceId: string) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `guide_${randomUUID().replaceAll("-", "")}`;
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
    await run(pool, workspaceId);
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
}

test("confirmed contact count only sees the actor's own, initialised, undeleted, named contacts (W0054 review P2-1: a blank name does not count)", databaseTest, async () => {
  await withSchema(async (pool, workspaceId) => {
    const store = createPostgresLiveRecordStore({ client: pool });
    const stamp = "2026-10-20T00:00:00.000Z";
    const contact = (
      recordId: string,
      userId: string,
      payload: Record<string, unknown>,
      lifecycleState: "active" | "deleted" = "active",
      workspace = workspaceId,
    ) =>
      store.upsertRecord({
        collectionName: "contacts",
        createdAt: stamp,
        deletedAt: lifecycleState === "deleted" ? stamp : null,
        evidenceIds: ["evidence:test"],
        lifecycleState,
        payload: { id: recordId, displayName: `Name ${recordId}`, ...payload },
        recordId,
        sourceId: "test",
        sourceType: "manual",
        updatedAt: stamp,
        userId,
        workspaceId: workspace,
      });

    // alice：3 位有效 + 1 位初始化中 + 1 位已删除 + 1 位 accountId 是别人
    await contact("a1", "actor:alice", { accountId: "actor:alice" });
    await contact("a2", "actor:alice", { accountId: "actor:alice", lifecycleInitialization: "ready" });
    await contact("a3", "actor:alice", {});
    await contact("a4", "actor:alice", { accountId: "actor:alice", lifecycleInitialization: "pending" });
    await contact("a5", "actor:alice", { accountId: "actor:alice" }, "deleted");
    await contact("a6", "actor:alice", { accountId: "actor:mallory" });
    // W0054（review P2-1）：姓名为空或只有空白的记录不算已确认联系人（与快照、门槛同一谓词）。
    await contact("a7", "actor:alice", { accountId: "actor:alice", displayName: "  " });
    await contact("a8", "actor:alice", { accountId: "actor:alice", displayName: null });
    // bob：1 位；另一个 workspace 里的 alice 记录不算
    await contact("b1", "actor:bob", { accountId: "actor:bob" });
    await contact("x1", "actor:alice", { accountId: "actor:alice" }, "active", `${workspaceId}:other`);

    const count = createPostgresConfirmedContactCounter({ client: pool, workspaceId });
    assert.equal(await count("actor:alice"), 3);
    assert.equal(await count("actor:bob"), 1);
    assert.equal(await count("actor:nobody"), 0);
    await assert.rejects(() => count("  "), /ACTOR_REQUIRED/);
  });
});

test("W0006 contact samples: oldest 3 of the actor's own confirmed contacts, display fields only", databaseTest, async () => {
  await withSchema(async (pool, workspaceId) => {
    const store = createPostgresLiveRecordStore({ client: pool });
    const contact = (recordId: string, userId: string, createdAt: string, payload: Record<string, unknown>) =>
      store.upsertRecord({
        collectionName: "contacts",
        createdAt,
        evidenceIds: ["evidence:test"],
        lifecycleState: "active",
        payload: { id: recordId, ...payload },
        recordId,
        sourceId: "test",
        sourceType: "manual",
        updatedAt: createdAt,
        userId,
        workspaceId,
      });
    await contact("s4", "actor:alice", "2026-10-04T00:00:00.000Z", { accountId: "actor:alice", displayName: "第四位" });
    await contact("s1", "actor:alice", "2026-10-01T00:00:00.000Z", { accountId: "actor:alice", displayName: "王砚", organization: "北辰精工", role: "采购部长", primaryEmail: "hidden@example.test" });
    await contact("s2", "actor:alice", "2026-10-02T00:00:00.000Z", { displayName: "佐藤美咲" });
    await contact("s0", "actor:alice", "2026-09-30T00:00:00.000Z", { accountId: "actor:alice", displayName: "初始化中", lifecycleInitialization: "pending" });
    await contact("s3", "actor:alice", "2026-10-03T00:00:00.000Z", { accountId: "actor:alice", displayName: "林志远", organization: " " });
    await contact("b1", "actor:bob", "2026-09-01T00:00:00.000Z", { accountId: "actor:bob", displayName: "Bob 的联系人" });

    const sample = createPostgresConfirmedContactSampler({ client: pool, workspaceId });
    assert.deepEqual(await sample("actor:alice"), [
      { displayName: "王砚", organization: "北辰精工", role: "采购部长" },
      { displayName: "佐藤美咲", organization: null, role: null },
      { displayName: "林志远", organization: null, role: null },
    ]);
    assert.deepEqual(await sample("actor:bob"), [{ displayName: "Bob 的联系人", organization: null, role: null }]);
    assert.deepEqual(await sample("actor:nobody"), []);
    await assert.rejects(() => sample(" "), /ACTOR_REQUIRED/);
  });
});

test("guide state rows are one per actor and concurrent writes keep both fields", databaseTest, async () => {
  await withSchema(async (pool, workspaceId) => {
    const store = createPostgresLiveRecordStore<GuideStatePayload>({ client: pool });
    let tick = 0;
    const serviceFor = (actorId: string) =>
      createStorageGuideStateService({
        actorId,
        now: () => new Date(Date.UTC(2026, 9, 20, 0, 0, 0, tick++)).toISOString(),
        store,
        workspaceId,
      });

    const alice = serviceFor("actor:alice");
    await Promise.all([alice.recordGrandfathered(true), alice.setBannerCollapsed(true)]);
    const aliceState = await alice.get();
    assert.equal(aliceState.bannerCollapsed, true);
    assert.equal(aliceState.grandfathered, true);

    // 并发的第二次判定不改写第一次的结果。
    await Promise.all([alice.recordGrandfathered(false), alice.recordGrandfathered(false)]);
    assert.equal((await alice.get()).grandfathered, true);

    assert.deepEqual(await serviceFor("actor:bob").get(), {
      bannerCollapsed: false,
      completedAt: null,
      currentStep: null,
      grandfathered: null,
      step1Skipped: false,
      version: 2,
    });
    const rows = await pool.query<{ count: string }>(
      "select count(*)::text as count from orbit_records where collection_name = 'guideState'",
    );
    assert.equal(rows.rows[0]!.count, "1");
  });
});
