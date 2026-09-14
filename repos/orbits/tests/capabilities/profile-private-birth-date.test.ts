import assert from "node:assert/strict";
import test from "node:test";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createMockProfileService } from "../../features/profile/mock-service";
import type { ManualProfileUpdateInput } from "../../features/profile/contract";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { profileServiceFactory } from "../../features/profile/service-factory";
import { getSelfProfileForAi } from "../../features/profile/self-profile-reader";

test("conflicting record ownership cannot expose or overwrite a private birth date", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({ store, workspaceId: "private-birth-date" });
  const service = createLiveProfileService({ provider, now: () => "2026-09-14T00:00:00.000Z" });
  await service.updateProfile({ displayName: "本人", birthDate: "2000-02-29" }, { actorId: "actor-birth" });
  const graph = await provider.readProfileGraph("actor-birth");
  const record = await store.getRecord({ workspaceId: "private-birth-date", collectionName: "profiles", recordId: "profile:actor-birth" });
  assert.ok(record);
  await store.upsertRecord({ ...record, userId: "actor-other" });
  const read = await service.getProfile({ actorId: "actor-birth" });
  assert.equal(read.success, true);
  if (!read.success) throw new Error("Profile read failed");
  assert.equal(read.data.profile, null);
  await assert.rejects(async () => provider.upsertProfile(graph.profiles[0], "actor-birth"), /different actor/);
  assert.equal((await store.getRecord({ workspaceId: "private-birth-date", collectionName: "profiles", recordId: record.recordId }))?.userId, "actor-other");
});

test("birth date is private actor data, survives sparse updates, and is excluded from public and AI projections", async (t) => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({ store, workspaceId: "private-birth-date" });
  const service = createLiveProfileService({ provider, now: () => "2026-09-14T00:00:00.000Z" });
  const saved = await service.updateProfile({
    displayName: "本人", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data", birthDate: "2000-02-29",
  } as ManualProfileUpdateInput, { actorId: "actor-birth" });
  assert.equal(saved.success, true);
  if (!saved.success) throw new Error("Private profile save failed");
  assert.equal(Reflect.get(saved.data.profile!, "birthDate"), "2000-02-29");
  const record = await store.getRecord({ workspaceId: "private-birth-date", collectionName: "profiles", recordId: "profile:actor-birth" });
  assert.ok(record);
  assert.equal(record.payload.birthDate, "2000-02-29");
  assert.equal(JSON.stringify(record.payload.publicProfile).includes("2000-02-29"), false);
  assert.equal(JSON.stringify(record.payload.publicProfile).includes("birthDate"), false);
  assert.equal(record.searchText?.includes("2000-02-29"), false);
  const sparse = await service.updateProfile({ relationshipGoal: "只改目标" }, { actorId: "actor-birth" });
  assert.equal(sparse.success, true);
  if (!sparse.success) throw new Error("Sparse update failed");
  assert.equal(Reflect.get(sparse.data.profile!, "birthDate"), "2000-02-29");
  const reopened = await service.getProfile({ actorId: "actor-birth" });
  assert.equal(reopened.success, true);
  if (!reopened.success) throw new Error("Profile reopen failed");
  assert.equal(Reflect.get(reopened.data.profile!, "birthDate"), "2000-02-29");
  const other = await service.getProfile({ actorId: "actor-other" });
  assert.equal(other.success, true);
  if (!other.success) throw new Error("Other actor read failed");
  assert.equal(other.data.profile, null);
  assert.equal(JSON.stringify(other).includes("2000-02-29"), false);
  const resolution = profileServiceFactory.create("mock");
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service }));
  const ai = await getSelfProfileForAi({ actorId: "actor-birth", mode: "live" }, { locale: "zh" });
  assert.equal(ai.status, "ok");
  assert.equal(JSON.stringify(ai).includes("2000-02-29"), false);
  assert.equal(JSON.stringify(ai).includes("birthDate"), false);
  const cleared = await service.updateProfile({ birthDate: null } as ManualProfileUpdateInput, { actorId: "actor-birth" });
  assert.equal(cleared.success, true);
  if (!cleared.success) throw new Error("Clear failed");
  assert.equal(Reflect.get(cleared.data.profile!, "birthDate"), null);
  assert.deepEqual(Reflect.get(cleared.data, "onboarding"), { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] });
});

test("private birth date stays the same calendar date in different process time zones", async (t) => {
  const originalTimezone = process.env.TZ;
  t.after(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });
  for (const timezone of ["America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"]) {
    process.env.TZ = timezone;
    const store = createMemoryLiveRecordStore<Record<string, unknown>>();
    const service = createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId: "private-birth-date" }), now: () => "2026-09-14T00:30:00.000Z" });
    const result = await service.updateProfile({ displayName: "本人", birthDate: "2000-02-29" }, { actorId: "actor-birth" });
    assert.equal(result.success, true);
    const reopened = await service.getProfile({ actorId: "actor-birth" });
    assert.equal(reopened.success, true);
    if (!reopened.success) throw new Error("Profile read failed");
    assert.equal(reopened.data.profile?.birthDate, "2000-02-29", timezone);
  }
});

for (const birthDate of ["2001-02-29", "1900-02-29", "2026-09-15", "2000-13-01", "2000-04-31", "0000-01-01", "2000-2-29", "2000-02-29T00:00:00Z", "", 42, [], {}]) {
  test(`invalid birth date is rejected before persistence ${JSON.stringify(birthDate)}`, async () => {
    const store = createMemoryLiveRecordStore<Record<string, unknown>>();
    const service = createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId: "private-birth-date" }), now: () => "2026-09-14T12:00:00.000Z" });
    const result = await service.updateProfile({ displayName: "本人", birthDate } as ManualProfileUpdateInput, { actorId: "actor-birth" });
    assert.equal(result.success, false);
    if (result.success) throw new Error("Invalid birth date was saved");
    assert.equal(result.error.code, "PROFILE_BIRTH_DATE_INVALID");
    assert.deepEqual(await store.listRecords({ workspaceId: "private-birth-date", collectionName: "profiles" }), []);
    const mock = await createMockProfileService().updateProfile({ displayName: "本人", birthDate: typeof birthDate === "string" && birthDate === "2026-09-15" ? "9999-01-01" : birthDate } as ManualProfileUpdateInput);
    assert.equal(mock.success, false);
  });
}
