import assert from "node:assert/strict";
import test from "node:test";

import type { ManualProfileUpdateInput } from "../../features/profile/contract";
import { createLiveProfileService } from "../../features/profile/live-service";
import { projectPublicProfile } from "../../features/profile/public-projection";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const instant = "2026-09-15T06:00:00.000Z";

function fixture() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const provider = createStorageProfileProvider({
    store,
    workspaceId: "profile-ink-signal-fields",
  });
  const service = createLiveProfileService({ provider, now: () => instant });
  return { provider, service, store };
}

test("profile saves spoken languages and profile-only social links while preserving sparse legacy updates", async () => {
  const { service } = fixture();
  const actorId = "actor:profile-fields";
  const created = await service.updateProfile({
    displayName: "程川",
    spokenLanguages: ["中文", "日本語", "English"],
    handles: {
      email: "private@example.test",
      website: "https://example.test",
      linkedinUrl: "https://www.linkedin.com/in/cheng-chuan",
      xHandle: "@chengchuan",
    },
  } as ManualProfileUpdateInput, { actorId });
  assert.equal(created.success, true);

  const sparse = await service.updateProfile({ role: "产品经理" }, { actorId });
  assert.equal(sparse.success, true);
  if (!sparse.success) throw new Error("Sparse profile update failed");
  assert.deepEqual(Reflect.get(sparse.data.profile!, "spokenLanguages"), ["中文", "日本語", "English"]);
  assert.deepEqual(sparse.data.profile?.handles, {
    email: "private@example.test",
    website: "https://example.test",
    linkedinUrl: "https://www.linkedin.com/in/cheng-chuan",
    xHandle: "@chengchuan",
  });

  const cleared = await service.updateProfile({
    spokenLanguages: [],
    handles: { website: "", linkedinUrl: "", xHandle: "" },
  } as ManualProfileUpdateInput, { actorId });
  assert.equal(cleared.success, true);
  if (!cleared.success) throw new Error("Profile clear failed");
  assert.deepEqual(Reflect.get(cleared.data.profile!, "spokenLanguages"), []);
  assert.deepEqual(cleared.data.profile?.handles, {});
});

test("profile normalizes tag whitespace and Unicode before stable dedupe", async () => {
  const { service } = fixture();
  const result = await service.updateProfile({
    displayName: "程川",
    bio: "  在做 B 端协作工具的出海版本。  ",
    offering: ["  产品研究  ", "产品研究", "ＡＩ　咨询", "ai 咨询"],
    seeking: ["前端合作者", " 前端合作者 ", "早期用户"],
  } as ManualProfileUpdateInput, { actorId: "actor:normalized" });
  assert.equal(result.success, true);
  if (!result.success) throw new Error("Normalized profile update failed");
  assert.equal(result.data.profile?.bio, "在做 B 端协作工具的出海版本。");
  assert.deepEqual(result.data.profile?.offering, ["产品研究", "AI 咨询"]);
  assert.deepEqual(result.data.profile?.seeking, ["前端合作者", "早期用户"]);
});

test("profile rejects bio over 80 visible characters and tag groups over five before writing", async () => {
  const exact = fixture();
  const exactLimit = await exact.service.updateProfile({ displayName: "程川", bio: "👨‍👩‍👧‍👦".repeat(80) }, { actorId: "actor:exact-visible-limit" });
  assert.equal(exactLimit.success, true);
  for (const update of [
    { displayName: "程川", bio: "界".repeat(81) },
    { displayName: "程川", bio: "👨‍👩‍👧‍👦".repeat(81) },
    { displayName: "程川", offering: ["一", "二", "三", "四", "五", "六"] },
    { displayName: "程川", seeking: ["一", "二", "三", "四", "五", "六"] },
  ]) {
    const { service, store } = fixture();
    const result = await service.updateProfile(update as ManualProfileUpdateInput, { actorId: "actor:limits" });
    assert.equal(result.success, false, JSON.stringify(update));
    if (!result.success) assert.equal(result.error.code, "PROFILE_VALIDATION_FAILED");
    assert.deepEqual(await store.listRecords({ limit: "unbounded", workspaceId: "profile-ink-signal-fields", collectionName: "profiles" }), []);
  }
});

test("the profile feature public projection exposes one allowlist and excludes private profile fields", () => {
  const sourceProfile = {
    id: "profile:actor-a",
    birthDate: "2000-02-29",
    displayName: "程川",
    headline: "旧标题",
    organization: "星野工作室",
    role: "产品经理",
    homeMarket: "东京 · 日本",
    relationshipGoal: "认识独立创作者",
    targetRelationshipTypes: ["音乐合作者"],
    preferredFollowUpWindow: "2 周",
    preferredLanguage: "zh" as const,
    preferredIntroChannels: ["站内消息"],
    handles: {
      email: "private@example.test",
      phone: "+81-private",
      website: "https://private.example.test",
      linkedinUrl: "https://linkedin.example.test/private",
      xHandle: "@private",
    },
    primaryIndustryId: "technology_internet" as const,
    secondaryIndustryId: "technology_internet.enterprise_software" as const,
    industry: "互联网 · 企业服务",
    bio: "在做 B 端协作工具的出海版本。",
    offering: ["产品需求梳理"],
    seeking: ["前端合作者"],
    topics: ["产品设计"],
    spokenLanguages: ["中文", "日本語"],
    updatedAt: instant,
    provenance: { raw: "never public" },
  };
  const projected = projectPublicProfile(sourceProfile);
  assert.deepEqual(projected, {
    id: "profile:actor-a",
    displayName: "程川",
    headline: "旧标题",
    organization: "星野工作室",
    role: "产品经理",
    homeMarket: "东京 · 日本",
    relationshipGoal: "认识独立创作者",
    targetRelationshipTypes: ["音乐合作者"],
    preferredIntroChannels: ["站内消息"],
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    industry: "互联网 · 企业服务",
    bio: "在做 B 端协作工具的出海版本。",
    offering: ["产品需求梳理"],
    seeking: ["前端合作者"],
    topics: ["产品设计"],
    spokenLanguages: ["中文", "日本語"],
    updatedAt: instant,
  });
  const serialized = JSON.stringify(projected);
  for (const privateMarker of [
    "2000-02-29",
    "2 周",
    "private@example.test",
    "+81-private",
    "linkedin.example.test",
    "@private",
    "never public",
    "birthDate",
    "handles",
    "preferredFollowUpWindow",
    "provenance",
  ]) assert.equal(serialized.includes(privateMarker), false, privateMarker);
});
