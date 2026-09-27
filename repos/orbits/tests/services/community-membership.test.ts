/**
 * W0003 社群加入记录（RW-06）：`orbit_records` collection `communityMembership`、recordId `current`。
 * 幂等、按 actor 隔离、并发只留一条；live 缺数据库时 fail closed。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMUNITY_MEMBERSHIP_COLLECTION,
  COMMUNITY_MEMBERSHIP_RECORD_ID,
} from "../../features/community/contract";
import {
  communityMembershipWorkspaceId,
  createStorageCommunityMembershipService,
  type CommunityMembershipPayload,
} from "../../features/community/membership";
import {
  readCommunityJoinedForActor,
  resetCommunityMembershipMockStoreForTests,
  resolveCommunityMembershipService,
} from "../../features/community/service-factory";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE = "workspace:community-test";

function clock(...stamps: string[]) {
  let index = 0;
  return () => stamps[Math.min(index++, stamps.length - 1)]!;
}

function communityRecords(store: ReturnType<typeof createMemoryLiveRecordStore<CommunityMembershipPayload>>, actorId: string) {
  return store.listRecords({
    collectionName: COMMUNITY_MEMBERSHIP_COLLECTION,
    limit: 10,
    workspaceId: communityMembershipWorkspaceId(WORKSPACE, actorId),
  });
}

test("a fresh actor is not joined, and joining writes one current record", async () => {
  const store = createMemoryLiveRecordStore<CommunityMembershipPayload>();
  const service = createStorageCommunityMembershipService({
    actorId: "actor:a",
    now: clock("2026-09-28T01:00:00.000Z"),
    store,
    workspaceId: WORKSPACE,
  });

  assert.deepEqual(await service.get(), { joined: false, joinedAt: null });
  assert.deepEqual(await service.join(), { joined: true, joinedAt: "2026-09-28T01:00:00.000Z" });
  assert.deepEqual(await service.get(), { joined: true, joinedAt: "2026-09-28T01:00:00.000Z" });

  const records = communityRecords(store, "actor:a");
  assert.equal(records.length, 1);
  assert.equal(records[0]!.recordId, COMMUNITY_MEMBERSHIP_RECORD_ID);
  assert.equal(records[0]!.userId, "actor:a");
  assert.deepEqual(records[0]!.payload, { joinedAt: "2026-09-28T01:00:00.000Z" });
});

test("joining again keeps the first joinedAt and still one record", async () => {
  const store = createMemoryLiveRecordStore<CommunityMembershipPayload>();
  const service = createStorageCommunityMembershipService({
    actorId: "actor:a",
    now: clock("2026-09-28T01:00:00.000Z", "2026-09-29T09:00:00.000Z"),
    store,
    workspaceId: WORKSPACE,
  });

  await service.join();
  assert.deepEqual(await service.join(), { joined: true, joinedAt: "2026-09-28T01:00:00.000Z" });
  assert.equal(communityRecords(store, "actor:a").length, 1);
});

test("concurrent joins race to a single record with one joinedAt", async () => {
  const store = createMemoryLiveRecordStore<CommunityMembershipPayload>();
  const make = (stamp: string) =>
    createStorageCommunityMembershipService({ actorId: "actor:a", now: () => stamp, store, workspaceId: WORKSPACE });

  const results = await Promise.all([
    make("2026-09-28T01:00:00.000Z").join(),
    make("2026-09-28T01:00:01.000Z").join(),
    make("2026-09-28T01:00:02.000Z").join(),
  ]);

  const stamps = new Set(results.map((result) => result.joinedAt));
  assert.equal(stamps.size, 1, "every racing request must report the winner's joinedAt");
  assert.equal(communityRecords(store, "actor:a").length, 1);
});

test("one actor's join is invisible to another actor", async () => {
  const store = createMemoryLiveRecordStore<CommunityMembershipPayload>();
  const a = createStorageCommunityMembershipService({ actorId: "actor:a", store, workspaceId: WORKSPACE });
  const b = createStorageCommunityMembershipService({ actorId: "actor:b", store, workspaceId: WORKSPACE });

  await a.join();
  assert.equal((await a.get()).joined, true);
  assert.deepEqual(await b.get(), { joined: false, joinedAt: null });
  assert.equal(communityRecords(store, "actor:b").length, 0);
});

test("the service refuses to run without an actor", () => {
  assert.throws(() =>
    createStorageCommunityMembershipService({
      actorId: "  ",
      store: createMemoryLiveRecordStore<CommunityMembershipPayload>(),
      workspaceId: WORKSPACE,
    }),
  );
});

const DATABASE_ENV_KEYS = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
  "ORBIT_LOCAL_DATABASE_URL",
  "ORBIT_DATABASE_TARGET",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

function withoutDatabase<T>(run: () => Promise<T>): Promise<T> {
  const previous = new Map(DATABASE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of DATABASE_ENV_KEYS) delete process.env[key];
  return run().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("live mode without a configured database fails closed with NOT_IMPLEMENTED", async () => {
  await withoutDatabase(async () => {
    const resolution = resolveCommunityMembershipService({ actorId: "actor:a", mode: "live" });
    assert.equal(resolution.success, false);
    if (resolution.success === false) {
      assert.equal(resolution.error.code, "NOT_IMPLEMENTED");
      assert.equal(resolution.error.capabilityId, "community-membership");
      assert.equal(resolution.error.requestedMode, "live");
    }
    // 服务端页面读不到时按「未加入」渲染，不抛错。
    assert.equal(await readCommunityJoinedForActor({ actorId: "actor:a", mode: "live" }), false);
  });
});

test("mock mode keeps joins in the shared in-process store", async () => {
  resetCommunityMembershipMockStoreForTests();
  try {
    const first = resolveCommunityMembershipService({ actorId: "actor:mock", mode: "mock" });
    assert.equal(first.success, true);
    if (first.success) await first.service.join();
    assert.equal(await readCommunityJoinedForActor({ actorId: "actor:mock", mode: "mock" }), true);
    assert.equal(await readCommunityJoinedForActor({ actorId: "actor:other", mode: "mock" }), false);
    assert.equal(await readCommunityJoinedForActor({ actorId: null, mode: "mock" }), false);
  } finally {
    resetCommunityMembershipMockStoreForTests();
  }
});
