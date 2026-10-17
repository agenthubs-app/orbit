import assert from "node:assert/strict";
import test from "node:test";
test("R18a preserves confirmed onboarding redirect and never substitutes the legacy/card score", async () => {
  const module = await import("../src/screens/me/account-response").catch(() => null); assert.ok(module);
  assert.equal(module.accountCompletionDestination({ completeness: { score: 100 } }, "/events/e1", false), null);
  assert.equal(module.accountCompletionDestination({ onboarding: { policyVersion: 1, status: "incomplete", missingFields: ["birthDate"] } }, "/events/e1", false), null);
  const confirmed = { onboarding: { policyVersion: 1, status: "complete", missingFields: [] } };
  assert.equal(module.accountCompletionDestination(confirmed, "/events/e1", false), "/events/e1");
  assert.equal(module.accountCompletionDestination(confirmed, "/events/e1", true), null);
});
