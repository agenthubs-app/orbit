import assert from "node:assert/strict";
import test from "node:test";
import { createIntegrationOAuthState, verifyIntegrationOAuthState } from "../../features/integrations/oauth-state";

const input = { provider: "google_calendar" as const, actorId: "a", sessionBinding: "session", secret: "local-oauth-state-test", now: 1_000, nonce: "once" };

test("OAuth state signs only the calendar/settings return keys and defaults all other destinations to calendar", () => {
  for (const [returnTo, expected] of [
    ["settings", "settings"], ["calendar", "calendar"], [undefined, "calendar"], ["https://evil.test", "calendar"],
    ["//evil.test", "calendar"], ["/app/settings", "calendar"], ["constructor", "calendar"], ["toString", "calendar"],
  ] as const) {
    const state = createIntegrationOAuthState({ ...input, returnTo });
    const value = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
    assert.equal(value.returnTo, expected);
    assert.equal(verifyIntegrationOAuthState({ ...input, state, now: 2_000 }), true);
    const tampered = `${Buffer.from(JSON.stringify({ ...value, returnTo: expected === "settings" ? "calendar" : "settings" })).toString("base64url")}.${state.split(".")[1]}`;
    assert.equal(verifyIntegrationOAuthState({ ...input, state: tampered, now: 2_000 }), false);
  }
});
