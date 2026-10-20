import assert from "node:assert/strict";
import test from "node:test";

import { appGuideReturnTo, appendAppGuideReturnTo } from "../src/view-models/guide-return-to";

test("App card routes accept only the start guide and onboarding screen 5 return targets", () => {
  assert.equal(appGuideReturnTo("/start"), "/start");
  assert.equal(appGuideReturnTo("/profile/onboarding?screen=5"), "/profile/onboarding?screen=5");
  for (const value of ["//evil.test", "https://evil.test", "/app/start", "/home", "/start?step=2", "/profile/onboarding", "/profile/onboarding?screen=4", "/profile/onboarding?screen=5&next=%2Fhome", ["/start"], undefined]) assert.equal(appGuideReturnTo(value), null);
  assert.equal(appendAppGuideReturnTo("/contacts/new/scan/b1", "/start"), "/contacts/new/scan/b1?returnTo=%2Fstart");
  assert.equal(appendAppGuideReturnTo("/contacts/new/import/b1?excluded=2", "/start"), "/contacts/new/import/b1?excluded=2&returnTo=%2Fstart");
  assert.equal(appendAppGuideReturnTo("/contacts/new/import/b1?excluded=2", "/profile/onboarding?screen=5"), "/contacts/new/import/b1?excluded=2&returnTo=%2Fprofile%2Fonboarding%3Fscreen%3D5");
  assert.equal(appendAppGuideReturnTo("/contacts/new/scan", "//evil.test"), "/contacts/new/scan");
});
