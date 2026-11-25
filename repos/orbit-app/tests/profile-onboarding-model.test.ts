import assert from "node:assert/strict";
import test from "node:test";

import { profileDetailSchema } from "../src/api/profile-detail-contract";
import {
  savedOptionLabel,
  SEEK_OPTIONS as SAVED_LABEL_SEEK_OPTIONS,
  GOAL_LIMIT,
  HORIZONS,
  INTRO_REGENERATE_LIMIT,
  OFFER_OPTIONS,
  addCustomValue,
  basicDraftFromProfile,
  basicDraftValid,
  composeRelationshipGoal,
  introDraftLanguage,
  isValidProfileBirthDate,
  onboardingDestination,
  onboardingGoals,
  onboardingMissing,
  onboardingRequired,
  stepForConfirmedScreen,
  EMPTY_BASIC,
  STEP_SCREENS,
  optionLabel,
  optionMatches,
  parseRelationshipGoal,
  toggleValue
} from "../src/view-models/profile-onboarding";
import { emptyProfilePayload, profilePayload } from "./helpers/profile-detail-fixtures";

const complete = { policyVersion: 1, status: "complete", missingFields: [] } as const;
const incomplete = { policyVersion: 1, status: "incomplete", missingFields: ["displayName", "primaryIndustryId", "secondaryIndustryId", "birthDate"] } as const;

function detail(profilePatch: Record<string, unknown>, onboarding: unknown = incomplete) {
  const parsed = profileDetailSchema.safeParse({ ...profilePayload, onboarding, profile: { ...profilePayload.profile, ...profilePatch } });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  return parsed.data!;
}

const blank = { relationshipGoal: "", offering: [], seeking: [], bio: "", headline: "" };

test("three steps sit on the server's five screens, both ways", () => {
  assert.deepEqual(Object.values(STEP_SCREENS).flat(), [1, 2, 3, 4, 5]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(stepForConfirmedScreen), ["profile", "goals", "goals", "intro", "intro", "intro"]);
});

