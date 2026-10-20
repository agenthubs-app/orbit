import assert from "node:assert/strict";
import test from "node:test";

import { appendWebGuideReturnTo, webGuideReturnTo } from "../../features/guide/return-to";

test("card scan and import only carry the Web start guide and onboarding screen 5 return targets", () => {
  assert.equal(webGuideReturnTo("/app/start"), "/app/start");
  assert.equal(webGuideReturnTo("/app/profile/onboarding?screen=5"), "/app/profile/onboarding?screen=5");
  for (const value of ["//evil.test", "https://evil.test", "/app/start/other", "/app/home", "/start", "/app/start?step=3", "/app/profile/onboarding", "/app/profile/onboarding?screen=4", "/app/profile/onboarding?screen=5&next=%2Fapp%2Fhome", undefined]) assert.equal(webGuideReturnTo(value), null);
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/scan/b1", "/app/start"), "/app/contacts/new/scan/b1?returnTo=%2Fapp%2Fstart");
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/import/b1?step=review", "/app/start"), "/app/contacts/new/import/b1?step=review&returnTo=%2Fapp%2Fstart");
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/import/b1?step=review", "/app/profile/onboarding?screen=5"), "/app/contacts/new/import/b1?step=review&returnTo=%2Fapp%2Fprofile%2Fonboarding%3Fscreen%3D5");
  assert.equal(appendWebGuideReturnTo("/app/contacts/new/scan", "//evil.test"), "/app/contacts/new/scan");
});
