import assert from "node:assert/strict";
import test from "node:test";
import { scoreProfileCompleteness } from "../../features/profile/completeness";
import { mockManualProfile } from "../../features/profile/fixtures";
import { createMockProfileService } from "../../features/profile/mock-service";
import { createLiveProfileService } from "../../features/profile/live-service";
import { projectPublicProfile } from "../../features/profile/public-projection";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type { ManualProfile } from "../../features/profile/contract";

const hidden = { companyRole: false, offeringSeeking: false, intro: false };
const complete: ManualProfile = { ...mockManualProfile, organization: "ミナトリンク", role: "代表", bio: "自己紹介", offering: ["製造業"], seeking: ["投資家"] };

test("R18a card completeness scores four confirmed fields at 25 each without changing the legacy six-field score", () => {
  const legacy = scoreProfileCompleteness(mockManualProfile);
  const result = scoreProfileCompleteness(complete);
  assert.deepEqual(result.card, { score: 100, items: [
    { key: "companyRole", weight: 25, done: true },
    { key: "offering", weight: 25, done: true },
    { key: "seeking", weight: 25, done: true },
    { key: "intro", weight: 25, done: true },
  ] });
  const { card: _before, ...before } = legacy;
  const { card: _after, ...after } = result;
  assert.deepEqual(after, before);
  assert.equal(after.score, 83);
  assert.equal(after.completedFields.length + after.missingFields.length, 6);
});

test("R18a empty, 25%, and 50% cards ignore whitespace, partial company/role, and photos", () => {
  assert.equal(scoreProfileCompleteness(null).card?.score, 0);
  const sparse = { ...mockManualProfile, bio: " ", offering: [" "], seeking: [], organization: "会社", role: " " };
  assert.equal(scoreProfileCompleteness(sparse).card?.score, 0);
  assert.equal(scoreProfileCompleteness({ ...sparse, role: "代表" }).card?.score, 25);
  assert.equal(scoreProfileCompleteness({ ...sparse, role: "代表", offering: ["紹介"] }).card?.score, 50);
  assert.equal(scoreProfileCompleteness({ ...sparse, photo: "ignored" } as ManualProfile).card?.score, 0);
});

test("R18a public projection hides each selected field group while legacy profiles default to visible", () => {
  const visible = projectPublicProfile(complete);
  assert.equal(visible.organization, complete.organization);
  assert.deepEqual(visible.offering, complete.offering);
  assert.equal(visible.bio, complete.bio);
  const privateProfile = { ...complete, publicFields: hidden };
  const projection = projectPublicProfile(privateProfile);
  assert.equal(projection.displayName, complete.displayName);
  assert.equal(projection.organization, "");
  assert.equal(projection.role, "");
  assert.equal(projection.headline, "");
  assert.equal(projection.bio, undefined);
  assert.equal(projection.offering, undefined);
  assert.equal(projection.seeking, undefined);
  assert.ok(!("handles" in projection));
});

test("R18a live PUT persists public fields and a legacy PUT without them preserves the stored choice", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({ store, workspaceId: "workspace:r18a-public" });
  const service = createLiveProfileService({ provider, now: () => "2026-10-18T00:00:00.000Z" });
  const first = await service.updateProfile({ ...complete, publicFields: hidden }, { actorId: "actor:r18a" });
  assert.equal(first.success, true);
  if (!first.success) return;
  assert.deepEqual(first.data.profile?.publicFields, hidden);
  assert.equal(first.data.completeness.card?.score, 100);
  const reopened = createLiveProfileService({ provider, now: () => "2026-10-18T00:00:01.000Z" });
  const legacy = await reopened.updateProfile({ role: "取締役" }, { actorId: "actor:r18a" });
  assert.equal(legacy.success, true);
  if (!legacy.success) return;
  assert.deepEqual(legacy.data.profile?.publicFields, hidden);
  const read = await createLiveProfileService({ provider }).getProfile({ actorId: "actor:r18a" });
  assert.equal(read.success, true);
  if (read.success) assert.deepEqual(read.data.profile?.publicFields, hidden);
  const other = await reopened.getProfile({ actorId: "actor:other" });
  assert.equal(other.success, true);
  if (other.success) assert.equal(other.data.profile, null);
});

test("R18a rejects malformed public-field writes before persisting a profile", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({ store, workspaceId: "workspace:r18a-validation" });
  const service = createLiveProfileService({ provider });
  for (const value of [null, {}, { ...hidden, intro: "false" }, { ...hidden, surprise: true }]) {
    const result = await service.updateProfile({ displayName: "名前", publicFields: value } as never, { actorId: "actor:r18a" });
    assert.equal(result.success, false);
  }
  const read = await service.getProfile({ actorId: "actor:r18a" });
  assert.equal(read.success, true);
  if (read.success) assert.equal(read.data.profile, null);
});

test("R18a mock reads and updates include the parallel card completeness", async () => {
  const service = createMockProfileService();
  for (const scenario of ["complete", "empty", "pending"] as const) {
    const result = await service.getProfile({ scenario });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.completeness.card?.items.length, 4);
  }
  const saved = await service.updateProfile(complete);
  assert.equal(saved.success, true);
  if (saved.success) assert.equal(saved.data.completeness.card?.score, 100);
});

test("R18a response schemas preserve unknown card keys and accept old responses without card or visibility fields", async () => {
  const schemas = await import("../../shared/api-schema/profile-account").catch(() => null);
  assert.ok(schemas, "R18a profile account schemas are missing");
  const card = schemas.profileCardCompletenessSchema.parse({ score: 25, extra: true, items: [{ key: "future-field", weight: 25, done: true, extra: 1 }] });
  assert.equal(card.items[0].key, "future-field");
  assert.ok(!("extra" in card));
  const service = createMockProfileService();
  const result = await service.getProfile();
  assert.ok(result.success);
  const old = structuredClone(result.data);
  delete old.completeness.card;
  if (old.profile) delete old.profile.publicFields;
  assert.ok(schemas.profileAccountSchema.safeParse(old).success);
  assert.deepEqual(schemas.profilePublicFieldsSchema.parse({ ...hidden, future: true }), hidden);
  assert.equal(schemas.profilePublicFieldsWriteSchema.safeParse({ ...hidden, future: true }).success, false);
});

test("R18a design fixtures parse through the response schema with 25/50/100 states, six object cards, integration states and two memory sources", async () => {
  const fixtures = await import("../../shared/mock/demo-world/account").catch(() => null);
  assert.ok(fixtures, "R18a account fixtures are missing");
  const schemas = await import("../../shared/api-schema/profile-account");
  for (const [variant, score] of [["new", 25], ["regular", 50], ["complete", 100]] as const) {
    const data = schemas.profileAccountSchema.parse(fixtures.demoAccountProfiles[variant]);
    assert.equal(data.completeness.card?.score, score);
    assert.ok(data.profile);
    assert.ok((data.profile.offering?.length ?? 0) <= 5);
    assert.ok((data.profile.seeking?.length ?? 0) <= 5);
    assert.equal(fixtures.demoAccountProfiles[variant].sample, true);
  }
  assert.equal(fixtures.demoAccountSuggestions.length, 6);
  assert.equal(fixtures.demoAccountSuggestions.filter(item => item.target === "self").length, 1);
  assert.deepEqual(Object.keys(fixtures.demoAccountIntegrations), ["empty", "few", "many"]);
  assert.equal(fixtures.demoAccountMemories.length, 3);
  assert.ok(fixtures.demoAccountMemories.every(item => ["manual", "conversation"].includes(item.source)));
});
