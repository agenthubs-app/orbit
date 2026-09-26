import assert from "node:assert/strict";
import test from "node:test";

import type { ProfileOnboardingContract } from "../../shared/contract/profile";
import type { OrbitProfileEditorView } from "../../app/(app)/app/profile/profile-editor-adapter";
import {
  ONBOARDING_FIELD_LABEL,
  aboutShort,
  completeness,
  contactRows,
  missingFieldLabels,
  onboardingFieldLabel,
  personaGroups,
  selectedOptionValue,
  suggestions,
} from "../../app/(app)/app/profile/profile-0918/profile-model";

function emptyProfile(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorView {
  return {
    bio: "",
    birthDate: null,
    company: "",
    email: "",
    expectedUpdatedAt: null,
    fullName: "",
    handles: undefined,
    hasPersistedProfile: false,
    headline: "",
    industry: "",
    intro: "",
    lineId: "",
    offering: [],
    onboarding: {
      policyVersion: 1,
      status: "incomplete",
      missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"],
    },
    primaryIndustryId: undefined,
    secondaryIndustryId: undefined,
    seeking: [],
    title: "",
    topics: [],
    wechatName: "",
    ...overrides,
  };
}

function fullProfile(overrides: Partial<OrbitProfileEditorView> = {}): OrbitProfileEditorView {
  return emptyProfile({
    bio: "Builds relationship tooling.",
    birthDate: "1990-01-02",
    company: "Orbit",
    email: "owner@example.com",
    fullName: "Owner",
    handles: { email: "owner@example.com", lineId: "owner-line", wechatId: "owner-wechat" },
    hasPersistedProfile: true,
    intro: "Meet operators in Tokyo",
    lineId: "owner-line",
    offering: ["Intros"],
    onboarding: { policyVersion: 1, status: "complete", missingFields: [] },
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.ai_data",
    seeking: ["Partners"],
    title: "Founder",
    topics: ["AI"],
    wechatName: "owner-wechat",
    ...overrides,
  });
}

test("completeness counts ten items: all empty → 0/10, all filled → 100", () => {
  assert.deepEqual(completeness(emptyProfile()), { score: 0, filled: 0, total: 10 });
  assert.deepEqual(completeness(fullProfile()), { score: 100, filled: 10, total: 10 });
});

test("completeness rounds the filled ratio and ignores whitespace-only text", () => {
  const partial = emptyProfile({ fullName: "Owner", title: "   ", offering: ["x"], primaryIndustryId: "technology_internet" });
  assert.deepEqual(completeness(partial), { score: 30, filled: 3, total: 10 });
});

test("personaGroups maps the four groups in order, goal is a single value from intro, and multi-select groups carry preset options", () => {
  const groups = personaGroups(fullProfile());
  assert.deepEqual(groups.map(group => group.key), ["goal", "offer", "seek", "topic"]);
  assert.deepEqual(groups[0].values, ["Meet operators in Tokyo"]);
  assert.deepEqual(groups[1].values, ["Intros"]);
  assert.deepEqual(groups[2].values, ["Partners"]);
  assert.deepEqual(groups[3].values, ["AI"]);
  for (const group of groups) {
    assert.ok(group.icon);
    assert.ok(group.title.zh && group.title.en);
    assert.ok(group.hint.zh && group.hint.en);
  }
  // 我的目标：手动输入的单文本，下方三条示例（一条人脉目标 + 两条商业目标）；其余三组为多选，带按产品定位编写的双语预设选项
  assert.ok(groups[0].placeholder.zh && groups[0].placeholder.en);
  assert.deepEqual(groups[0].options.map(option => option.zh), ["三个月内认识 3 位日本市场的渠道伙伴", "年内在东京开出第一家线下门店", "从 0 到 1 打造自有品牌"]);
  for (const option of groups[0].options) assert.ok(option.en);
  for (const group of groups.slice(1)) {
    assert.ok(group.placeholder.zh && group.placeholder.en);
    assert.ok(group.options.length >= 10, `${group.key} has preset options`);
    for (const option of group.options) assert.ok(option.zh && option.en);
    assert.equal(new Set(group.options.map(option => option.zh)).size, group.options.length, `${group.key} options unique`);
  }
  assert.deepEqual(personaGroups(emptyProfile())[0].values, []);
  assert.deepEqual(personaGroups(emptyProfile({ intro: "   " }))[0].values, []);
});

test("contactRows drops empty handles and keeps email/linkedin/line/wechat/phone/website/x order", () => {
  const rows = contactRows(fullProfile({
    handles: {
      email: "owner@example.com",
      lineId: "owner-line",
      linkedinUrl: "https://linkedin.com/in/owner",
      phone: "",
      website: "https://orbit.example",
      xHandle: "@owner",
    },
    wechatName: "owner-wechat",
  }));
  assert.deepEqual(rows.map(row => row.value), [
    "owner@example.com",
    "https://linkedin.com/in/owner",
    "owner-line",
    "owner-wechat",
    "https://orbit.example",
    "@owner",
  ]);
  for (const row of rows) {
    assert.ok(row.icon);
    assert.ok(row.label);
  }
  assert.deepEqual(contactRows(emptyProfile()), []);
});

test("contactRows reads the visible draft for email/line/wechat", () => {
  const rows = contactRows(emptyProfile({ email: "draft@example.com", lineId: " line-draft ", wechatName: "" }));
  assert.deepEqual(rows.map(row => row.value), ["draft@example.com", "line-draft"]);
});

test("suggestions returns basic/persona/connect keys only when their condition holds", () => {
  assert.deepEqual(suggestions(emptyProfile(), 0), ["basic", "persona", "connect"]);
  assert.deepEqual(suggestions(fullProfile(), 0), ["connect"]);
  assert.deepEqual(suggestions(fullProfile(), 2), []);
  assert.deepEqual(suggestions(fullProfile({ intro: "" }), 3), ["persona"]);
  assert.deepEqual(suggestions(fullProfile({ topics: [] }), 3), ["persona"]);
  assert.deepEqual(
    suggestions(fullProfile({ onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] } }), 3),
    ["basic"],
  );
});

