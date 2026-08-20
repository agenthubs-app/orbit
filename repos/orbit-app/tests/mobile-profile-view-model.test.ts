import assert from "node:assert/strict";
import test from "node:test";

import { profileSummaryForMobileUser } from "../src/view-models/mobile-profile";
import type { ProfileSummary } from "../src/view-models/profile";

const generatedProfile: ProfileSummary = {
  bio: "",
  displayName: "agenthubs",
  headline: "Orbit Generated Relationship Workspace",
  industry: "",
  offering: [],
  organization: "",
  relationshipGoal: "",
  role: "",
  seeking: [],
  timezone: "Asia/Tokyo",
  topics: []
};

test("the canonical agenthubs account renders Xiaoyu's Chinese founder profile", () => {
  const profile = profileSummaryForMobileUser(generatedProfile, {
    email: "agenthubs@example.com",
    id: "user_mry5y200_58jpi8",
    name: "agenthubs"
  });

  assert.equal(profile.displayName, "小雨");
  assert.equal(profile.organization, "Orbit");
  assert.equal(profile.role, "创始人");
  assert.match(profile.headline, /Orbit 创始人/u);
  assert.match(profile.bio, /AI/u);
  assert.ok(profile.offering.includes("业务流程自动化与降本增效"));
  assert.ok(profile.seeking.length >= 2);
  assert.ok(profile.relationshipGoal.length > 0);
});

test("other signed-in users keep their own profile content", () => {
  const profile = profileSummaryForMobileUser(generatedProfile, {
    email: "misaki@example.com",
    id: "user_misaki",
    name: "田中美咲"
  });

  assert.equal(profile.displayName, "田中美咲");
  assert.equal(profile.headline, generatedProfile.headline);
  assert.deepEqual(profile.offering, []);
});
