import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live profile service reads and upserts generated profile records", async () => {
  const actorId = "account_orbit_generated";
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

  const profile = await service.getProfile({ actorId });

  assert.equal(profile.success, true);
  assert.equal(profile.data.state, "success");
  assert.equal(profile.data.profile?.id, "profile_orbit_generated_operator");
  assert.equal(profile.data.profile?.displayName, "小雨");
  assert.equal(profile.data.profile?.role, "AI & Computer Vision Engineer");
  assert.equal(
    profile.data.profile?.organization,
    "OPPO Japan Research",
  );
  assert.equal(profile.data.profile?.homeMarket, "");
  assert.equal(profile.data.provenance.source, `live-record-store:profiles:${workspaceId}`);
  assert.equal(profile.data.provenance.sourceLabel, "Profile memory live storage");
  assert.equal(profile.data.completeness.status, "action-needed");

  const updated = await service.updateProfile(
    {
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
    },
    { actorId },
  );

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
  assert.equal(stored?.userId, actorId);
  assert.match(stored?.searchText ?? "", /source-backed follow-up/);
});

test("live profile service requires an actor and cannot read another actor's profile", async () => {
  const workspaceId = "workspace:profile-live-actor-boundary";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  const service = createLiveProfileService({
    provider: createStorageProfileProvider({ store, workspaceId }),
  });

  const missingActor = await service.getProfile();
  const otherActor = await service.getProfile({ actorId: "account:other" });

  assert.equal(missingActor.success, false);
  assert.equal(missingActor.error.code, "PROFILE_ACTOR_REQUIRED");
  assert.equal(otherActor.success, true);
  assert.equal(otherActor.data.profile, null);
});
