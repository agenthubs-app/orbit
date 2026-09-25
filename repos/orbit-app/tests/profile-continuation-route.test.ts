import assert from "node:assert/strict";
import test from "node:test";

import {
  profileContinuationHref,
  safeProfileContinuationNext
} from "../src/view-models/profile-continuation-route";

test("profile continuation preserves an allowlisted internal destination", () => {
  assert.equal(
    safeProfileContinuationNext("/events/event-1?tab=details#agenda"),
    "/events/event-1?tab=details#agenda"
  );
  assert.equal(
    profileContinuationHref("/events/event-1?tab=details"),
    "/profile?complete=1&next=%2Fevents%2Fevent-1%3Ftab%3Ddetails"
  );
});

test("profile continuation uses the first route parameter value", () => {
  assert.equal(
    profileContinuationHref(["/events/first", "/events/second"]),
    "/profile?complete=1&next=%2Fevents%2Ffirst"
  );
});

test("profile continuation rejects external, unknown and authentication destinations", () => {
  for (const next of [
    "https://untrusted.test/path",
    "//untrusted.test/path",
    "/not-a-native-route",
    "/account/login?next=%2Fhome",
    "/account/signup",
    "/account/reset-password#token=secret",
    "/login-admin"
  ]) {
    assert.equal(safeProfileContinuationNext(next), "/home", next);
  }
});

test("profile continuation rejects direct, nested, and recursive profile cycles", () => {
  for (const next of [
    "/profile",
    "/profile/continue?next=%2Fhome",
    "/app/profile?complete=1&next=%2Fprofile%2Fcontinue",
    "/events/event-1?next=%2Fprofile%2Fcontinue",
    "/events/event-1?next=%2Fprofile%3Fcomplete%3D1%26next%3D%252Fevents%252Fevent-1",
    "/home?next=%2Fevents%2Fevent-1%3Fnext%3D%252Fprofile%252Fcontinue",
    "/events/event-1?next=https%3A%2F%2Funtrusted.test"
  ]) {
    assert.equal(safeProfileContinuationNext(next), "/home", next);
  }
});
