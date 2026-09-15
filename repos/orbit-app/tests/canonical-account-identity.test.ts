import assert from "node:assert/strict";
import test from "node:test";

import { canonicalAccountIdentityFromPayload } from "../src/api/canonical-account-identity";

test("account/me keeps the raw login principal separate from the canonical account owner", () => {
  assert.deepEqual(canonicalAccountIdentityFromPayload({
    account: { id: "account_orbit_generated", displayName: "Orbit" },
    session: { status: "signed-in" },
    user: { id: "profile:generated" },
  }), {
    accountId: "account_orbit_generated",
    actorId: "account_orbit_generated",
  });
});

test("same-id accounts remain compatible", () => {
  assert.deepEqual(canonicalAccountIdentityFromPayload({
    account: { id: "user_same" },
    session: { status: "signed-in" },
  }), {
    accountId: "user_same",
    actorId: "user_same",
  });
});

test("account identity fails closed for missing, signed-out, or business-record owners", () => {
  assert.equal(canonicalAccountIdentityFromPayload({ account: null, session: { status: "signed-in" } }), null);
  assert.equal(canonicalAccountIdentityFromPayload({ account: { id: "account:one" }, session: { status: "signed-out" } }), null);
  assert.equal(canonicalAccountIdentityFromPayload({ account: { id: "  " }, session: { status: "signed-in" } }), null);
  assert.equal(canonicalAccountIdentityFromPayload({ tasks: [{ accountId: "account:guessed", ownerUserId: "account:guessed" }] }), null);
});
