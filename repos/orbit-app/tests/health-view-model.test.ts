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
    detail: "Orbit 服务响应正常，可以继续使用。",
    title: "服务器可用"
  });
  assert.doesNotMatch(JSON.stringify(summary), /orbit-runtime|server/iu);
});

test("healthPayloadToSummary maps unknown payloads safely", () => {
  assert.deepEqual(healthPayloadToSummary({}), {
    detail: "服务器已经响应，但暂时无法读取健康详情。",
    title: "服务器已响应"
  });
});
