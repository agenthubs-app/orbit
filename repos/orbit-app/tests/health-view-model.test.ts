import assert from "node:assert/strict";
import test from "node:test";
import { healthPayloadToSummary } from "../src/view-models/health";

test("healthPayloadToSummary maps ok health payloads without runtime labels", () => {
  const summary = healthPayloadToSummary({
    boundary: {
      mockToLive: "Switch providers through ORBIT_MODULE_MODE."
    },
    mode: "mock",
    service: "orbit-runtime",
    status: "ok"
  });

  assert.deepEqual(summary, {
    detail: "orbit-runtime responded successfully.",
    title: "Server reachable"
  });
});

test("healthPayloadToSummary maps unknown payloads safely", () => {
  assert.deepEqual(healthPayloadToSummary({}), {
    detail: "Health details are unavailable.",
    title: "Server responded"
  });
});
