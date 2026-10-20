import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createStorageProfileIntroQuota, type ProfileIntroQuotaPayload } from "../../features/profile/intro-onboarding-quota";

function world() {
  const store = createMemoryLiveRecordStore<ProfileIntroQuotaPayload>();
  const quota = (actorId: string) => createStorageProfileIntroQuota({ actorId, store, workspaceId: "r28-intro-test" });
  return { quota, store };
}

test("three successful drafts belong to the actor forever; failed actions do not consume a slot", async () => {
  const { quota } = world();
  const alice = quota("alice");
  assert.equal((await alice.reserve("failed", "ja")).kind, "reserved");
  await alice.noteModelCall("failed");
  await alice.complete("failed", { success: false, error: { code: "MODEL_REQUEST_FAILED", message: "down" } });
  assert.equal((await alice.reserve("failed", "ja")).kind, "failure", "failure replay never calls the model again");
  for (const key of ["one", "two", "three"]) {
    assert.equal((await alice.reserve(key, "ja")).kind, "reserved");
    await alice.noteModelCall(key);
    await alice.complete(key, { success: true, data: { bio: `${key}です。`, headline: `${key}です`, model: "fixture", provider: "fixture" } });
    assert.equal((await alice.reserve(key, "ja")).kind, "success");
  }
  assert.equal((await alice.reserve("four", "ja")).kind, "limit");
  assert.equal((await quota("bob").reserve("one", "ja")).kind, "reserved", "another actor has a separate quota");
});

test("same key with different language conflicts; concurrent different keys cannot reserve a fourth slot", async () => {
  const actor = world().quota("alice");
  const results = await Promise.all(["a", "b", "c", "d"].map((key) => actor.reserve(key, "ja")));
  assert.equal(results.filter((result) => result.kind === "reserved").length, 3);
  assert.equal(results.filter((result) => result.kind === "limit").length, 1);
  await assert.rejects(actor.reserve("a", "en"), /MUTATION_CONFLICT/);
});

test("abandoned reservations expire across keys and old keys replay a failure", async () => {
  const store = createMemoryLiveRecordStore<ProfileIntroQuotaPayload>();
  let clock = "2026-10-20T00:00:00.000Z";
  const quota = createStorageProfileIntroQuota({ actorId: "alice", store, workspaceId: "r28-intro-expiry", now: () => clock });
  for (const key of ["a", "b", "c"]) assert.equal((await quota.reserve(key, "ja")).kind, "reserved");
  assert.equal((await quota.reserve("d", "ja")).kind, "limit");
  clock = "2026-10-20T00:05:01.000Z";
  assert.equal((await quota.reserve("d", "ja")).kind, "reserved");
  assert.equal((await quota.reserve("a", "ja")).kind, "failure");
  await quota.complete("d", { success: true, data: { bio: "日本語です。", headline: "事業担当", model: "fixture", provider: "fixture" } });
  assert.equal((await quota.reserve("e", "ja")).kind, "reserved");
});
