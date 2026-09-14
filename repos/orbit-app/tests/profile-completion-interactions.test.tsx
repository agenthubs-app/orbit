import assert from "node:assert/strict";
import test from "node:test";
import { profileDetailSchema, profileSaveReceiptSchema } from "../src/api/profile-detail-contract";
import { profilePayload } from "./helpers/profile-detail-fixtures";

const onboarding = { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] };
const request = { displayName: "程川", expectedUpdatedAt: "2026-09-12T00:00:00Z", mutationId: "profile-test-save" };
const receipt = {
  ...profilePayload, onboarding, mutationId: request.mutationId,
  profile: { ...profilePayload.profile, updatedAt: "2026-09-12T00:00:01Z" },
  editor: { ...profilePayload.editor, lastSavedAt: "2026-09-12T00:00:01Z" },
};

test("profile completion receipt accepts concurrency metadata outside the private profile", () => {
  assert.equal(profileSaveReceiptSchema("profile:1", request).safeParse(receipt).success, true);
});

for (const invalid of [
  { ...onboarding, policyVersion: 2 },
  { ...onboarding, status: "complete" },
  { ...onboarding, missingFields: [] },
  { ...onboarding, missingFields: ["birthDate", "birthDate"] },
  { ...onboarding, missingFields: ["organization"] },
]) test("profile completion rejects an unusable server policy " + JSON.stringify(invalid), () => {
  assert.equal(profileDetailSchema.safeParse({ ...profilePayload, onboarding: invalid }).success, false);
});

test("profile completion never treats a misplaced mutation ID as a save acknowledgment", () => {
  const misplaced = { ...receipt, mutationId: undefined, profile: { ...receipt.profile, ...request } };
  assert.equal(profileSaveReceiptSchema("profile:1", request).safeParse(misplaced).success, false);
});

test("profile completion receipt rejects absent policy, wrong mutation and nonadvancing version", () => {
  for (const invalid of [
    { ...receipt, onboarding: undefined },
    { ...receipt, mutationId: "another-save" },
    { ...receipt, profile: { ...receipt.profile, updatedAt: request.expectedUpdatedAt }, editor: profilePayload.editor },
  ]) assert.equal(profileSaveReceiptSchema("profile:1", request).safeParse(invalid).success, false);
});

test("private profile dates are calendar strings and invalid days fail response validation", () => {
  const valid = profileDetailSchema.safeParse({ ...profilePayload, profile: { ...profilePayload.profile, birthDate: "2000-02-29" } });
  assert.equal(valid.success, true);
  if (valid.success) assert.equal(valid.data.profile?.birthDate, "2000-02-29");
  for (const birthDate of ["2001-02-29", "2000-02-29T00:00:00Z", 20000229]) {
    assert.equal(profileDetailSchema.safeParse({ ...profilePayload, profile: { ...profilePayload.profile, birthDate } }).success, false);
  }
});
