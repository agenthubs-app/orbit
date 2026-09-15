import assert from "node:assert/strict";
import test from "node:test";

import { projectPublicProfile, type ManualProfileContract } from "../src/api/contract/profile";
import { profileDetailSchema, profileSuggestionDismissReceiptSchema, profileSuggestionsSchema, type ProfileSuggestion } from "../src/api/profile-detail-contract";
import { profilePayload, profileSuggestionsPayload } from "./helpers/profile-detail-fixtures";

const privateProfile: ManualProfileContract = {
  id: "profile:privacy",
  birthDate: "1990-05-01",
  displayName: "程川",
  headline: "产品经理",
  organization: "星野工作室",
  role: "产品负责人",
  homeMarket: "东京",
  relationshipGoal: "认识独立创作者",
  targetRelationshipTypes: ["音乐合作者"],
  preferredFollowUpWindow: "PRIVATE_FOLLOWUP_WINDOW",
  preferredLanguage: "zh",
  preferredIntroChannels: ["email"],
  handles: {
    email: "private@example.test",
    linkedinUrl: "https://linkedin.example/private",
    xHandle: "@private",
  },
  bio: "正在建设可信的人脉协作工具。",
  offering: ["产品研究"],
  seeking: ["设计合作"],
  topics: ["用户研究"],
  spokenLanguages: ["中文", "日本語"],
  updatedAt: "2026-09-15T00:00:00.000Z",
};

test("the App consumes the same explicit public projection and excludes private markers", () => {
  const projected = projectPublicProfile(privateProfile);
  assert.deepEqual(Object.keys(projected).sort(), [
    "bio", "displayName", "headline", "homeMarket", "id", "offering", "organization",
    "preferredIntroChannels", "relationshipGoal", "role", "seeking", "spokenLanguages",
    "targetRelationshipTypes", "topics", "updatedAt",
  ]);
  const serialized = JSON.stringify(projected);
  for (const marker of ["1990-05-01", "PRIVATE_FOLLOWUP_WINDOW", "private@example.test", "@private", "linkedin"]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
  assert.equal(projected.relationshipGoal, "认识独立创作者");
  assert.deepEqual(projected.targetRelationshipTypes, ["音乐合作者"]);
});

test("profile detail accepts the new optional languages and profile-specific social handles", () => {
  const result = profileDetailSchema.safeParse({
    ...profilePayload,
    profile: {
      ...profilePayload.profile,
      handles: { linkedinUrl: "https://linkedin.example/cheng", xHandle: "@cheng" },
      spokenLanguages: ["中文", "日本語"],
    },
  });
  assert.equal(result.success, true);
});

test("profile suggestions accept bio and tag targets with field-compatible values", () => {
  const base = {
    confidence: "high",
    createdAt: "2026-09-15T00:00:00.000Z",
    evidence: [],
    id: "suggestion:new-field",
    provenance: profileSuggestionsPayload.provenance as ProfileSuggestion["provenance"],
    rationale: "来源记录显示资料可以更新。",
    sourceKind: "chat",
    sourceLabel: "最近聊天",
    status: "pending",
  };
  for (const suggestion of [
    { ...base, targetProfileField: "bio", currentValue: "旧简介", suggestedValue: "新简介" },
    { ...base, id: "suggestion:offering", targetProfileField: "offering", currentValue: [], suggestedValue: ["产品研究"] },
    { ...base, id: "suggestion:seeking", targetProfileField: "seeking", currentValue: [], suggestedValue: ["设计合作"] },
  ]) {
    assert.equal(profileSuggestionsSchema.safeParse({
      ...profileSuggestionsPayload,
      state: "success",
      suggestions: [suggestion],
    }).success, true);
  }
});

test("dismiss receipts acknowledge the exact suggestion and mutation", () => {
  const suggestion: ProfileSuggestion = {
    confidence: "high" as const,
    createdAt: "2026-09-15T00:00:00.000Z",
    currentValue: "旧简介",
    evidence: [],
    id: "suggestion:dismiss",
    provenance: profileSuggestionsPayload.provenance as ProfileSuggestion["provenance"],
    rationale: "来源记录显示资料可以更新。",
    sourceKind: "chat" as const,
    sourceLabel: "最近聊天",
    status: "pending" as const,
    suggestedValue: "新简介",
    targetProfileField: "bio" as const,
  };
  const receipt = {
    dismissedAt: "2026-09-15T00:00:01.000Z",
    dismissedSuggestion: { ...suggestion, status: "dismissed" },
    mutationId: "decision:dismiss",
    nextAction: "继续复核。",
    provenance: suggestion.provenance,
    state: "dismissed",
  };
  assert.equal(profileSuggestionDismissReceiptSchema(suggestion, "decision:dismiss").safeParse(receipt).success, true);
  assert.equal(profileSuggestionDismissReceiptSchema(suggestion, "wrong").safeParse(receipt).success, false);
});
