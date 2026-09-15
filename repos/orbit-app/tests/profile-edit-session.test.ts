import assert from "node:assert/strict";
import test from "node:test";

import type { ManualProfileContract } from "../src/api/contract/profile";
import {
  applyProfileSuggestionToDraft,
  clearProfileEditSession,
  completeProfileEditSave,
  getProfileEditSession,
  normalizeProfileTagValues,
  openProfileEditSession,
  prepareProfileEditSave,
  profileSuggestionDecisionMutationId,
  recordProfileEditSaveFailure,
  recordProfileSuggestionDecision,
  resetProfileEditSessionsForTests,
  updateProfileEditDraft,
  validateProfileEditDraft,
} from "../src/data/profile-edit-session";

const profile: ManualProfileContract = {
  id: "profile:one",
  birthDate: "1990-05-01",
  displayName: "程川",
  headline: "产品经理 · 星野工作室",
  organization: "星野工作室",
  role: "产品经理",
  homeMarket: "东京 · 日本",
  relationshipGoal: "认识可以一起做产品的同行",
  targetRelationshipTypes: ["产品伙伴"],
  preferredFollowUpWindow: "本周",
  preferredLanguage: "zh",
  preferredIntroChannels: ["email"],
  handles: { linkedinUrl: "https://linkedin.example/cheng", xHandle: "@cheng" },
  primaryIndustryId: "technology_internet",
  industry: "互联网",
  offering: ["产品研究"],
  seeking: ["设计合作"],
  topics: ["用户研究"],
  spokenLanguages: ["中文"],
  updatedAt: "2026-09-12T00:00:00.000Z",
};

const scope = { actorId: "actor:one", apiOrigin: "https://orbit.example/" };

test.beforeEach(() => resetProfileEditSessionsForTests());

test("draft survives route remounts and stays isolated by canonical actor and API origin", () => {
  const initial = openProfileEditSession(scope, profile);
  assert.equal(initial.draft.bio, profile.headline);
  assert.equal(initial.bioUsesHeadlineFallback, true);

  updateProfileEditDraft(scope, { displayName: "程川（更新）", seeking: [] });
  const remounted = openProfileEditSession(scope, profile);
  assert.equal(remounted.draft.displayName, "程川（更新）");
  assert.deepEqual(remounted.draft.seeking, []);

  assert.equal(getProfileEditSession({ ...scope, actorId: "actor:two" }), null);
  assert.equal(getProfileEditSession({ ...scope, apiOrigin: "https://other.example" }), null);
});

test("headline fallback is display-only until bio is explicitly edited", () => {
  openProfileEditSession(scope, profile);
  const untouched = prepareProfileEditSave(scope, () => "first");
  assert.ok(untouched);
  assert.equal("bio" in untouched.body, false);

  updateProfileEditDraft(scope, { bio: "", seeking: [] });
  const cleared = prepareProfileEditSave(scope, () => "second");
  assert.ok(cleared);
  assert.equal(cleared.body.bio, "");
  assert.deepEqual(cleared.body.seeking, []);
});

test("suggestions only patch the local draft and retain their source decision", () => {
  openProfileEditSession(scope, profile);
  const session = applyProfileSuggestionToDraft(scope, {
    id: "suggestion:one",
    field: "offering",
    value: ["活动后引荐", "产品研究"],
  });

  assert.deepEqual(session?.draft.offering, ["活动后引荐", "产品研究"]);
  assert.equal(session?.suggestionDecisions["suggestion:one"], "accepted");
  assert.equal(session?.status, "editing");
});

test("unknown-result retries reuse the exact mutation and a changed intent gets a new one", () => {
  openProfileEditSession(scope, profile);
  updateProfileEditDraft(scope, { topics: ["产品设计", "用户研究"] });

  const first = prepareProfileEditSave(scope, () => "first");
  assert.ok(first);
  assert.equal(first.body.expectedUpdatedAt, profile.updatedAt);
  assert.equal(first.body.mutationId, "ios:profile:first");

  recordProfileEditSaveFailure(scope, first.body.mutationId, 503, "暂时无法保存");
  const retry = prepareProfileEditSave(scope, () => "second");
  assert.deepEqual(retry, first);
  assert.equal(getProfileEditSession(scope)?.status, "saving");

  recordProfileEditSaveFailure(scope, first.body.mutationId, 409, "资料已更新");
  assert.equal(getProfileEditSession(scope)?.status, "conflict");
  updateProfileEditDraft(scope, { role: "产品负责人" });
  const changed = prepareProfileEditSave(scope, () => "third");
  assert.ok(changed);
  assert.equal(changed.body.mutationId, "ios:profile:third");
  assert.equal(changed.body.expectedUpdatedAt, profile.updatedAt);
});

test("success clears only the matching session and explicit clear is scope-local", () => {
  const otherScope = { actorId: "actor:two", apiOrigin: scope.apiOrigin };
  openProfileEditSession(scope, profile);
  openProfileEditSession(otherScope, { ...profile, id: "profile:two", displayName: "林悦" });
  const attempt = prepareProfileEditSave(scope, () => "save");
  assert.ok(attempt);

  assert.equal(completeProfileEditSave(scope, attempt.body.mutationId), true);
  assert.equal(getProfileEditSession(scope), null);
  assert.equal(getProfileEditSession(otherScope)?.profileId, "profile:two");

  clearProfileEditSession(otherScope);
  assert.equal(getProfileEditSession(otherScope), null);
});

test("invalid or raw-looking empty scope values cannot create a session", () => {
  assert.throws(() => openProfileEditSession({ actorId: " ", apiOrigin: scope.apiOrigin }, profile));
  assert.throws(() => openProfileEditSession({ actorId: scope.actorId, apiOrigin: "" }, profile));
});

test("tag normalization is stable and validation counts visible bio characters", () => {
  assert.deepEqual(
    normalizeProfileTagValues([" AI ", "ＡＩ", "产品   研究", "产品 研究", ""]),
    ["AI", "产品 研究"],
  );
  openProfileEditSession(scope, profile);
  updateProfileEditDraft(scope, {
    bio: "👨‍👩‍👧‍👦".repeat(80),
    offering: ["一", "二", "三", "四", "五"],
  });
  assert.deepEqual(validateProfileEditDraft(getProfileEditSession(scope)!.draft), []);
  updateProfileEditDraft(scope, {
    bio: "👨‍👩‍👧‍👦".repeat(81),
    offering: ["一", "二", "三", "四", "五", "六"],
  });
  assert.deepEqual(validateProfileEditDraft(getProfileEditSession(scope)!.draft), ["bio", "offering"]);
});

test("suggestion decision retries reuse a mutation until the matching decision completes", () => {
  openProfileEditSession(scope, profile);
  const first = profileSuggestionDecisionMutationId(scope, "suggestion:one", "dismissed", () => "one");
  const retry = profileSuggestionDecisionMutationId(scope, "suggestion:one", "dismissed", () => "two");
  assert.equal(first, "ios:profile-suggestion:one");
  assert.equal(retry, first);
  recordProfileSuggestionDecision(scope, "suggestion:one", "dismissed", first);
  assert.equal(getProfileEditSession(scope)?.suggestionDecisions["suggestion:one"], "dismissed");
  assert.equal(profileSuggestionDecisionMutationId(scope, "suggestion:one", "accepted", () => "three"), "ios:profile-suggestion:three");
});
