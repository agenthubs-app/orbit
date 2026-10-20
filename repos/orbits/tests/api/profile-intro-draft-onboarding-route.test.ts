import assert from "node:assert/strict";
import test from "node:test";

import { createProfileIntroDraftHandler } from "../../app/api/profile/intro-draft/route";
import { createStorageProfileIntroQuota, type ProfileIntroQuotaPayload } from "../../features/profile/intro-onboarding-quota";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const post = (body: unknown) => new Request("https://orbit.test/api/profile/intro-draft", {
  method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
});

test("first flow allows only three successful Japanese drafts with exact replay and no extra model call", async () => {
  const store = createMemoryLiveRecordStore<ProfileIntroQuotaPayload>();
  let calls = 0;
  const handler = createProfileIntroDraftHandler({
    resolveActor: async () => ({ id: "alice" }),
    flowForActor: () => ({ get: async () => ({ finishedAt: null }) }) as never,
    quotaForActor: (actorId) => createStorageProfileIntroQuota({ actorId, store, workspaceId: "r28-intro-route" }),
    createDraftService: (options) => ({ createDraft: async () => {
      await options.beforeModelCall?.();
      calls += 1;
      return { success: true as const, data: { bio: `日本で協業先を探しています。${calls}`, headline: "事業担当です", model: "fixture", provider: "fixture" } };
    } }),
  });
  assert.equal((await handler(post({ language: "fr", idempotencyKey: "bad" }))).status, 400);
  assert.equal((await handler(post({ language: "ja" }))).status, 400);
  const first = await handler(post({ language: "ja", idempotencyKey: "one" }));
  assert.equal(first.status, 200);
  assert.equal((await handler(post({ language: "ja", idempotencyKey: "one" }))).status, 200);
  assert.equal(calls, 1);
  assert.equal((await handler(post({ language: "en", idempotencyKey: "one" }))).status, 409);
  assert.equal((await handler(post({ language: "ja", idempotencyKey: "two" }))).status, 200);
  assert.equal((await handler(post({ language: "ja", idempotencyKey: "three" }))).status, 200);
  assert.equal((await handler(post({ language: "ja", idempotencyKey: "four" }))).status, 409);
  assert.equal(calls, 3);
});

test("sample draft is rejected before quota or model access", async () => {
  let accessed = false;
  const handler = createProfileIntroDraftHandler({
    resolveActor: async () => ({ id: "alice" }),
    flowForActor: () => { accessed = true; throw new Error("must not read flow"); },
  });
  const response = await handler(new Request("https://orbit.test/api/profile/intro-draft", {
    method: "POST", body: JSON.stringify({ language: "ja", idempotencyKey: "sample" }),
    headers: { "content-type": "application/json", "x-orbit-sample": "1" },
  }));
  assert.equal(response.status, 403);
  assert.equal(accessed, false);
});
