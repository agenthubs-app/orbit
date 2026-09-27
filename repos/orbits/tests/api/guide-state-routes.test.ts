/**
 * W0004 SC-02：`GET/PATCH /api/guide/state`。
 * 未登录 401（统一 envelope、不写库）、只读写本人记录（请求体里的身份字段不采信）、
 * PATCH 只接受 `{ bannerCollapsed: boolean }`、服务解析失败 503、存储抛错仍是 envelope。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createGuideStateRouteHandlers } from "../../app/api/guide/state/route-handler";
import {
  createStorageGuideStateService,
  GUIDE_STATE_COLLECTION,
  guideStateWorkspaceId,
  type GuideStatePayload,
} from "../../features/guide/guide-state";
import {
  resetGuideStateMockStoreForTests,
  resolveGuideStateService,
} from "../../features/guide/service-factory";
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const WORKSPACE = "workspace:guide-route-test";

function harness() {
  const store = createMemoryLiveRecordStore<GuideStatePayload>();
  let stamp = 0;
  const serviceForActor = (id: string) => ({
    mode: "mock" as const,
    service: createStorageGuideStateService({
      actorId: id,
      now: () => new Date(Date.UTC(2026, 9, 20, 1, 0, stamp++)).toISOString(),
      store,
      workspaceId: WORKSPACE,
    }),
    success: true as const,
  });
  const handlersFor = (id: string | null) =>
    createGuideStateRouteHandlers({
      resolveActor: async () => (id ? { id } : null),
      serviceForActor,
    });
  const recordsFor = (actorId: string) =>
    store.listRecords({
      collectionName: GUIDE_STATE_COLLECTION,
      limit: 10,
      workspaceId: guideStateWorkspaceId(WORKSPACE, actorId),
    });
  return { handlersFor, recordsFor, store };
}

const patch = (body: unknown) =>
  new Request("https://orbit.test/api/guide/state", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });

test("signed-out GET and PATCH are rejected with 401 before any write", async () => {
  const { handlersFor, store } = harness();
  const handlers = handlersFor(null);
  for (const response of [
    await handlers.GET(),
    await handlers.PATCH(patch({ bannerCollapsed: true })),
    // 未登录时连坏请求体也先报 401，不泄露接口形状。
    await handlers.PATCH(patch({ grandfathered: true })),
  ]) {
    assert.equal(response.status, 401);
    const body = (await response.json()) as { success: boolean; error: { code: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
  assert.deepEqual(
    await store.listRecords({ collectionName: GUIDE_STATE_COLLECTION, limit: 10, workspaceId: WORKSPACE }),
    [],
  );
});

test("GET returns the default state; PATCH bannerCollapsed persists and reads back across requests", async () => {
  const { handlersFor, recordsFor } = harness();
  const first = await handlersFor("actor:alice").GET();
  assert.equal(first.status, 200);
  assert.deepEqual(((await first.json()) as { data: unknown }).data, {
    bannerCollapsed: false,
    grandfathered: null,
    version: 1,
  });

  const collapsed = await handlersFor("actor:alice").PATCH(patch({ bannerCollapsed: true }));
  assert.equal(collapsed.status, 200);
  assert.equal(((await collapsed.json()) as { data: { bannerCollapsed: boolean } }).data.bannerCollapsed, true);

  // 新的一组 handler（另一个请求 / 另一台浏览器）读到同一个值。
  const readBack = await handlersFor("actor:alice").GET();
  assert.equal(((await readBack.json()) as { data: { bannerCollapsed: boolean } }).data.bannerCollapsed, true);
  assert.equal((await recordsFor("actor:alice")).length, 1);
});

test("PATCH only writes the signed-in actor's own record", async () => {
  const { handlersFor, recordsFor } = harness();
  await handlersFor("actor:alice").PATCH(patch({ bannerCollapsed: true }));
  assert.equal((await recordsFor("actor:bob")).length, 0);
  const bob = await handlersFor("actor:bob").GET();
  assert.equal(((await bob.json()) as { data: { bannerCollapsed: boolean } }).data.bannerCollapsed, false);
});

test("PATCH accepts exactly { bannerCollapsed: boolean }: grandfathered, identity and extra fields are 400", async () => {
  const { handlersFor, recordsFor } = harness();
  const handlers = handlersFor("actor:alice");
  for (const body of [
    { grandfathered: true },
    { bannerCollapsed: true, grandfathered: false },
    { bannerCollapsed: true, actorId: "actor:bob" },
    { bannerCollapsed: "yes" },
    {},
    [true],
    null,
    "not json",
  ]) {
    const response = await handlers.PATCH(patch(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    const payload = (await response.json()) as { success: boolean; error: { code: string } };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
  }
  assert.equal((await recordsFor("actor:alice")).length, 0);
  assert.equal((await recordsFor("actor:bob")).length, 0);
});

test("an unresolvable service fails closed with 503; a storage error is still an envelope", async () => {
  const unavailable = createGuideStateRouteHandlers({
    resolveActor: async () => ({ id: "actor:alice" }),
    serviceForActor: () => createNotImplementedFailure("guide-state", "live", ["mock"]),
  });
  const response = await unavailable.GET();
  assert.equal(response.status, 503);
  assert.equal(((await response.json()) as { success: boolean }).success, false);

  const broken = createGuideStateRouteHandlers({
    resolveActor: async () => ({ id: "actor:alice" }),
    serviceForActor: () => ({
      mode: "mock",
      service: {
        get: async () => {
          throw new Error("storage down");
        },
        recordGrandfathered: async () => {
          throw new Error("storage down");
        },
        setBannerCollapsed: async () => {
          throw new Error("storage down");
        },
      },
      success: true,
    }),
  });
  for (const result of [await broken.GET(), await broken.PATCH(patch({ bannerCollapsed: true }))]) {
    assert.ok(result.status >= 500);
    assert.equal(((await result.json()) as { success: boolean }).success, false);
  }

  const throwingActor = createGuideStateRouteHandlers({
    resolveActor: async () => {
      throw new Error("identity down");
    },
  });
  const identity = await throwingActor.GET();
  assert.ok(identity.status >= 500);
  assert.equal(((await identity.json()) as { success: boolean }).success, false);
});

test("the mock factory keeps one store per process and isolates actors", async () => {
  resetGuideStateMockStoreForTests();
  const alice = resolveGuideStateService({ actorId: "actor:alice", mode: "mock" });
  const bob = resolveGuideStateService({ actorId: "actor:bob", mode: "mock" });
  assert.ok(alice.success && bob.success);
  await alice.service.setBannerCollapsed(true);
  const again = resolveGuideStateService({ actorId: "actor:alice", mode: "mock" });
  assert.ok(again.success);
  assert.equal((await again.service.get()).bannerCollapsed, true);
  assert.equal((await bob.service.get()).bannerCollapsed, false);
  resetGuideStateMockStoreForTests();
});
