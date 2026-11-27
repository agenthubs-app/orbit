import assert from "node:assert/strict";
import test from "node:test";

import { aiLimitDetailOf, aiLimitParams } from "../src/api/ai-limit";

test("the over-limit notice takes its number, reset date and Pro count from the server's quota fields (public limits)", () => {
  const context = { quotaFeature: "card_scan", quotaLimit: "30", quotaPeriod: "month", quotaRetryOn: "2026-11-30T15:00:00.000Z", quotaTier: "free", quotaUpgradable: "true", quotaUpgradeLimit: "300", quotaUsed: "30", reason: "CARD_SCAN_MONTHLY_LIMIT", retryOn: "2026-11-30T15:00:00.000Z" };
  const detail = aiLimitDetailOf(context);
  assert.deepEqual(detail, { limit: 30, retryOn: "2026-11-30T15:00:00.000Z", upgradeLimit: 300 });
  assert.deepEqual(aiLimitParams(detail, "zh"), { count: "30", date: "12月1日", upgrade: "300" });
  assert.deepEqual(aiLimitParams(detail, "ja"), { count: "30", date: "12月1日", upgrade: "300" });
  assert.deepEqual(aiLimitParams(detail, "en"), { count: "30", date: "December 1", upgrade: "300" });
  assert.equal(aiLimitDetailOf({ ...context, quotaTier: "pro", quotaUpgradable: "false" }).upgradeLimit, null, "pro: no upgrade line");
  assert.deepEqual(aiLimitParams(aiLimitDetailOf({ quotaLimit: "1000" }), "en", new Date("2026-12-31T16:00:00.000Z")), { count: "1,000", date: "February 1", upgrade: "" });
});
