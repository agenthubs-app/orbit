import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
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
  const fixtureProfile = defaultMockFixtures.profiles.find(
    (item) => item.accountId === actorId,
  );
  const fixtureAccount = defaultMockFixtures.accounts.find(
    (item) => item.id === actorId,
  );

  assert.ok(fixtureProfile);
  assert.ok(fixtureAccount);
  assert.equal(profile.success, true);
  assert.equal(profile.data.state, "success");
  assert.equal(profile.data.profile?.id, fixtureProfile.id);
  assert.equal(profile.data.profile?.displayName, fixtureProfile.displayName);
  assert.equal(profile.data.profile?.role, fixtureProfile.role);
  assert.equal(profile.data.profile?.organization, fixtureAccount.name);
  assert.equal(profile.data.profile?.homeMarket, "");
  assert.equal(profile.data.provenance.source, `live-record-store:profiles:${workspaceId}`);
  assert.equal(profile.data.provenance.sourceLabel, "Profile memory live storage");
  assert.equal(profile.data.completeness.status, "action-needed");

  const updated = await service.updateProfile(
    {
      displayName: "结城航太郎",
      headline: "基于来源证据运营高质量人脉跟进",
      homeMarket: "东京",
      organization: "Orbit 人脉实验室",
      preferredFollowUpWindow: "24 小时内",
      preferredIntroChannels: ["共同联系人引荐", "活动后跟进"],
      relationshipGoal:
        "使用真实互动上下文判断下一步最值得推进的人脉。",
      role: "人脉运营负责人",
      targetRelationshipTypes: ["创业者", "业务负责人", "社群组织者"],
    },
    { actorId },
  );

  assert.equal(updated.success, true);
  assert.equal(updated.data.profile?.headline, "基于来源证据运营高质量人脉跟进");
  assert.equal(updated.data.profile?.updatedAt, "2026-07-02T04:05:00.000Z");
  assert.equal(updated.data.editor.lastSavedAt, "2026-07-02T04:05:00.000Z");
  assert.equal(updated.data.completeness.status, "ready");

  const stored = store.getRecord({
    workspaceId,
    collectionName: "profiles",
    recordId: "profile_orbit_generated_operator",
  });

  assert.equal(stored?.payload.displayName, "结城航太郎");
  assert.equal(
    stored?.payload.headline,
    "基于来源证据运营高质量人脉跟进",
  );
  assert.deepEqual(stored?.payload.preferredIntroChannels, [
    "共同联系人引荐",
    "活动后跟进",
  ]);
  assert.equal(stored?.userId, actorId);
  assert.match(stored?.searchText ?? "", /来源证据|人脉跟进/);
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
