import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live profile service reads and upserts generated profile records", async () => {
  const workspaceId = "workspace:profile-live";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T04:00:00.000Z",
    store,
    workspaceId,
  });

  const provider = createStorageProfileProvider({
    sourceLabel: "Profile memory live storage",
    store,
    workspaceId,
  });
  const service = createLiveProfileService({
    now: () => "2026-07-02T04:05:00.000Z",
    provider,
  });

  const profile = await service.getProfile();

  assert.equal(profile.success, true);
  assert.equal(profile.data.state, "success");
  assert.equal(profile.data.profile?.id, "profile_orbit_generated_operator");
  assert.equal(profile.data.profile?.displayName, "結城 航太郎");
  assert.equal(profile.data.profile?.role, "Relationship Operations Lead");
  assert.equal(
    profile.data.profile?.organization,
    "Orbit Generated Relationship Workspace",
  );
  assert.equal(profile.data.profile?.homeMarket, "Tokyo");
  assert.equal(profile.data.provenance.source, `live-record-store:profiles:${workspaceId}`);
  assert.equal(profile.data.provenance.sourceLabel, "Profile memory live storage");
  assert.equal(profile.data.completeness.status, "ready");

  const updated = await service.updateProfile({
    displayName: "結城 航太郎",
    headline: "Relationship operator building source-backed follow-up systems",
    homeMarket: "Tokyo",
    organization: "Orbit",
    preferredFollowUpWindow: "24 hours",
    preferredIntroChannels: ["warm intro", "event follow-up"],
    relationshipGoal:
      "Use live relationship context to decide which follow-up matters next.",
    role: "Relationship Operations Lead",
    targetRelationshipTypes: ["founders", "operators", "community leads"],
  });

  assert.equal(updated.success, true);
  assert.equal(updated.data.profile?.headline, "Relationship operator building source-backed follow-up systems");
  assert.equal(updated.data.profile?.updatedAt, "2026-07-02T04:05:00.000Z");
  assert.equal(updated.data.editor.lastSavedAt, "2026-07-02T04:05:00.000Z");
  assert.equal(updated.data.completeness.status, "ready");

  const stored = store.getRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
  });

  assert.equal(stored?.payload.displayName, "結城 航太郎");
  assert.equal(
    stored?.payload.headline,
    "Relationship operator building source-backed follow-up systems",
  );
  assert.deepEqual(stored?.payload.preferredIntroChannels, [
    "warm intro",
    "event follow-up",
  ]);
  assert.match(stored?.searchText ?? "", /source-backed follow-up/);
});
