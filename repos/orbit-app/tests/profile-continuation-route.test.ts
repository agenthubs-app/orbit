import assert from "node:assert/strict";
import test from "node:test";

import {
  profileContinuationHref,
  safeProfileContinuationNext
} from "../src/view-models/profile-continuation-route";

test("profile continuation preserves an allowlisted internal destination", () => {
  assert.equal(safeProfileContinuationNext("/start"), "/start");
  assert.equal(profileContinuationHref("/start"), "/profile/onboarding?next=%2Fstart");
  assert.equal(
    safeProfileContinuationNext("/events/event-1?tab=details#agenda"),
    "/events/event-1?tab=details#agenda"
  );
  assert.equal(
    profileContinuationHref("/events/event-1?tab=details"),
    "/profile/onboarding?next=%2Fevents%2Fevent-1%3Ftab%3Ddetails"
  );
});

test("profile continuation uses the first route parameter value", () => {
  assert.equal(
    profileContinuationHref(["/events/first", "/events/second"]),
    "/profile/onboarding?next=%2Fevents%2Ffirst"
  );
});

test("profile continuation rejects external, unknown and authentication destinations", () => {
  for (const next of [
    "https://untrusted.test/path",
    "//untrusted.test/path",
    "/not-a-native-route",
    "/account/login",
    "/account/signup",
    "/account/reset-password#token=secret",
    "/login-admin"
  ]) {
    assert.equal(safeProfileContinuationNext(next), "/home", next);
  }
});

test("profile continuation unwraps the flow's own pages and never loops into them", () => {
  for (const [next, target] of [
    ["/profile", "/profile"],
    ["/profile/edit", "/profile/edit"],
    ["/profile/continue?next=%2Ftask", "/task"],
    ["/account/login?next=%2Fprofile%2Fonboarding%3Fnext%3D%252Fevents%252Fevent-1", "/events/event-1"],
    ["/app/profile?complete=1&next=%2Fevents%2Fevent-1", "/events/event-1"],
    ["/app/profile?complete=1&next=%2Fprofile%2Fcontinue", "/home"],
    ["/profile/onboarding?next=%2Fprofile%2Fonboarding", "/home"],
    ["/account/login?next=https%3A%2F%2Funtrusted.test", "/home"]
  ] as const) assert.equal(safeProfileContinuationNext(next), target, next);
});
