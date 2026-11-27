import assert from "node:assert/strict";
import test from "node:test";

import { aiLimitDetailOf, aiLimitParams } from "../src/api/ai-limit";

test("the monthly-limit notice takes its number and reset date from the server's 429 context (public limits)", () => {
  const detail = aiLimitDetailOf({ limit: "60", retryOn: "2026-11-30T15:00:00.000Z", reason: "MONTHLY_LIMIT" });
  assert.deepEqual(detail, { limit: 60, retryOn: "2026-11-30T15:00:00.000Z" });
  assert.deepEqual(aiLimitParams(detail, "zh"), { count: "60", date: "12月1日" });
  assert.deepEqual(aiLimitParams(detail, "ja"), { count: "60", date: "12月1日" });
  assert.deepEqual(aiLimitParams(detail, "en"), { count: "60", date: "December 1" });
  // Without a reset time: the 1st of next month (Tokyo); a bad limit is not shown as a number.
  assert.deepEqual(aiLimitParams(aiLimitDetailOf({ limit: "x" }), "en", new Date("2026-12-31T16:00:00.000Z")), { count: "", date: "February 1" });
});
