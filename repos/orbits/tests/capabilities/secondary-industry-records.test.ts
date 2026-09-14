import assert from "node:assert/strict";
import test from "node:test";

import { createLiveProfileService } from "../../features/profile/live-service";
import { createMockProfileService } from "../../features/profile/mock-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import type { ManualProfileUpdateInput } from "../../features/profile/contract";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createActorScopedLiveRelationshipNaturalSearchService } from "../../features/search/live-service";
import { createContactDetailPatchHandler } from "../../app/api/contacts/[id]/handler";

const selection = {
  primaryIndustryId: "technology_internet",
  secondaryIndustryId: "technology_internet.ai_data",
} as const;

test("profile industry selection persists, preserves sparse edits, clears children and isolates actors", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:secondary-industry-profile";
  const provider = createStorageProfileProvider({ store, workspaceId });
  const service = createLiveProfileService({ provider });
  const actor = { actorId: "industry-user-a" };
  const saved = await service.updateProfile({ displayName: "A", industry: "legacy text", ...selection }, actor);
  assert.equal(saved.success, true);
  const reopened = await createLiveProfileService({ provider }).getProfile(actor);
  assert.ok(reopened.success && reopened.data.profile);
  assert.equal(reopened.data.profile.primaryIndustryId, selection.primaryIndustryId);
  assert.equal(reopened.data.profile.secondaryIndustryId, selection.secondaryIndustryId);
  const updated = await service.updateProfile({ bio: "Updated biography" }, actor);
  assert.ok(updated.success && updated.data.profile);
  assert.equal(updated.data.profile.secondaryIndustryId, selection.secondaryIndustryId);
  assert.equal(updated.data.profile.industry, "legacy text");
  const other = await service.getProfile({ actorId: "industry-user-b" });
  assert.ok(other.success);
  assert.equal(other.data.profile, null);

  const sameParent = await service.updateProfile({ primaryIndustryId: selection.primaryIndustryId }, actor);
  assert.ok(sameParent.success && sameParent.data.profile);
  assert.equal(sameParent.data.profile.secondaryIndustryId, selection.secondaryIndustryId);
  const changed = await service.updateProfile({ primaryIndustryId: "finance_investment" }, actor);
  assert.ok(changed.success && changed.data.profile);
  assert.equal(changed.data.profile.secondaryIndustryId, null);
  await service.updateProfile(selection, actor);
  const clearChild = await service.updateProfile({ secondaryIndustryId: null }, actor);
  assert.ok(clearChild.success && clearChild.data.profile);
  assert.equal(clearChild.data.profile.primaryIndustryId, selection.primaryIndustryId);
  assert.equal(clearChild.data.profile.secondaryIndustryId, null);
  const childOnly = await service.updateProfile({ secondaryIndustryId: selection.secondaryIndustryId }, actor);
  assert.ok(childOnly.success && childOnly.data.profile);
  assert.equal(childOnly.data.profile.secondaryIndustryId, selection.secondaryIndustryId);
  const cleared = await service.updateProfile({ primaryIndustryId: null }, actor);
  assert.ok(cleared.success && cleared.data.profile);
  assert.equal(cleared.data.profile.primaryIndustryId, null);
  assert.equal(cleared.data.profile.secondaryIndustryId, null);
  const stored = store.getRecord({ workspaceId, collectionName: "profiles", recordId: reopened.data.profile.id });
  assert.equal((stored?.payload.publicProfile as Record<string, unknown>).secondaryIndustryId, null);
});

test("invalid explicit selections reject the entire update without mutating the stored profile", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:secondary-industry-validation";
  const service = createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId }) });
  const actor = { actorId: "industry-user-a" };
  await service.updateProfile({ displayName: "A", ...selection }, actor);
  const before = store.getRecord({ workspaceId, collectionName: "profiles", recordId: "profile:industry-user-a" });
  for (const invalid of [
    { primaryIndustryId: "finance_investment", secondaryIndustryId: selection.secondaryIndustryId },
    { primaryIndustryId: null, secondaryIndustryId: selection.secondaryIndustryId },
    { primaryIndustryId: "unknown" },
    { secondaryIndustryId: "unknown" },
    { primaryIndustryId: "" },
    { secondaryIndustryId: "" },
  ]) {
    const result = await service.updateProfile({ ...invalid, displayName: "Must not save" } as ManualProfileUpdateInput, actor);
    assert.equal(result.success, false, JSON.stringify(invalid));
    if (!result.success) assert.equal(result.error.code, "PROFILE_VALIDATION_FAILED");
    assert.deepEqual(store.getRecord({ workspaceId, collectionName: "profiles", recordId: "profile:industry-user-a" }), before);
  }
});

test("mock profile validates the same parent-child rules", async () => {
  const service = createMockProfileService();
  const valid = await service.updateProfile(selection);
  assert.ok(valid.success && valid.data.profile);
  assert.equal(valid.data.profile.secondaryIndustryId, selection.secondaryIndustryId);
  const invalid = await service.updateProfile({ ...selection, primaryIndustryId: "finance_investment" });
  assert.equal(invalid.success, false);
});

