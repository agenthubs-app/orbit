import assert from "node:assert/strict";
import test from "node:test";

import type { IngestBatchDetailContract, IngestItemContract } from "../src/api/contract/business-card-batch";
import { profileDetailSchema } from "../src/api/profile-detail-contract";
import {
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
  onboardingEntry,
  onboardingImportSummary,
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

test("entry: a new account with nothing saved starts at the welcome screen", () => {
  const empty = profileDetailSchema.parse({ ...emptyProfilePayload, onboarding: incomplete });
  assert.deepEqual(onboardingEntry(empty), { kind: "welcome" });
  assert.deepEqual(onboardingEntry(detail(blank)), { kind: "welcome" });
});

test("entry: resume starts at the first unfinished step inferred from saved fields", () => {
  // Step 1 and 2 saved, persona empty → the OnbStates D example: 2 / 5 from persona.
  assert.deepEqual(onboardingEntry(detail({ ...blank, relationshipGoal: "获取客户（本季度）" }, complete)), { kind: "resume", completed: 2, step: "persona" });
  // Only step 1 saved.
  assert.deepEqual(onboardingEntry(detail(blank, complete)), { kind: "resume", completed: 1, step: "goals" });
  // Later steps saved elsewhere but the completion policy still misses fields → step 1 first.
  assert.deepEqual(onboardingEntry(detail({ ...blank, bio: "做产品" }, incomplete)), { kind: "resume", completed: 1, step: "profile" });
  // Through intro, not persona: persona is the first gap.
  assert.deepEqual(onboardingEntry(detail({ ...blank, relationshipGoal: "x", headline: "h" }, complete)), { kind: "resume", completed: 3, step: "persona" });
});

test("entry: an account with steps 1–4 saved leaves onboarding immediately", () => {
  assert.deepEqual(onboardingEntry(detail({ relationshipGoal: "x", offering: ["a"], seeking: [], bio: "", headline: "h" }, complete)), { kind: "done" });
});

test("entry: an absent completion policy is not read as complete", () => {
  const parsed = profileDetailSchema.parse({ ...profilePayload, onboarding: undefined });
  assert.equal(onboardingEntry(parsed).kind, "resume");
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
  const ja = composeRelationshipGoal({ goals: ["顧客獲得"], focus: "日本で試験導入先を探す", horizon: "今月" }, "ja");
  assert.equal(ja, "顧客獲得：日本で試験導入先を探す（今月）");
  assert.deepEqual(parseRelationshipGoal(ja), { goals: ["顧客獲得"], focus: "日本で試験導入先を探す", horizon: "今月" });
  assert.deepEqual(parseRelationshipGoal("认识可以一起做产品的同行"), { goals: [], focus: "认识可以一起做产品的同行", horizon: "" });
  assert.equal(composeRelationshipGoal({ goals: [], focus: " ", horizon: "本月" }, "zh"), "");
});

test("options match across the three languages and label in the current one", () => {
  const option = OFFER_OPTIONS.find(item => item.zh === "客户引荐")!;
  assert.equal(optionMatches(option, "Customer introductions"), true);
  assert.equal(optionMatches(option, "顧客紹介"), true);
  assert.equal(optionMatches(option, "别的"), false);
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

test("basic draft requires name, a valid industry pair and a birth date", () => {
  const base = basicDraftFromProfile(detail({ displayName: "林晓", primaryIndustryId: "technology_internet", secondaryIndustryId: null, birthDate: null }).profile);
  assert.equal(base.name, "林晓");
  assert.equal(basicDraftValid(base, "2026-09-27"), false);
  const secondary = "technology_internet.enterprise_software";
  assert.equal(basicDraftValid({ ...base, secondaryIndustryId: secondary, birthDate: "1990-01-01" }, "2026-09-27"), true);
  assert.equal(basicDraftValid({ ...base, secondaryIndustryId: "food_hospitality.restaurants", birthDate: "1990-01-01" }, "2026-09-27"), false);
  assert.equal(basicDraftValid({ ...base, name: " ", secondaryIndustryId: secondary, birthDate: "1990-01-01" }, "2026-09-27"), false);
});

test("intro drafts use the two languages the server supports", () => {
  assert.equal(introDraftLanguage("zh"), "zh");
  assert.equal(introDraftLanguage("en"), "en");
  assert.equal(introDraftLanguage("ja"), "en");
  assert.equal(INTRO_REGENERATE_LIMIT, 3);
});

function item(cardId: string, status: IngestItemContract["status"], seq: number, side: "front" | "back" = "front"): IngestItemContract {
  return { id: `item:${seq}`, batchId: "batch:1", cardId, side, seq, status, version: 1, sourceFileName: `${seq}.jpg`, rawSize: 1, rawMimeType: "image/jpeg", clientDigest: `d${seq}`,
    imageDigest: null, derivativeObjectKey: null, derivativeSize: null, confirmedContactId: status === "confirmed" ? "contact:1" : null } as unknown as IngestItemContract;
}
function batch(id: string, items: IngestItemContract[]): IngestBatchDetailContract {
  return { batch: { id } as IngestBatchDetailContract["batch"], items: items.map(entry => ({ ...entry, batchId: id })) };
}

test("import summary counts cards, not images, and points at the batch that needs review", () => {
  const summary = onboardingImportSummary([
    batch("b1", [item("c1", "confirmed", 1), item("c1", "confirmed", 2, "back"), item("c2", "extracted", 3), item("c3", "processing", 4)]),
    batch("b2", [item("c4", "terminal_failed", 1), item("c5", "skipped", 2), item("c6", "queued", 3)])
  ]);
  assert.deepEqual(summary, { imported: 1, review: 2, recognizing: 2, reviewBatchId: "b1" });
  assert.deepEqual(onboardingImportSummary([]), { imported: 0, review: 0, recognizing: 0, reviewBatchId: null });
});
