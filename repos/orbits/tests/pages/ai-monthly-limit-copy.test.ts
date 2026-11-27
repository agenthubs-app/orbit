import assert from "node:assert/strict";
import test from "node:test";

import { aiLimitDetailOf, aiMonthlyLimitText } from "../../app/(app)/app/orbit-2026/copy/ai-monthly-limit";

test("the monthly-limit notice writes the public number and the reset date from the 429 context, in three languages, plainly", () => {
  const detail = aiLimitDetailOf({ limit: "60", reason: "MONTHLY_LIMIT", retryOn: "2026-11-30T15:00:00.000Z" });
  assert.equal(aiMonthlyLimitText("zh", detail), "这个月的 60 次已用完，12月1日恢复。已有的内容照常可以查看。");
  assert.equal(aiMonthlyLimitText("ja", detail), "今月の60回を使い切りました。12月1日に戻ります。これまでの内容はいつもどおりご覧いただけます。");
  assert.equal(aiMonthlyLimitText("en", detail), "This month's 60 uses are used up. They come back on December 1. Everything you already have can still be viewed as usual.");
  // An older server without the context still gets a plain line.
  assert.equal(aiMonthlyLimitText("zh"), "这个月的次数已用完，下个月 1 日恢复。已有的内容照常可以查看。");
  for (const language of ["zh", "ja", "en"] as const) assert.doesNotMatch(aiMonthlyLimitText(language, detail), /[!！]/u);
});