test("missingFieldLabels maps onboarding codes to zh/en labels in order", () => {
  const onboarding = {
    policyVersion: 1 as const,
    status: "incomplete" as const,
    missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"] as const,
  };
  assert.deepEqual(missingFieldLabels(onboarding, "zh"), ["姓名", "一级行业", "二级行业", "生日"]);
  assert.deepEqual(missingFieldLabels(onboarding, "en"), ["Name", "Primary industry", "Secondary industry", "Birth date"]);
  assert.deepEqual(missingFieldLabels({ policyVersion: 1, status: "complete", missingFields: [] }, "zh"), []);
  assert.equal(ONBOARDING_FIELD_LABEL.birthDate.zh, "生日");
});

test("onboardingFieldLabel / missingFieldLabels fall back to the raw code for unknown codes", () => {
  assert.equal(onboardingFieldLabel("displayName", "en"), "Name");
  assert.equal(onboardingFieldLabel("phoneNumber", "zh"), "phoneNumber");
  const onboarding = {
    policyVersion: 1,
    status: "incomplete",
    missingFields: ["birthDate", "phoneNumber"],
  } as unknown as ProfileOnboardingContract;
  assert.deepEqual(missingFieldLabels(onboarding, "zh"), ["生日", "phoneNumber"]);
});

test("aboutShort keeps up to 62 characters and appends … beyond that (design aboutShort)", () => {
  const sixtyTwo = "字".repeat(62);
  assert.equal(aboutShort(""), "");
  assert.equal(aboutShort("  短介绍  "), "短介绍");
  assert.equal(aboutShort(sixtyTwo), sixtyTwo);
  assert.equal(aboutShort(`${sixtyTwo}多`), `${sixtyTwo}…`);
  assert.equal(aboutShort(`${sixtyTwo}多出来的一大段`).length, 63);
});

test("selectedOptionValue matches a preset in either language", () => {
  const option = { zh: "投资人", en: "Investors" };
  assert.equal(selectedOptionValue(option, ["Investors"]), "Investors");
  assert.equal(selectedOptionValue(option, ["投资人"]), "投资人");
  assert.equal(selectedOptionValue(option, ["投资"]), undefined);
});
