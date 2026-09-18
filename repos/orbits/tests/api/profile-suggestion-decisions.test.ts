import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileSignalReviewQueueService } from "../../features/profile/live-signal-service";
import { createStorageProfileSignalProvider } from "../../features/profile/storage/profile-signal-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

type DecisionResult = {
  success: boolean;
  data?: {
    acceptedSuggestion?: { id: string; status: string };
    dismissedSuggestion?: { id: string; status: string };
    profilePatch?: Record<string, unknown>;
    mutationId?: string;
  };
  error?: { code: string };
};

test("profile suggestion decisions persist by actor and replay the same mutation without profile writes", async () => {
  const actorId = "account_orbit_generated";
  const workspaceId = "workspace:profile-suggestion-decisions";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T05:00:00.000Z",
    store,
    workspaceId,
  });
  const originalProfile = await store.getRecord({
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    workspaceId,
  });
  const provider = createStorageProfileSignalProvider({ store, workspaceId });
  const createService = () => createLiveProfileSignalReviewQueueService({
    now: () => "2026-07-02T05:05:00.000Z",
    provider,
  });
  const service = createService();
  const queue = await service.listUpdateSuggestions({ actorId });
  assert.equal(queue.success, true);
  if (!queue.success) throw new Error("Suggestion queue failed");
  assert.deepEqual(queue.data.suggestions.map(item => item.targetProfileField), ["seeking", "bio", "offering"]);
  const [first, second] = queue.data.suggestions;
  assert.ok(first && second);

  const decisions = service as unknown as {
    acceptUpdateSuggestion: (id: string, options: { actorId: string; mutationId: string }) => Promise<DecisionResult>;
    dismissUpdateSuggestion: (id: string, options: { actorId: string; mutationId: string }) => Promise<DecisionResult>;
  };
  assert.equal(typeof decisions.dismissUpdateSuggestion, "function");

  const accepted = await decisions.acceptUpdateSuggestion(first.id, {
    actorId,
    mutationId: "decision:accept:first",
  });
  assert.equal(accepted.success, true);
  assert.equal(accepted.data?.acceptedSuggestion?.status, "accepted");
  assert.equal(accepted.data?.mutationId, "decision:accept:first");
  assert.deepEqual(await decisions.acceptUpdateSuggestion(first.id, {
    actorId,
    mutationId: "decision:accept:first",
  }), accepted);

  const dismissed = await decisions.dismissUpdateSuggestion(second.id, {
    actorId,
    mutationId: "decision:dismiss:second",
  });
  assert.equal(dismissed.success, true);
  assert.equal(dismissed.data?.dismissedSuggestion?.status, "dismissed");
  assert.equal(dismissed.data?.mutationId, "decision:dismiss:second");
  assert.equal("profilePatch" in (dismissed.data ?? {}), false);
  assert.deepEqual(await decisions.dismissUpdateSuggestion(second.id, {
    actorId,
    mutationId: "decision:dismiss:second",
  }), dismissed);

  const reopened = await createService().listUpdateSuggestions({ actorId });
  assert.equal(reopened.success, true);
  if (!reopened.success) throw new Error("Reopened queue failed");
  assert.deepEqual(reopened.data.suggestions.slice(0, 2).map(item => item.status), ["accepted", "dismissed"]);

  const conflicting = await decisions.acceptUpdateSuggestion(second.id, {
    actorId,
    mutationId: "decision:conflicting-accept",
  });
  assert.equal(conflicting.success, false);
  assert.equal(conflicting.error?.code, "PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED");

  const foreign = await decisions.dismissUpdateSuggestion(first.id, {
    actorId: "actor:foreign",
    mutationId: "decision:foreign",
  });
  assert.equal(foreign.success, false);
  assert.equal(foreign.error?.code, "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND");

  const storedProfile = await store.getRecord({
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    workspaceId,
  });
  assert.deepEqual(storedProfile?.payload, originalProfile?.payload);
  const decisionRecords = await store.listRecords({
    limit: "unbounded",
    collectionName: "profileSuggestionDecisions",
    workspaceId,
  });
  assert.equal(decisionRecords.length, 2);
  assert.ok(decisionRecords.every(record => record.userId === actorId && record.payload.actorId === actorId));
});

test("concurrent opposite suggestion decisions keep the first durable result", async () => {
  const actorId = "account_orbit_generated";
  const workspaceId = "workspace:profile-suggestion-decision-race";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T05:00:00.000Z",
    store,
    workspaceId,
  });
  const provider = createStorageProfileSignalProvider({ store, workspaceId });
  const service = createLiveProfileSignalReviewQueueService({
    now: () => "2026-07-02T05:05:00.000Z",
    provider,
  });
  const queue = await service.listUpdateSuggestions({ actorId });
  assert.equal(queue.success, true);
  if (!queue.success || !queue.data.suggestions[0]) throw new Error("Suggestion queue failed");
  const id = queue.data.suggestions[0].id;
  const [accepted, dismissed] = await Promise.all([
    service.acceptUpdateSuggestion(id, { actorId, mutationId: "decision:race:accept" }),
    service.dismissUpdateSuggestion(id, { actorId, mutationId: "decision:race:dismiss" }),
  ]);
  assert.equal([accepted, dismissed].filter(result => result.success).length, 1);
  assert.equal([accepted, dismissed].reduce((count, result) =>
    count + (result.success === false && result.error.code === "PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED" ? 1 : 0), 0), 1);
  const records = await store.listRecords({ limit: "unbounded", collectionName: "profileSuggestionDecisions", workspaceId });
  assert.equal(records.length, 1);
  const durable = records[0]?.payload;
  assert.ok(durable?.mutationId === "decision:race:accept" || durable?.mutationId === "decision:race:dismiss");
});

test("profile suggestion HTTP decisions use the authenticated actor and echo the explicit mutation", async () => {
  const acceptModule = await import("../../app/api/profile/update-suggestions/[id]/accept/handler");
  const dismissModule = await import("../../app/api/profile/update-suggestions/[id]/dismiss/handler");
  const resolveActor = async () => ({ id: "account_orbit_generated" });
  const context = { params: Promise.resolve({ id: "demo-profile-suggestion-1" }) };
  const acceptResponse = await acceptModule.createProfileSuggestionAcceptPostHandler(resolveActor)(
    new Request("https://orbit.local/api/profile/update-suggestions/demo-profile-suggestion-1/accept", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutationId: "http:accept" }),
    }),
    context,
  );
  assert.equal(acceptResponse.status, 200);
  assert.equal((await acceptResponse.json()).data.mutationId, "http:accept");

  const dismissResponse = await dismissModule.createProfileSuggestionDismissPostHandler(resolveActor)(
    new Request("https://orbit.local/api/profile/update-suggestions/demo-profile-suggestion-1/dismiss", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mutationId: "http:dismiss" }),
    }),
    context,
  );
  assert.equal(dismissResponse.status, 200);
  assert.equal((await dismissResponse.json()).data.mutationId, "http:dismiss");
});
