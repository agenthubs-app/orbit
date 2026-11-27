/**
 * 超额提示（features/ai-quota/over-limit.ts，2026-11-27 分档）：数字、恢复时间、能否升级都来自档位表；三语、朴素、无感叹号；
 * free 且 Pro 更高时引导升级，pro 或两档相同只说恢复时间；机器字段能写进 context 再读回。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { overLimitContext, overLimitNotice, overLimitNoticeOf, overLimitText } from "../../features/ai-quota/over-limit";
import { TIER_LIMITS } from "../../features/ai-quota/tiers";

const DEC_1 = "2026-11-30T15:00:00.000Z";

test("free card scans: the user's sample line, numbered from the tier table, with the upgrade", () => {
  const notice = overLimitNotice({ feature: "card_scan", period: "month", retryOn: DEC_1, tier: "free" });
  assert.deepEqual([notice.limit, notice.used, notice.upgradable, notice.upgradeLimit], [TIER_LIMITS.free.card_scan.month, TIER_LIMITS.free.card_scan.month, true, TIER_LIMITS.pro.card_scan.month]);
  assert.equal(overLimitText("zh", notice), "这个月的 30 张已用完，12月1日恢复。升级到 Pro 每月可扫 300 张。");
  assert.equal(overLimitText("ja", notice), "今月の30枚を使い切りました。12月1日に戻ります。Pro にすると毎月300枚までスキャンできます。");
  assert.equal(overLimitText("en", notice), "This month's 30 card scans are used up. They come back on December 1. Pro allows 300 card scans a month.");
});

test("pro, or a limit both tiers share: only when it comes back, never an upgrade", () => {
  const pro = overLimitNotice({ feature: "card_scan", period: "month", retryOn: DEC_1, tier: "pro" });
  assert.equal(pro.upgradable, false);
  assert.equal(overLimitText("zh", pro), "这个月的 300 张已用完，12月1日恢复。已有的内容照常可以查看。");
  const daily = overLimitNotice({ feature: "agent_chat", period: "day", tier: "free" });
  assert.equal(daily.upgradable, false, "the daily 100 is the same for both tiers");
  assert.equal(overLimitText("zh", daily), "今天的 100 轮对话已用完，明天恢复。已有的内容照常可以查看。");
  const chat = overLimitNotice({ feature: "agent_chat", period: "month", retryOn: DEC_1, tier: "free" });
  assert.equal(overLimitText("zh", chat), "这个月的 100 轮对话已用完，12月1日恢复。升级到 Pro 每月可对话 1,000 轮。");
  const plan = overLimitNotice({ feature: "plan_new_goal", period: "month", retryOn: DEC_1, tier: "free" });
  assert.equal(overLimitText("en", plan), "This month's 1 new plan is used up. It comes back on December 1. Pro allows 10 new plans a month.");
  assert.equal(overLimitText("ja", plan), "今月の新しい計画1件を使い切りました。12月1日に戻ります。Pro にすると毎月10件まで新しい計画をつくれます。");
});

test("the machine-readable fields round-trip through error.context; the lines are plain", () => {
  const notice = overLimitNotice({ feature: "plan_new_goal", period: "month", retryOn: DEC_1, tier: "free", used: 1 });
  const context = overLimitContext(notice);
  for (const value of Object.values(context)) assert.equal(typeof value, "string");
  assert.deepEqual(overLimitNoticeOf({ ...context, limit: "monthly", reason: "GOAL_MONTHLY_LIMIT" }), notice, "the plan API's own `limit` key does not collide");
  assert.equal(overLimitNoticeOf({ limit: "monthly" }), null);
  for (const feature of ["agent_chat", "card_scan", "plan_new_goal", "draft_assist", "manual_reanalysis"] as const) {
    for (const tier of ["free", "pro"] as const) {
      for (const language of ["zh", "ja", "en"] as const) assert.doesNotMatch(overLimitText(language, overLimitNotice({ feature, period: "month", retryOn: DEC_1, tier })), /[!！]/u);
    }
  }
});
