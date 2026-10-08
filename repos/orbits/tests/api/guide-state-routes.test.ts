/**
 * W0004 SC-02 / W0006 SC-04：`GET/PATCH /api/guide/state`。
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
    completedAt: null,
    currentStep: null,
    grandfathered: null,
    step1Skipped: false,
    version: 2,
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

test("PATCH accepts only client fields: grandfathered, completedAt, identity and extra fields are 400", async () => {
  const { handlersFor, recordsFor } = harness();
  const handlers = handlersFor("actor:alice");
  for (const body of [
    { grandfathered: true },
    { bannerCollapsed: true, grandfathered: false },
    { bannerCollapsed: true, actorId: "actor:bob" },
    { bannerCollapsed: "yes" },
    // W0006：服务端字段、非法跳过值、非法步骤值；一个非法字段让整个请求都不写。
    { completedAt: "2026-10-20T00:00:00.000Z" },
    { version: 3 },
    { currentStep: 2, completedAt: "2026-10-20T00:00:00.000Z" },
    { step1Skipped: false },
    { step1Skipped: "true" },
    // W0054（W54-1）：新的跳过一律关闭，`step1Skipped: true` 也是 400。
    { step1Skipped: true },
    { currentStep: 2, step1Skipped: true },
    { currentStep: 0 },
    { currentStep: 5 },
    { currentStep: 2.5 },
    { currentStep: "2" },
    { currentStep: null },
    { currentStep: 3, bannerCollapsed: "no" },
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
        markCompleted: async () => {
          throw new Error("storage down");
        },
        setBannerCollapsed: async () => {
          throw new Error("storage down");
        },
        update: async () => {
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

/* ── W0006：currentStep；W0054：跳过关闭 ───────────────────────────── */

