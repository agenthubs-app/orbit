import assert from "node:assert/strict";
import { test } from "node:test";

import { accountAuthEmailError, accountAuthPasswordError, signedInHref } from "../src/view-models/account-auth";

test("registration and login enforce the server's UTF-8 password limit", () => {
  assert.equal(accountAuthPasswordError("short"), "too-short");
  assert.equal(accountAuthPasswordError("abcdefgh"), null);
  assert.equal(accountAuthPasswordError("a".repeat(72)), null);
  assert.equal(accountAuthPasswordError("a".repeat(73)), "too-long");
  assert.equal(accountAuthPasswordError("界".repeat(25)), "too-long");
});

test("signup checks the email with Web's rule, on the trimmed address", () => {
  for (const ok of ["a@b.co", "  cheng.chuan@example.test  "]) assert.equal(accountAuthEmailError(ok), null, ok);
  for (const bad of ["", "   ", "name", "name@host", "name @host.test", "a@@b.co", "@b.co", "a@b."]) assert.equal(accountAuthEmailError(bad), "invalid", bad);
});

test("a completed sign-in opens onboarding with next, and an account being deleted its own page", () => {
  assert.equal(signedInHref({ next: "/home" }), "/profile/onboarding?next=%2Fhome");
  assert.equal(signedInHref({ next: "/events/event-1" }), "/profile/onboarding?next=%2Fevents%2Fevent-1");
  assert.equal(signedInHref({ next: "https://untrusted.test" }), "/profile/onboarding?next=%2Fhome");
  assert.equal(signedInHref({ next: "/home", pendingDeletion: true }), "/account/pending");
});
