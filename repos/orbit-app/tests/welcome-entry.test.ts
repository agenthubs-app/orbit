import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveWelcomeEntry } from "../src/screens/public/welcome-entry";

test("a new signed-out launch shows welcome only after session resolution", () => {
  assert.equal(resolveWelcomeEntry({ ready: false, userId: null }), "pending");
  assert.equal(resolveWelcomeEntry({ ready: true, userId: null }), "welcome");
  assert.equal(resolveWelcomeEntry({ ready: true, userId: "member" }), "/home");
  assert.equal(resolveWelcomeEntry({ ready: true, userId: "member", deletionPending: true }), "/account/pending");
});

test("an explicit supported initial target bypasses welcome", () => {
  assert.equal(resolveWelcomeEntry({ ready: true, userId: null, configuredRoute: "/account/reset-password#token=redacted" }), "/account/reset-password#token=redacted");
  assert.equal(resolveWelcomeEntry({ ready: true, userId: null, configuredRoute: "/i/K7QX-2M9P" }), "/i/K7QX-2M9P");
});
