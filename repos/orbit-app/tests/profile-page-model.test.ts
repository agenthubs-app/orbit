import assert from "node:assert/strict";
import test from "node:test";

import type { ManualProfileContract } from "../src/api/contract/profile";
import { openProfileEditSession, resetProfileEditSessionsForTests, updateProfileEditDraft } from "../src/data/profile-edit-session";
import { profilePreviewFromSession, profileSeekingCandidates } from "../src/screens/profile/profile-page-model";

const profile: ManualProfileContract = {
  id: "profile:one",
  birthDate: "1990-05-01",
  displayName: "程川",
  headline: "产品经理",
  organization: "星野",
  role: "产品负责人",
  homeMarket: "东京",
  relationshipGoal: "设计合作",
  targetRelationshipTypes: ["创业伙伴", "设计合作"],
  preferredFollowUpWindow: "本周",
  preferredLanguage: "zh",
  preferredIntroChannels: ["email"],
  handles: { email: "private@example.test" },
  bio: "旧简介",
  seeking: ["技术交流"],
  topics: ["用户研究", "技术交流"],
  updatedAt: "2026-09-15T00:00:00.000Z",
};

test.beforeEach(() => resetProfileEditSessionsForTests());

test("legacy seeking fields become stable candidates without changing the saved selection", () => {
  assert.deepEqual(profileSeekingCandidates(profile), ["技术交流", "设计合作", "创业伙伴", "用户研究"]);
  const session = openProfileEditSession({ actorId: "actor:one", apiOrigin: "https://orbit.example" }, profile);
  assert.deepEqual(session.draft.seeking, ["技术交流"]);
});

test("preview projects the unsaved draft and excludes private fields", () => {
  const scope = { actorId: "actor:one", apiOrigin: "https://orbit.example" };
  openProfileEditSession(scope, profile);
  const session = updateProfileEditDraft(scope, {
    bio: "未保存的新简介",
    offering: ["产品研究"],
    relationshipGoal: "未保存的公开目标",
    targetRelationshipTypes: ["未保存的目标类型"],
  });
  assert.ok(session);
  const preview = profilePreviewFromSession(session, profile);
  assert.equal(preview.bio, "未保存的新简介");
  assert.deepEqual(preview.offering, ["产品研究"]);
  assert.equal(preview.relationshipGoal, "未保存的公开目标");
  assert.deepEqual(preview.targetRelationshipTypes, ["未保存的目标类型"]);
  const serialized = JSON.stringify(preview);
  for (const marker of ["1990-05-01", "本周", "private@example.test"]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
});
