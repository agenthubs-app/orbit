import assert from "node:assert/strict";
import test from "node:test";

import { OnboardingRequestError, saveProfileFields } from "../../app/(app)/app/profile/onboarding-0918/onboarding-client";

test("a stale onboarding save leaves another tab's confirmed profile untouched", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(init?.method ?? "GET");
    return new Response(JSON.stringify({
      success: false,
      error: { code: "PROFILE_VERSION_CONFLICT", message: "Profile version conflict" },
    }), { status: 409, headers: { "content-type": "application/json" } });
  };
  try {
    await assert.rejects(
      saveProfileFields({ relationshipGoal: "My new goal" }, "stale-revision"),
      (error: unknown) => error instanceof OnboardingRequestError && error.code === "PROFILE_VERSION_CONFLICT",
    );
    assert.deepEqual(calls, ["PUT"], "the stale draft must not be resent over a newer profile");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
