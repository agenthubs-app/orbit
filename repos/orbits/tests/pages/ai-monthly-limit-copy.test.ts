import assert from "node:assert/strict";
import test from "node:test";

import { aiMonthlyLimitText, cardScanPartialText, quotaNoticeText } from "../../app/(app)/app/orbit-2026/copy/ai-monthly-limit";
import { overLimitContext, overLimitNotice } from "../../features/ai-quota/over-limit";

const DEC_1 = "2026-11-30T15:00:00.000Z";

test("the Web notice writes the public number, the reset date and (free) the Pro limit from the 429's quota fields, in three languages, plainly", () => {
  const drafts = overLimitContext(overLimitNotice({ feature: "draft_assist", period: "month", retryOn: DEC_1, tier: "free" }));
  assert.equal(aiMonthlyLimitText("zh", drafts), "这个月的 60 次已用完，12月1日恢复。已有的内容照常可以查看。");
  assert.equal(aiMonthlyLimitText("ja", drafts), "今月の60回を使い切りました。12月1日に戻ります。これまでの内容はいつもどおりご覧いただけます。");
  assert.equal(aiMonthlyLimitText("en", drafts), "This month's 60 uses are used up. They come back on December 1. Everything you already have can still be viewed as usual.");
  const scans = overLimitContext(overLimitNotice({ feature: "card_scan", period: "month", retryOn: DEC_1, tier: "free" }));
  assert.equal(quotaNoticeText("zh", { ...scans, reason: "CARD_SCAN_MONTHLY_LIMIT" }), "这个月的 30 张已用完，12月1日恢复。升级到 Pro 每月可扫 300 张。");
  assert.equal(cardScanPartialText("zh", 3, scans), "其中 3 张没有受理。这个月的 30 张已用完，12月1日恢复。升级到 Pro 每月可扫 300 张。");
  assert.equal(cardScanPartialText("en", 1, scans), "1 of them was not accepted. This month's 30 card scans are used up. They come back on December 1. Pro allows 300 card scans a month.");
  // An older server without the fields still gets a plain line; a context that is not a notice gives null.
  assert.equal(aiMonthlyLimitText("zh"), "这个月的次数已用完，下个月 1 日恢复。已有的内容照常可以查看。");
  assert.equal(quotaNoticeText("zh", { reason: "MANUAL_REFRESH_LIMIT" }), null);
  for (const language of ["zh", "ja", "en"] as const) assert.doesNotMatch(aiMonthlyLimitText(language, scans), /[!！]/u);
});