test("contact selections round-trip through storage and reject mismatches before writing notes", { todo: "SC-0020-02 blocked: frozen scope omits the provider interface and HTTP handler" }, async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:secondary-industry-contact";
  const actorId = "industry-contact-owner";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const service = createLiveContactDetailTagStatusService({ provider });
  const identity = { actorId, contactId: "contact_078" };
  const saved = await service.updateContactDetail({ ...identity, ...selection });
  assert.ok(saved.success && saved.data.contact);
  const reopened = await createLiveContactDetailTagStatusService({ provider }).getContactDetail(identity);
  assert.ok(reopened.success && reopened.data.contact);
  assert.equal(reopened.data.contact.secondaryIndustryId, selection.secondaryIndustryId);
  assert.equal(reopened.data.contact.secondaryIndustryLabel, "人工智能与数据");
  const sparse = await service.updateContactDetail({ ...identity, note: "Keep industry" });
  assert.ok(sparse.success && sparse.data.contact);
  assert.equal(sparse.data.contact.secondaryIndustryId, selection.secondaryIndustryId);
  const before = await service.getContactDetail(identity);
  const invalid = await service.updateContactDetail({ ...identity, ...selection, primaryIndustryId: "finance_investment", note: "Must not persist" });
  assert.equal(invalid.success, false);
  const after = await service.getContactDetail(identity);
  assert.ok(before.success && after.success);
  assert.deepEqual(after.data.contact, before.data.contact);
  const changed = await service.updateContactDetail({ ...identity, primaryIndustryId: "finance_investment" });
  assert.ok(changed.success && changed.data.contact);
  assert.equal(changed.data.contact.secondaryIndustryId, undefined);
  const foreign = await service.updateContactDetail({ ...identity, actorId: "foreign-actor", ...selection });
  assert.equal(foreign.success, false);
  const graph = await provider.readContactGraph(actorId);
  assert.equal(graph.contacts.find((contact) => contact.id === identity.contactId)?.primaryIndustryId, "finance_investment");
});

test("structured search uses OR within each level and AND across levels, without changing legacy filters", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const workspaceId = "workspace:secondary-industry-search";
  const actorId = "account_orbit_generated";
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  for (const [recordId, secondaryIndustryId] of [["contact_001", "technology_internet.ai_data"], ["contact_003", "technology_internet.cybersecurity"]]) {
    const record = await store.getRecord({ workspaceId, collectionName: "contacts", recordId });
    assert.ok(record);
    await store.upsertRecord({ ...record, payload: { ...record.payload, primaryIndustryId: "technology_internet", secondaryIndustryId } });
  }
  const service = createActorScopedLiveRelationshipNaturalSearchService({ actorId, provider });
  const exact = await service.queryRelationships({ secondaryIndustryIds: [selection.secondaryIndustryId] });
  assert.ok(exact.success);
  assert.deepEqual(exact.data.results.map((item) => item.contactId), ["contact_001"]);
  assert.equal(exact.data.results[0]?.secondaryIndustryId, selection.secondaryIndustryId);
  assert.deepEqual(exact.data.appliedFilters.secondaryIndustryIds, [selection.secondaryIndustryId]);
  const siblings = await service.queryRelationships({ secondaryIndustryIds: [selection.secondaryIndustryId, "technology_internet.cybersecurity"] });
  assert.ok(siblings.success);
  assert.deepEqual(siblings.data.results.map((item) => item.contactId).sort(), ["contact_001", "contact_003"]);
  const parent = await service.queryRelationships({ primaryIndustryIds: ["technology_internet"] });
  assert.ok(parent.success);
  assert.ok(parent.data.results.some((item) => item.contactId === "contact_001"));
  assert.ok(parent.data.results.some((item) => item.contactId === "contact_003"));
  const mismatch = await service.queryRelationships({ primaryIndustryIds: ["finance_investment"], secondaryIndustryIds: [selection.secondaryIndustryId] });
  assert.ok(mismatch.success);
  assert.deepEqual(mismatch.data.results, []);
  const old = await service.queryRelationships({ industryFilters: ["enterprise_saas"] });
  assert.ok(old.success);
  assert.ok(old.data.results.length > 0);
  assert.ok(old.data.results.every((item) => item.industry === "enterprise_saas"));
  const combined = await service.queryRelationships({ industryFilters: ["enterprise_saas"], secondaryIndustryIds: [selection.secondaryIndustryId] });
  assert.ok(combined.success);
  assert.ok(combined.data.results.every((item) => item.industry === "enterprise_saas" && item.secondaryIndustryId === selection.secondaryIndustryId));
  const invalid = await service.queryRelationships({ secondaryIndustryIds: ["unknown"] });
  assert.equal(invalid.success, false);
});

test("contact PATCH preserves secondary industry and rejects non-string identifiers", { todo: "SC-0020-02 blocked: app/api/contacts/[id]/handler.ts is outside the frozen scope" }, async () => {
  const previous = process.env.ORBIT_FEATURE_MODE;
  process.env.ORBIT_FEATURE_MODE = "mock";
  try {
    const patch = createContactDetailPatchHandler(async () => ({ id: "industry-user-a" }));
    const response = await patch(new Request("http://localhost/api/contacts/demo-contact-1", {
      method: "PATCH", body: JSON.stringify(selection),
    }), { params: Promise.resolve({ id: "demo-contact-1" }) });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.contact.secondaryIndustryId, selection.secondaryIndustryId);
    const invalid = await patch(new Request("http://localhost/api/contacts/demo-contact-1", {
      method: "PATCH", body: JSON.stringify({ ...selection, secondaryIndustryId: 123 }),
    }), { params: Promise.resolve({ id: "demo-contact-1" }) });
    assert.equal(invalid.status, 400);
  } finally {
    if (previous === undefined) delete process.env.ORBIT_FEATURE_MODE;
    else process.env.ORBIT_FEATURE_MODE = previous;
  }
});
