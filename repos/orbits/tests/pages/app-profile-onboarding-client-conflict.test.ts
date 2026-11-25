import assert from "node:assert/strict";
import test from "node:test";

import { OnboardingRequestError, saveProfileFields, scanOwnBusinessCard } from "../../app/(app)/app/orbit-2026/onboarding/onboarding-client";

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

test("own card scan: printed wechat / LINE / website come back for the profile handles", async () => {
  const originalFetch = globalThis.fetch;
  const scan = (structuredExtraction: unknown) => {
    globalThis.fetch = async () => new Response(JSON.stringify({ data: { draft: { displayName: "王 磊", email: "a@example.com", organization: "X", phone: "", role: "顧問" }, ocr: { structuredExtraction } }, success: true }), { headers: { "content-type": "application/json" } });
    return scanOwnBusinessCard(new File(["x"], "card.png", { type: "image/png" }));
  };
  try {
    assert.deepEqual((await scan({ contactPoints: [{ label: null, type: "mobile", value: "080" }, { label: "微信", type: "wechat", value: " wang_lei " }, { label: null, type: "line", value: "wl" }], website: "https://example.com" })).handles, { lineId: "wl", website: "https://example.com", wechatId: "wang_lei" });
    assert.deepEqual((await scan({ contactPoints: [{ label: null, type: "website", value: "example.com" }], website: null })).handles, { website: "example.com" });
    assert.deepEqual((await scan({})).handles, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
});
