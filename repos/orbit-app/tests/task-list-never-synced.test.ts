import assert from "node:assert/strict";
import test from "node:test";

import { mirrorTaskListSource } from "../src/screens/tasks/task-list-source-mirror";
import type { SyncedCollectionSnapshot } from "../src/data/sync/sync-coordinator";

/**
 * Sprint 0087: "we have not synced yet" and "we synced and you have nothing" are
 * different facts, and the tasks page used to state the second while the first
 * was true — showing "暂无待办" and the syncing label at the same time on a cold
 * open. The four combinations below are the whole contract.
 */

const INPUT = { actorId: "actor:one", ready: true, scopeKey: "scope" };

function snapshot(patch: Partial<SyncedCollectionSnapshot<Record<string, unknown>>> = {}) {
  return {
    error: null,
    lastSyncedAt: null,
    records: [],
    status: "unsynced",
    workspaceId: "workspace:one",
    refresh: async () => null,
    invalidate: async () => null,
    ...patch,
  } as unknown as Parameters<typeof mirrorTaskListSource>[0];
}

function taskRecord(id: string) {
  return {
    payload: {
      id, accountId: "actor:one", ownerUserId: "actor:one", title: "跟进林玫", status: "open",
      category: "relationship", source: "manual",
      createdAt: "2026-09-19T00:00:00.000Z", updatedAt: "2026-09-19T00:00:00.000Z",
    },
  };
}

test("never synced: the page is loading and has no list to call empty", () => {
  const source = mirrorTaskListSource(snapshot(), INPUT);
  assert.equal(source.loading, true);
  assert.equal(source.canonical, null, "a null list is what stops the empty state rendering");
  assert.equal(source.failure, null);
});

test("syncing for the first time: still loading, still no list", () => {
  const source = mirrorTaskListSource(snapshot({ status: "syncing" }), INPUT);
  assert.equal(source.loading, true);
  assert.equal(source.canonical, null);
});

test("synced and genuinely empty: not loading, and an empty list the page may call empty", () => {
  const source = mirrorTaskListSource(
    snapshot({ lastSyncedAt: "2026-09-19T00:00:00.000Z", status: "fresh" }),
    INPUT,
  );
  assert.equal(source.loading, false);
  assert.deepEqual(source.canonical, [], "this is the only state that earns 暂无待办");
});

test("synced with records: the list is there", () => {
  const source = mirrorTaskListSource(
    snapshot({ lastSyncedAt: "2026-09-19T00:00:00.000Z", records: [taskRecord("task:1")] as never, status: "fresh" }),
    INPUT,
  );
  assert.equal(source.loading, false);
  assert.equal(source.canonical?.length, 1);
});

test("a failed first sync still reports the failure, not an empty page (0078 must not regress)", () => {
  const source = mirrorTaskListSource(
    snapshot({ error: "同步请求超时，请重试。", status: "failure" }),
    INPUT,
  );
  assert.equal(source.failure, "同步请求超时，请重试。");
  assert.equal(source.canonical, null, "a failure is not an empty list either");
});

test("the sync label distinguishes never-synced from locally-ready", () => {
  assert.equal(mirrorTaskListSource(snapshot(), INPUT).syncLabelKey, "sync.syncing");
  assert.equal(
    mirrorTaskListSource(snapshot({ lastSyncedAt: "2026-09-19T00:00:00.000Z", status: "local-ready" }), INPUT).syncLabelKey,
    "sync.localReady",
  );
});

test("a screen that is not ready yet never claims an empty list", () => {
  const source = mirrorTaskListSource(snapshot({ status: "fresh" }), { ...INPUT, ready: false });
  assert.equal(source.canonical, null);
});

test("refreshing an already-synced list keeps showing it", async () => {
  // `syncing` is also the state of a pull-to-refresh. Treating it as
  // never-synced would blank the list every time the user refreshes.
  const source = mirrorTaskListSource(
    snapshot({
      lastSyncedAt: "2026-09-19T00:00:00.000Z",
      records: [taskRecord("task:1")] as never,
      status: "syncing",
    }),
    INPUT,
  );
  assert.equal(source.canonical?.length, 1, "the list stays put while refreshing");
  assert.equal(source.loading, false);
  assert.equal(source.refreshing, true);
});

test("a synced-but-empty list survives a refresh without reverting to loading", async () => {
  const source = mirrorTaskListSource(
    snapshot({ lastSyncedAt: "2026-09-19T00:00:00.000Z", status: "syncing" }),
    INPUT,
  );
  assert.deepEqual(source.canonical, []);
  assert.equal(source.loading, false);
});