test("missing: name, industry, then detail; one goal; an introduction within its limit", () => {
  const basic = { ...EMPTY_BASIC, name: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" } as const;
  const draft = { basic, goals: [], bio: "" };
  assert.deepEqual(onboardingMissing("profile", { ...draft, basic: EMPTY_BASIC }), ["name", "primaryIndustry"]);
  assert.deepEqual(onboardingMissing("profile", { ...draft, basic: { ...basic, secondaryIndustryId: "" } }), ["secondaryIndustry"]);
  assert.deepEqual(onboardingMissing("profile", { ...draft, basic: { ...basic, name: "  " } }), ["name"]);
  assert.deepEqual(onboardingMissing("profile", draft), [], "company, title, contacts and birthday are optional");
  assert.deepEqual(onboardingMissing("goals", draft), ["goals"]);
  assert.deepEqual(onboardingMissing("goals", { ...draft, goals: ["招聘人才"] }), []);
  assert.deepEqual(onboardingMissing("intro", draft), ["intro"]);
  assert.deepEqual(onboardingMissing("intro", { ...draft, bio: "界".repeat(81) }), ["intro"]);
  assert.deepEqual(onboardingMissing("intro", { ...draft, bio: "界".repeat(80) }), []);
});

test("who still has to go through onboarding", () => {
  const flow = (patch: Partial<{ deferred: boolean; finishedAt: string | null }> = {}) => ({ deferred: false, finishedAt: null, ...patch });
  const filled = detail({ relationshipGoal: "获取客户", bio: "介绍" }, complete);
  assert.equal(onboardingRequired(detail(blank), null), true, "an incomplete profile, with or without a flow");
  assert.equal(onboardingRequired(detail(blank), flow({ deferred: true })), true, "putting it off no longer counts");
  assert.equal(onboardingRequired(detail(blank), flow({ finishedAt: "2026-10-20T00:00:00.000Z" })), true, "finished once, then a required field went missing");
  assert.equal(onboardingRequired(filled, flow()), true, "started and not finished");
  assert.equal(onboardingRequired(detail(blank, complete), flow({ deferred: true })), true, "put off before the goal and the introduction");
  assert.equal(onboardingRequired(filled, flow({ deferred: true })), false, "put off, but everything required is there");
  assert.equal(onboardingRequired(filled, flow({ finishedAt: "2026-10-20T00:00:00.000Z" })), false);
  assert.equal(onboardingRequired(detail(blank, complete), null), false, "an older complete account that never had a flow");
  assert.equal(onboardingRequired(detail(blank, undefined), null), true, "the fixture default is incomplete");
});

test("goals of earlier lists have no card: their text stays in the one line", () => {
  assert.deepEqual(onboardingGoals("获取客户、开拓新市场：日本（本季度）"), { goals: ["获取客户"], focus: "开拓新市场、日本", horizon: "本季度" });
  assert.deepEqual(onboardingGoals("自由文字"), { goals: [], focus: "自由文字", horizon: "" });
});

test("destination keeps a safe next, allows the profile page and rejects loops", () => {
  assert.equal(onboardingDestination("/events/e1?tab=details"), "/events/e1?tab=details");
  assert.equal(onboardingDestination(["/events/a", "/events/b"]), "/events/a");
  assert.equal(onboardingDestination("/profile"), "/profile");
  assert.equal(onboardingDestination(undefined), "/home");
  for (const next of ["/profile/onboarding?next=%2Fhome", "/profile/continue", "/profile?complete=1&next=%2Fprofile", "https://evil.test", "/account/login"]) {
    assert.equal(onboardingDestination(next), "/home", next);
  }
});

test("relationship goal round-trips in zh, en and ja; foreign text becomes the one-line focus", () => {
  const zh = composeRelationshipGoal({ goals: ["获取客户", "开拓新市场"], focus: "把产品推到日本", horizon: "本季度" }, "zh");
  assert.equal(zh, "获取客户、开拓新市场：把产品推到日本（本季度）");
  assert.deepEqual(parseRelationshipGoal(zh), { goals: ["获取客户", "开拓新市场"], focus: "把产品推到日本", horizon: "本季度" });
  const en = composeRelationshipGoal({ goals: ["Win customers"], focus: "", horizon: "This year" }, "en");
  assert.equal(en, "Win customers (This year)");
  assert.deepEqual(parseRelationshipGoal(en), { goals: ["Win customers"], focus: "", horizon: "This year" });
  const ja = composeRelationshipGoal({ goals: ["新規顧客開拓"], focus: "日本で試験導入先を探す", horizon: "今月" }, "ja");
  assert.equal(ja, "新規顧客開拓：日本で試験導入先を探す（今月）");
  assert.deepEqual(parseRelationshipGoal(ja), { goals: ["新規顧客開拓"], focus: "日本で試験導入先を探す", horizon: "今月" });
  assert.deepEqual(parseRelationshipGoal("认识可以一起做产品的同行"), { goals: [], focus: "认识可以一起做产品的同行", horizon: "" });
  const unknown = "旧格式：" + "自由文字".repeat(20);
  assert.deepEqual(parseRelationshipGoal(unknown), { goals: [], focus: unknown, horizon: "" });
  assert.equal(composeRelationshipGoal({ goals: [], focus: " ", horizon: "本月" }, "zh"), "");
});

test("options match across the three languages and label in the current one", () => {
  const option = OFFER_OPTIONS.find(item => item.zh === "客户引荐")!;
  assert.equal(optionMatches(option, "Customer introductions"), true);
  assert.equal(optionMatches(option, "顧客紹介"), true);
  assert.equal(optionMatches(option, "别的"), false);
  assert.equal(optionMatches(OFFER_OPTIONS.find(item => item.zh === "市场渠道")!, "販売チャネル"), true, "a label the App saved before the shared table");
  assert.equal(optionLabel(option, "ja"), "顧客紹介");
  assert.equal(HORIZONS.length, 3);
});

test("toggle and custom values respect limits and normalize duplicates", () => {
  assert.deepEqual(toggleValue(["a", "b", "c"], "d", GOAL_LIMIT), ["a", "b", "c"]);
  assert.deepEqual(toggleValue(["a", "b"], "a", GOAL_LIMIT), ["b"]);
  assert.deepEqual(addCustomValue(["AI"], " ai ", 5), ["AI"]);
  assert.deepEqual(addCustomValue([], "  跨境   电商 ", 5), ["跨境 电商"]);
  assert.deepEqual(addCustomValue([], "x".repeat(25), 5), []);
  assert.deepEqual(addCustomValue(["1", "2", "3", "4", "5"], "6", 5), ["1", "2", "3", "4", "5"]);
});

test("birth date validation uses calendar strings and rejects future or impossible days", () => {
  assert.equal(isValidProfileBirthDate("2000-02-29", "2026-09-27"), true);
  assert.equal(isValidProfileBirthDate("2001-02-29", "2026-09-27"), false);
  assert.equal(isValidProfileBirthDate("2026-09-28", "2026-09-27"), false);
  assert.equal(isValidProfileBirthDate("1990/01/01", "2026-09-27"), false);
});

test("basic draft requires name and a valid industry pair; birthday is optional", () => {
  const base = basicDraftFromProfile(detail({ displayName: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: null, birthDate: null }).profile);
  assert.equal(base.name, "林晓");
  assert.equal(basicDraftValid(base, "2026-09-27"), false);
  const secondary = "technology_internet.enterprise_software";
  assert.equal(basicDraftValid({ ...base, secondaryIndustryId: secondary }, "2026-09-27"), true);
  assert.equal(basicDraftValid({ ...base, secondaryIndustryId: secondary, birthDate: "1990-01-01" }, "2026-09-27"), true);
  assert.equal(basicDraftValid({ ...base, secondaryIndustryId: "food_hospitality.restaurants", birthDate: "1990-01-01" }, "2026-09-27"), false);
  assert.equal(basicDraftValid({ ...base, name: " ", secondaryIndustryId: secondary, birthDate: "1990-01-01" }, "2026-09-27"), false);
});

test("intro drafts preserve Japanese and allow two alternatives after the first", () => {
  assert.equal(introDraftLanguage("zh"), "zh");
  assert.equal(introDraftLanguage("en"), "en");
  assert.equal(introDraftLanguage("ja"), "ja");
  assert.equal(INTRO_REGENERATE_LIMIT, 2);
});

test("saved tags show in the reader's language without changing what is stored", () => {
  assert.equal(savedOptionLabel(SAVED_LABEL_SEEK_OPTIONS, "投资人", "en"), "Investors");
  assert.equal(savedOptionLabel(SAVED_LABEL_SEEK_OPTIONS, "Investors", "ja"), "投資家");
  assert.equal(savedOptionLabel(SAVED_LABEL_SEEK_OPTIONS, "我自己写的", "en"), "我自己写的");
});
