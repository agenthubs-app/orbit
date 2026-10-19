import assert from "node:assert/strict";
import { test } from "node:test";

import { accountAuthPasswordError } from "../src/view-models/account-auth";

test("registration and login enforce the server's UTF-8 password limit", () => {
  assert.equal(accountAuthPasswordError("short"), "too-short");
  assert.equal(accountAuthPasswordError("abcdefgh"), null);
  assert.equal(accountAuthPasswordError("a".repeat(72)), null);
  assert.equal(accountAuthPasswordError("a".repeat(73)), "too-long");
  assert.equal(accountAuthPasswordError("界".repeat(25)), "too-long");
});
