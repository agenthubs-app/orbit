import assert from "node:assert/strict";
import test from "node:test";

import { createProfileOnboardingProgressRouteHandlers } from "../../app/api/profile/onboarding-progress/route-handler";
import { createStorageProfileOnboardingProgressService, type ProfileOnboardingProgressPayload } from "../../features/profile/onboarding-progress";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const post = (body: unknown) => new Request("https://orbit.test/api/profile/onboarding-progress", {
  body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST",
});

function world(actorId: string | null) {
  const store = createMemoryLiveRecordStore<ProfileOnboardingProgressPayload>();
  const handlers = createProfileOnboardingProgressRouteHandlers({
    resolveActor: async () => actorId ? { id: actorId } : null,
    serviceForActor: (id) => createStorageProfileOnboardingProgressService({ actorId: id, store, workspaceId: "r28-api" }),
  });
  return { handlers, store };
}

test("authentication precedes validation and no anonymous record is created", async () => {
  const { handlers } = world(null);
  assert.equal((await handlers.GET()).status, 401);
  assert.equal((await handlers.POST(post({ invalid: true }))).status, 401);
});

test("strict commands, CAS, and actor-owned readback", async () => {
  const { handlers } = world("alice");
  assert.equal((await (await handlers.GET()).json() as { data: unknown }).data, null);
  assert.equal((await handlers.POST(post({ action: "initialize", expectedRevision: null, mutationId: "a", actorId: "bob" }))).status, 400);
  const response = await handlers.POST(post({ action: "initialize", expectedRevision: null, mutationId: "a" }));
  assert.equal(response.status, 200);
  const initial = (await response.json() as { data: { revision: string } }).data;
  assert.equal((await handlers.POST(post({ action: "confirm", screen: 2, expectedRevision: initial.revision, mutationId: "b" }))).status, 400);
  const confirmed = await handlers.POST(post({ action: "confirm", screen: 1, expectedRevision: initial.revision, mutationId: "c" }));
  assert.equal(confirmed.status, 200);
  assert.equal((await (await handlers.GET()).json() as { data: { lastConfirmedScreen: number } }).data.lastConfirmedScreen, 1);
  assert.equal((await handlers.POST(post({ action: "confirm", screen: 2, expectedRevision: initial.revision, mutationId: "d" }))).status, 409);
});

test("sample write is rejected before resolving storage", async () => {
  let serviceCalls = 0;
  const handlers = createProfileOnboardingProgressRouteHandlers({
    resolveActor: async () => ({ id: "alice" }),
    serviceForActor: () => { serviceCalls += 1; throw new Error("must not resolve storage"); },
  });
  const request = new Request("https://orbit.test/api/profile/onboarding-progress", {
    method: "POST", body: JSON.stringify({ action: "initialize", expectedRevision: null, mutationId: "sample" }),
    headers: { "content-type": "application/json", "x-orbit-sample": "1" },
  });
  const response = await handlers.POST(request);
  assert.equal(response.status, 403);
  assert.equal(serviceCalls, 0);
});
