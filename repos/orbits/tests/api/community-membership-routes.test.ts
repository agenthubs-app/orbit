/**
 * W0003 SC-02：`GET/PUT /api/community/membership`。
 * 未登录 401（统一 envelope）、只写本人（请求体身份字段不采信）、重复 PUT 只一条、
 * 服务解析失败时 fail closed。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createCommunityMembershipRouteHandlers } from "../../app/api/community/membership/route-handler";
import {
  COMMUNITY_MEMBERSHIP_COLLECTION,
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
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE = "workspace:community-route-test";

function harness(actorId: string | null) {
  const store = createMemoryLiveRecordStore<CommunityMembershipPayload>();
  let stamp = 0;
  const serviceForActor = (id: string) => ({
    mode: "mock" as const,
    service: createStorageCommunityMembershipService({
      actorId: id,
      now: () => new Date(Date.UTC(2026, 8, 28, 1, 0, stamp++)).toISOString(),
      store,
      workspaceId: WORKSPACE,
    }),
    success: true as const,
  });
  const handlersFor = (id: string | null) =>
    createCommunityMembershipRouteHandlers({
      resolveActor: async () => (id ? { id } : null),
      serviceForActor,
    });
  return { handlers: handlersFor(actorId), handlersFor, store };
}

function recordsFor(store: ReturnType<typeof harness>["store"], actorId: string) {
  return store.listRecords({
    collectionName: COMMUNITY_MEMBERSHIP_COLLECTION,
    limit: 10,
    workspaceId: communityMembershipWorkspaceId(WORKSPACE, actorId),
  });
}

test("signed-out GET and PUT are rejected with 401 before any write", async () => {
  const { handlers, store } = harness(null);

  for (const response of [await handlers.GET(), await handlers.PUT()]) {
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
  assert.equal(store.listRecords({ limit: "unbounded", workspaceId: WORKSPACE }).length, 0);
});

test("PUT marks the signed-in actor as joined and GET reads it back", async () => {
  const { handlers } = harness("actor:me");

  const before = await (await handlers.GET()).json();
  assert.deepEqual(before, { data: { joined: false, joinedAt: null }, success: true });

  const put = await handlers.PUT();
  assert.equal(put.status, 200);
  assert.equal(put.headers.get("Cache-Control"), "no-store");
  const joined = await put.json();
  assert.equal(joined.success, true);
  assert.equal(joined.data.joined, true);
  assert.equal(typeof joined.data.joinedAt, "string");

  const after = await (await handlers.GET()).json();
  assert.deepEqual(after.data, joined.data);
});

test("repeated PUT is idempotent: one record, first joinedAt kept", async () => {
  const { handlers, store } = harness("actor:me");

  const first = (await (await handlers.PUT()).json()).data;
  const second = (await (await handlers.PUT()).json()).data;
  const third = (await (await handlers.PUT()).json()).data;

  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(recordsFor(store, "actor:me").length, 1);
});

test("a PUT only ever writes the caller's own record", async () => {
  const { handlersFor, store } = harness("actor:me");
  const me = handlersFor("actor:me");
  const other = handlersFor("actor:other");

  // 路由不读请求体；即使客户端塞了别人的 id，也只写当前登录者。
  await me.PUT();

  assert.equal(recordsFor(store, "actor:me").length, 1);
  assert.equal(recordsFor(store, "actor:other").length, 0);
  assert.deepEqual((await (await other.GET()).json()).data, { joined: false, joinedAt: null });
});

test("an unresolvable service fails closed with 503 and no write", async () => {
  const handlers = createCommunityMembershipRouteHandlers({
    resolveActor: async () => ({ id: "actor:me" }),
    serviceForActor: () => createNotImplementedFailure("community-membership", "live", ["mock", "live"]),
  });

  const response = await handlers.PUT();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(body.error.context.reason, "NOT_IMPLEMENTED");
});

test("a storage failure surfaces as a safe envelope error, not a fake join", async () => {
  const handlers = createCommunityMembershipRouteHandlers({
    resolveActor: async () => ({ id: "actor:me" }),
    serviceForActor: () => ({
      mode: "live",
      service: {
        get: async () => {
          throw new Error("connection refused: secret-host");
        },
        join: async () => {
          throw new Error("connection refused: secret-host");
        },
      },
      success: true,
    }),
  });

  const response = await handlers.PUT();
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.doesNotMatch(JSON.stringify(body), /secret-host/);
});

test("a join survives a refresh and another client: fresh GET and the server page reader both see it", async () => {
  // 同一个 mock 存储实例（factory 的进程内存储），不共享任何组件状态：
  // 每次都新建 handler / 新请求，模拟刷新与另一台设备。
  resetCommunityMembershipMockStoreForTests();
  try {
    const clientFor = () =>
      createCommunityMembershipRouteHandlers({
        resolveActor: async () => ({ id: "actor:persist" }),
        serviceForActor: (actorId) => resolveCommunityMembershipService({ actorId, mode: "mock" }),
      });

    const put = await (await clientFor().PUT()).json();
    assert.equal(put.success, true);
    assert.equal(put.data.joined, true);
    const joinedAt = put.data.joinedAt as string;

    // (a) 刷新 / 另一个客户端：全新的 handler 与请求。
    const refreshed = await (await clientFor().GET()).json();
    assert.deepEqual(refreshed.data, { joined: true, joinedAt });

    // (b) 服务端页面读取器（events/page.tsx、agent/page.tsx 用的同一个函数）。
    assert.equal(await readCommunityJoinedForActor({ actorId: "actor:persist", mode: "mock" }), true);
    assert.equal(await readCommunityJoinedForActor({ actorId: "actor:someone-else", mode: "mock" }), false);
  } finally {
    resetCommunityMembershipMockStoreForTests();
  }
});
