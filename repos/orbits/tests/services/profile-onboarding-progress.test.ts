import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import {
  createStorageProfileOnboardingProgressService,
  type ProfileOnboardingProgressPayload,
} from "../../features/profile/onboarding-progress";

const workspaceId = "r28-progress-test";

function world() {
  const store = createMemoryLiveRecordStore<ProfileOnboardingProgressPayload>();
  const actor = (actorId: string) => createStorageProfileOnboardingProgressService({ actorId, store, workspaceId });
  return { actor, store };
}

test("first flow is initialized once and is private to its actor", async () => {
  const { actor } = world();
  const alice = actor("alice");
  assert.equal(await alice.get(), null);
  const initial = await alice.apply({ action: "initialize", expectedRevision: null, mutationId: "init" });
  assert.deepEqual({ currentScreen: initial.currentScreen, lastConfirmedScreen: initial.lastConfirmedScreen, finishedAt: initial.finishedAt }, {
    currentScreen: 1, lastConfirmedScreen: 0, finishedAt: null,
  });
  assert.deepEqual(await alice.apply({ action: "initialize", expectedRevision: null, mutationId: "init" }), initial);
  assert.deepEqual(await alice.apply({ action: "initialize", expectedRevision: null, mutationId: "init-again" }), initial);
  assert.equal(await actor("bob").get(), null);
});

test("only the next confirmed screen advances; a stale concurrent command cannot roll it back", async () => {
  const flow = world().actor("alice");
  const initial = await flow.apply({ action: "initialize", expectedRevision: null, mutationId: "init" });
  await assert.rejects(flow.apply({ action: "confirm", screen: 2, expectedRevision: initial.revision, mutationId: "skip" }), /SCREEN_ORDER/);
  const first = await flow.apply({ action: "confirm", screen: 1, expectedRevision: initial.revision, mutationId: "one" });
  assert.equal(first.currentScreen, 2);
  assert.equal(first.lastConfirmedScreen, 1);
  await assert.rejects(flow.apply({ action: "confirm", screen: 2, expectedRevision: initial.revision, mutationId: "stale" }), /REVISION_CONFLICT/);
  assert.deepEqual(await flow.apply({ action: "confirm", screen: 1, expectedRevision: initial.revision, mutationId: "one" }), first);
  await assert.rejects(flow.apply({ action: "defer", expectedRevision: first.revision, mutationId: "one" }), /MUTATION_CONFLICT/);
});

test("defer preserves the resume screen and finish latches after screen five", async () => {
  const flow = world().actor("alice");
  let state = await flow.apply({ action: "initialize", expectedRevision: null, mutationId: "init" });
  state = await flow.apply({ action: "defer", expectedRevision: state.revision, mutationId: "later" });
  assert.equal(state.deferred, true);
  for (let screen = 1; screen <= 5; screen += 1) {
    state = await flow.apply({ action: "confirm", screen: screen as 1 | 2 | 3 | 4 | 5, expectedRevision: state.revision, mutationId: `screen-${screen}` });
  }
  assert.equal(state.currentScreen, null);
  assert.equal(state.finishedAt, null);
  state = await flow.apply({ action: "finish", expectedRevision: state.revision, mutationId: "finish" });
  assert.ok(state.finishedAt);
  assert.equal(state.deferred, false);
  assert.deepEqual(await flow.apply({ action: "initialize", expectedRevision: null, mutationId: "new-flow" }), state);
  await assert.rejects(flow.apply({ action: "confirm", screen: 5, expectedRevision: state.revision, mutationId: "late" }), /FLOW_FINISHED/);
});
