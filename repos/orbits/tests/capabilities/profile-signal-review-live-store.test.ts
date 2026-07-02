import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileSignalReviewQueueService } from "../../features/profile/live-signal-service";
import { createStorageProfileSignalProvider } from "../../features/profile/storage/profile-signal-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live profile signal review queue derives sourced suggestions without profile writes", async () => {
  const workspaceId = "workspace:profile-signal-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T05:00:00.000Z",
    store,
    workspaceId,
  });

  const originalProfile = store.getRecord({
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    workspaceId,
  });
  const provider = createStorageProfileSignalProvider({
    sourceLabel: "Profile signal memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveProfileSignalReviewQueueService({
    now: () => "2026-07-02T05:05:00.000Z",
    provider,
  });

  const queue = await service.listUpdateSuggestions();

  assert.equal(queue.success, true);
  assert.equal(queue.data.state, "success");
  assert.equal(queue.data.suggestions.length, 3);
  assert.deepEqual(
    queue.data.suggestions.map((suggestion) => suggestion.sourceKind),
    ["chat", "activity", "contact"],
  );
  assert.deepEqual(
    queue.data.suggestions.map((suggestion) => suggestion.status),
    ["pending", "pending", "pending"],
  );
  assert.deepEqual(
    queue.data.suggestions.map((suggestion) => suggestion.targetProfileField),
    ["relationshipGoal", "preferredFollowUpWindow", "targetRelationshipTypes"],
  );
  assert.match(queue.data.suggestions[0]?.suggestedValue as string, /follow up/i);
  assert.equal(queue.data.suggestions[0]?.evidence[0]?.sourceKind, "chat");
  assert.match(queue.data.suggestions[1]?.suggestedValue as string, /24 hours/);
  assert.equal(queue.data.suggestions[1]?.evidence[0]?.sourceKind, "activity");
  assert.deepEqual(queue.data.suggestions[2]?.suggestedValue, [
    "founders",
    "operators",
    "community leads",
  ]);
  assert.equal(queue.data.suggestions[2]?.evidence[0]?.sourceKind, "contact");
  assert.equal(
    queue.data.provenance.source,
    `live-record-store:profile-signals:${workspaceId}`,
  );
  assert.equal(
    queue.data.provenance.sourceLabel,
    "Profile signal memory live storage",
  );
  assert.equal(queue.data.provenance.generationMethod, "rule-based-signal-match");
  assert.ok(queue.data.provenance.evidenceIds.length >= 3);

  const accepted = await service.acceptUpdateSuggestion(
    queue.data.suggestions[0]?.id ?? "",
  );

  assert.equal(accepted.success, true);
  assert.equal(accepted.data.acceptedSuggestion.status, "accepted");
  assert.deepEqual(accepted.data.appliedFields, ["relationshipGoal"]);
  assert.deepEqual(accepted.data.profilePatch, {
    relationshipGoal: queue.data.suggestions[0]?.suggestedValue,
  });
  assert.equal(
    accepted.data.nextAction,
    "Apply this patch only after the operator confirms the profile save.",
  );

  const missing = await service.acceptUpdateSuggestion("missing-suggestion");

  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND");
  assert.deepEqual(missing.error.evidenceIds, [
    "evidence:profile-signal-suggestion-not-found:missing-suggestion",
  ]);

  const storedProfile = store.getRecord({
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
    workspaceId,
  });

  assert.deepEqual(storedProfile?.payload, originalProfile?.payload);
});