test("W0054 SC-01: PATCH {step1Skipped: true} is a 400 VALIDATION_ERROR and leaves the record unchanged; currentStep still writes", async () => {
  const { handlersFor, recordsFor } = harness();
  const handlers = handlersFor("actor:alice");
  assert.equal((await handlers.PATCH(patch({ currentStep: 2 }))).status, 200);
  const before = await recordsFor("actor:alice");
  for (const body of [{ step1Skipped: true }, { currentStep: 3, step1Skipped: true }]) {
    const response = await handlers.PATCH(patch(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    const payload = (await response.json()) as { success: boolean; error: { code: string } };
    assert.equal(payload.error.code, "VALIDATION_ERROR");
  }
  assert.deepEqual(await recordsFor("actor:alice"), before);
  const readBack = ((await (await handlers.GET()).json()) as {
    data: { bannerCollapsed: boolean; completedAt: string | null; currentStep: number; step1Skipped: boolean };
  }).data;
  assert.equal(readBack.completedAt, null);
  assert.equal(readBack.currentStep, 2);
  assert.equal(readBack.step1Skipped, false);
  assert.equal((await recordsFor("actor:alice")).length, 1);
});

test("W0054（W54-1）: a stored legacy step1Skipped = true is still read back by GET (read-only compatibility)", async () => {
  const { handlersFor, store } = harness();
  await store.upsertRecord({
    collectionName: GUIDE_STATE_COLLECTION,
    createdAt: "2026-10-01T00:00:00.000Z",
    evidenceIds: [],
    lifecycleState: "active",
    payload: { currentStep: 2, grandfathered: false, step1Skipped: true, version: 2 },
    recordId: "current",
    sourceId: "guide-state",
    sourceType: "manual",
    updatedAt: "2026-10-01T00:00:00.000Z",
    userId: "actor:legacy-skip",
    workspaceId: guideStateWorkspaceId(WORKSPACE, "actor:legacy-skip"),
  });
  const data = ((await (await handlersFor("actor:legacy-skip").GET()).json()) as { data: { step1Skipped: boolean; currentStep: number } }).data;
  assert.equal(data.step1Skipped, true);
  assert.equal(data.currentStep, 2);
});

test("W0006 SC-04: two independent clients of the same actor see the same currentStep", async () => {
  const { handlersFor } = harness();
  // 两个客户端 = 两组独立的 handler（各自一次身份解析，模拟不同 cookie 会话），同一个 actor。
  const laptop = handlersFor("actor:alice");
  const phone = handlersFor("actor:alice");
  const stepOf = async (response: Response) =>
    ((await response.json()) as { data: { currentStep: number | null } }).data.currentStep;

  assert.equal(await stepOf(await phone.GET()), null);
  assert.equal(await stepOf(await laptop.PATCH(patch({ currentStep: 3 }))), 3);
  assert.equal(await stepOf(await phone.GET()), 3, "the phone opens on the laptop's step");
  assert.equal(await stepOf(await phone.PATCH(patch({ currentStep: 1 }))), 1);
  assert.equal(await stepOf(await laptop.GET()), 1, "and back again");
});

test("W0035: PATCH currentStep 4 is a 400 VALIDATION_ERROR and leaves the record unchanged", async () => {
  const { handlersFor, recordsFor } = harness();
  const handlers = handlersFor("actor:alice");
  assert.equal((await handlers.PATCH(patch({ currentStep: 2 }))).status, 200);
  const before = await recordsFor("actor:alice");

  const response = await handlers.PATCH(patch({ currentStep: 4 }));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { success: boolean; error: { code: string; message: string } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "VALIDATION_ERROR");
  assert.match(body.error.message, /1 to 3/);

  assert.deepEqual(await recordsFor("actor:alice"), before);
  const readBack = ((await (await handlers.GET()).json()) as { data: { currentStep: number | null } }).data;
  assert.equal(readBack.currentStep, 2);
});

test("W0035: GET maps a stored currentStep of 4 to null, unfinished or finished", async () => {
  const { handlersFor, store } = harness();
  for (const [actorId, completedAt] of [
    ["actor:open4", null],
    ["actor:done4", "2026-09-30T00:00:00.000Z"],
  ] as const) {
    await store.upsertRecord({
      collectionName: GUIDE_STATE_COLLECTION,
      createdAt: "2026-10-01T00:00:00.000Z",
      evidenceIds: [],
      lifecycleState: "active",
      payload: { currentStep: 4, grandfathered: false, version: 2, ...(completedAt ? { completedAt } : {}) },
      recordId: "current",
      sourceId: "guide-state",
      sourceType: "manual",
      updatedAt: "2026-10-01T00:00:00.000Z",
      userId: actorId,
      workspaceId: guideStateWorkspaceId(WORKSPACE, actorId),
    });
    const response = await handlersFor(actorId).GET();
    assert.equal(response.status, 200);
    const data = ((await response.json()) as { data: { completedAt: string | null; currentStep: number | null } }).data;
    assert.equal(data.currentStep, null, actorId);
    assert.equal(data.completedAt, completedAt, actorId);
  }
});

test("W0006: another actor's currentStep and skip flag are never touched", async () => {
  const { handlersFor, recordsFor } = harness();
  await handlersFor("actor:alice").PATCH(patch({ currentStep: 3 }));
  const bob = ((await (await handlersFor("actor:bob").GET()).json()) as {
    data: { currentStep: number | null; step1Skipped: boolean };
  }).data;
  assert.equal(bob.currentStep, null);
  assert.equal(bob.step1Skipped, false);
  assert.equal((await recordsFor("actor:bob")).length, 0);
  // 请求体里的身份字段不采信：以 bob 的身份提交 actorId=alice 是 400，alice 的记录不变。
  const spoof = await handlersFor("actor:bob").PATCH(patch({ actorId: "actor:alice", currentStep: 1 }));
  assert.equal(spoof.status, 400);
  const alice = ((await (await handlersFor("actor:alice").GET()).json()) as { data: { currentStep: number } }).data;
  assert.equal(alice.currentStep, 3);
});
