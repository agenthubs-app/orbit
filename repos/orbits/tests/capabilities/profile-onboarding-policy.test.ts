import assert from "node:assert/strict";
import test from "node:test";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createMockProfileService } from "../../features/profile/mock-service";
import type { ManualProfileUpdateInput } from "../../features/profile/contract";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const required = {
  displayName: "  资料本人  ",
  primaryIndustryId: "technology_internet",
  secondaryIndustryId: "technology_internet.ai_data",
  birthDate: "2000-02-29",
} as const;

test("empty profile reports authoritative missing fields without creating a record", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({ store, workspaceId: "onboarding-policy" });
  const service = createLiveProfileService({ provider, now: () => "2026-09-14T00:00:00.000Z" });
  const result = await service.getProfile({ actorId: "actor-onboarding" });
  assert.equal(result.success, true);
  if (!result.success) throw new Error("Profile read failed");
  assert.equal(result.data.profile, null);
  assert.deepEqual(Reflect.get(result.data, "onboarding"), {
    policyVersion: 1, status: "incomplete",
    missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"],
  });
  assert.deepEqual(await store.listRecords({ workspaceId: "onboarding-policy", collectionName: "profiles" }), []);
});

for (const mode of ["live", "mock"] as const) {
  test(`${mode} onboarding uses only required fields and is independent of the old richness score`, async () => {
    const store = createMemoryLiveRecordStore<Record<string, unknown>>();
    const service = mode === "live"
      ? createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId: "onboarding-policy" }), now: () => "2026-09-14T00:00:00.000Z" })
      : createMockProfileService();
    const result = await service.updateProfile({
      ...required, organization: "", role: "", headline: "", homeMarket: "", bio: "",
      relationshipGoal: "", preferredIntroChannels: [], targetRelationshipTypes: [],
    }, { actorId: "actor-onboarding" });
    assert.equal(result.success, true);
    if (!result.success) throw new Error("Profile save failed");
    assert.equal(result.data.completeness.score, 17);
    assert.equal(result.data.completeness.status, "action-needed");
    assert.deepEqual(Reflect.get(result.data, "onboarding"), { policyVersion: 1, status: "complete", missingFields: [] });
    assert.equal(Reflect.get(result.data.profile!, "birthDate"), "2000-02-29");

    const rich = await service.updateProfile({
      ...required, primaryIndustryId: null, secondaryIndustryId: null,
      headline: "选填职位", homeMarket: "东京", relationshipGoal: "认识同行",
      targetRelationshipTypes: ["同行"], preferredIntroChannels: ["本人联系"],
    }, { actorId: "actor-onboarding" });
    assert.equal(rich.success, true);
    if (!rich.success) throw new Error("Rich profile save failed");
    assert.equal(rich.data.completeness.score, 100);
    assert.deepEqual(Reflect.get(rich.data, "onboarding"), {
      policyVersion: 1, status: "incomplete", missingFields: ["primaryIndustryId", "secondaryIndustryId"],
    });
  });

  test(`${mode} profile ignores client claims of completed onboarding`, async () => {
    const service = mode === "live"
      ? createLiveProfileService({ provider: createStorageProfileProvider({ store: createMemoryLiveRecordStore(), workspaceId: "onboarding-policy" }) })
      : createMockProfileService();
    const result = await service.updateProfile({
      displayName: "本人", primaryIndustryId: null, secondaryIndustryId: null,
      onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
    } as ManualProfileUpdateInput, { actorId: "actor-onboarding" });
    assert.equal(result.success, true);
    if (!result.success) throw new Error("Profile save failed");
    assert.deepEqual(Reflect.get(result.data, "onboarding"), {
      policyVersion: 1, status: "incomplete", missingFields: ["primaryIndustryId", "secondaryIndustryId", "birthDate"],
    });
  });
}
