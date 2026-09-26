import assert from "node:assert/strict";
import test from "node:test";

import type { OrbitProfileEditorView, ProfileEditorField } from "../../app/(app)/app/profile/profile-editor-adapter";
import {
  emptyProfileAfterReload,
  mergeProfilePreservingDraft,
  profileSaveFailureKind,
  profileSaveScopeFields,
  validateProfileSaveDraft,
  visibleCharacterCount,
} from "../../app/(app)/app/profile/profile-save-model";

function profile(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorView {
  return {
    bio: "hello",
    birthDate: "1990-01-01",
    company: "Orbit",
    email: "a@example.com",
    expectedUpdatedAt: "2026-09-18T00:00:00.000Z",
    fullName: "Ari",
    handles: { lineId: "line-a", wechatId: "wx-a" },
    hasPersistedProfile: true,
    headline: "",
    industry: "",
    intro: "",
    lineId: "line-a",
    offering: ["intro"],
    onboarding: { missingFields: [], policyVersion: 1, status: "complete" },
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    seeking: ["capital"],
    title: "CEO",
    topics: ["ai"],
    wechatName: "wx-a",
    ...overrides,
  } as OrbitProfileEditorView;
}

test("scope fields are disjoint between basic and matching", () => {
  const basic = profileSaveScopeFields("basic");
  const matching = profileSaveScopeFields("matching");
  assert.equal(basic.size, 8);
  assert.deepEqual([...matching].sort(), ["offering", "seeking", "topics"]);
  for (const field of matching) assert.equal(basic.has(field), false);
});

test("visibleCharacterCount counts graphemes, not UTF-16 units", () => {
  assert.equal(visibleCharacterCount("abc"), 3);
  assert.equal(visibleCharacterCount("👨‍👩‍👧"), 1);
  assert.equal(visibleCharacterCount("一句话介绍"), 5);
});

test("validateProfileSaveDraft enforces name, industry pair and 80-char bio, plus a direct handle on the basic-profile screen", () => {
  const scopeDirty = new Set<ProfileEditorField>(["displayName"]);
  assert.deepEqual(validateProfileSaveDraft({ profile: profile(), scope: "basic", scopeDirty }), { ok: true });
  assert.equal(validateProfileSaveDraft({ profile: profile({ fullName: "  " }), scope: "basic", scopeDirty }).ok, false);
  assert.equal(validateProfileSaveDraft({ profile: profile({ secondaryIndustryId: undefined }), scope: "basic", scopeDirty }).ok, false);
  const noHandleProfile = profile({ handles: undefined, lineId: "", wechatName: "" });
  assert.equal(validateProfileSaveDraft({ profile: noHandleProfile, scope: "basic", scopeDirty }).ok, true, "settings basic-scope save does not own the contact requirement");
  const noDirectHandle = validateProfileSaveDraft({ profile: noHandleProfile, requireDirectHandle: true, scope: "basic", scopeDirty });
  assert.equal(noDirectHandle.ok, false);
  if (noDirectHandle.ok) throw new Error("Expected missing direct handle validation");
  assert.deepEqual(noDirectHandle.message, {
    en: "Add either WeChat or LINE before saving the basic profile.",
    zh: "保存基础资料前，请至少填写 WeChat 或 LINE 其中一项。",
  });
  assert.equal(validateProfileSaveDraft({ profile: profile({ lineId: "", wechatName: "wx-only" }), requireDirectHandle: true, scope: "basic", scopeDirty }).ok, true);
  assert.equal(validateProfileSaveDraft({ profile: profile({ lineId: "line-only", wechatName: "" }), requireDirectHandle: true, scope: "basic", scopeDirty }).ok, true);
  const longBio = profile({ bio: "x".repeat(81) });
  const tooLong = validateProfileSaveDraft({ profile: longBio, scope: "basic", scopeDirty: new Set(["bio"]) });
  assert.equal(tooLong.ok, false);
  // bio 在新屏的标签是「关于我」（设置屏 / 基础资料屏），校验文案与标签一致，不再叫「一句话介绍」（那是 headline）。
  assert.deepEqual(tooLong.ok ? undefined : tooLong.message, { en: "Keep About me within 80 visible characters.", zh: "关于我不能超过 80 个可见字符。" });
  assert.equal(validateProfileSaveDraft({ profile: longBio, scope: "basic", scopeDirty }).ok, true, "bio not dirty → not validated");
  assert.equal(validateProfileSaveDraft({ profile: profile({ fullName: "" }), scope: "matching", scopeDirty: new Set(["topics"]) }).ok, true);
});

test("profileSaveFailureKind treats 409 or PROFILE_VERSION_CONFLICT as conflict", () => {
  assert.equal(profileSaveFailureKind(409, undefined), "conflict");
  assert.equal(profileSaveFailureKind(400, "PROFILE_VERSION_CONFLICT"), "conflict");
  assert.equal(profileSaveFailureKind(500, "OTHER"), "error");
});

test("mergeProfilePreservingDraft keeps only the preserved dirty fields from the draft", () => {
  const latest = profile({ bio: "server", fullName: "Server Name", title: "CTO", topics: ["server"] });
  const current = profile({ bio: "draft", fullName: "Draft Name", title: "draft-title", topics: ["draft"] });
  const merged = mergeProfilePreservingDraft({
    current,
    dirtyHandleFields: new Set(),
    latest,
    preserve: new Set<ProfileEditorField>(["bio", "topics"]),
  });
  assert.equal(merged.bio, "draft");
  assert.deepEqual(merged.topics, ["draft"]);
  assert.equal(merged.fullName, "Server Name");
  assert.equal(merged.title, "CTO");
  assert.equal(merged.email, latest.email);
});

test("mergeProfilePreservingDraft merges visible handle drafts when handles are preserved", () => {
  const latest = profile({ handles: { lineId: "line-server", wechatId: "wx-server" }, lineId: "line-server", wechatName: "wx-server" });
  const current = profile({ handles: { lineId: "line-draft", wechatId: "wx-draft" }, lineId: "line-draft", wechatName: "wx-draft" });
  const merged = mergeProfilePreservingDraft({
    current,
    dirtyHandleFields: new Set(["lineId"]),
    latest,
    preserve: new Set<ProfileEditorField>(["handles"]),
  });
  assert.equal(merged.lineId, "line-draft");
  assert.equal(merged.wechatName, "wx-server");
});

test("emptyProfileAfterReload clears persisted fields but keeps email and display name", () => {
  const onboarding = { missingFields: ["displayName"], policyVersion: 1 as const, status: "incomplete" as const };
  const empty = emptyProfileAfterReload(profile(), onboarding as OrbitProfileEditorView["onboarding"]);
  assert.equal(empty.email, "a@example.com");
  assert.equal(empty.hasPersistedProfile, false);
  assert.equal(empty.expectedUpdatedAt, null);
  assert.equal(empty.fullName, "Ari", "display name is not cleared by reload");
  assert.deepEqual(empty.topics, []);
  assert.equal(empty.onboarding, onboarding);
});
