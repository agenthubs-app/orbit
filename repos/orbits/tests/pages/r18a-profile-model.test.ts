import assert from "node:assert/strict";
import test from "node:test";

import { createAccountDesignFixtureStore } from "../../features/profile/design-fixtures/service";
import { cardProgress, previewForProfile, profileSaveInput } from "../../app/(app)/app/orbit-2026/account/profile-model";

test("card progress uses server card score, four items, and legacy score only as fallback", () => {
  const payload = createAccountDesignFixtureStore().read("actor", "50").data;
  const profile = payload.profile;
  assert.ok(profile);
  assert.deepEqual(cardProgress(payload.completeness), {
    score: 50, missing: ["seeking", "intro"], hasCard: true,
  });
  assert.deepEqual(cardProgress({ ...payload.completeness, card: undefined }), {
    score: payload.completeness.score, missing: [], hasCard: false,
  });
});

test("public preview filters hidden details without exposing private contact fields", () => {
  const profile = createAccountDesignFixtureStore().read("actor", "100").data.profile;
  assert.ok(profile);
  const hidden = previewForProfile({ ...profile, publicFields: { companyRole: false, offeringSeeking: false, intro: false } });
  assert.equal(hidden.organization, "");
  assert.equal(hidden.role, "");
  assert.equal(hidden.bio, undefined);
  assert.equal(hidden.offering, undefined);
  assert.equal(hidden.seeking, undefined);
  assert.ok(!("handles" in hidden));
});

test("profile save includes version and mutation id; visibility changes retain other profile fields", () => {
  const profile = createAccountDesignFixtureStore().read("actor", "100").data.profile;
  assert.ok(profile);
  assert.deepEqual(profileSaveInput(profile, { publicFields: { companyRole: false, offeringSeeking: true, intro: true } }, "r18a-test-id"), {
    publicFields: { companyRole: false, offeringSeeking: true, intro: true },
    expectedUpdatedAt: profile.updatedAt,
    mutationId: "r18a-test-id",
  });
});
