/**
 * 2026-11-27：计划修改（30 次/月）与复盘（3 次/月）的上限是公开的——超限时返回超额提示字段，界面写出数字与恢复日期
 * （两档相同，不提升级）。数字来自 features/ai-quota/tiers.ts。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { AiQuotaGate } from "../../features/ai-quota/gate";
import { overLimitNoticeOf, overLimitText } from "../../features/ai-quota/over-limit";
import { TIER_LIMITS } from "../../features/ai-quota/tiers";
import { createDeepseekPlanFlowAi } from "../../features/plans/v2/ai/deepseek";
import { PLAN_REVIEW_MONTHLY_LIMIT } from "../../features/plans/v2/service";

const DEC_1 = "2026-11-30T15:00:00.000Z";
const refusing = (reply: Awaited<ReturnType<AiQuotaGate["reserve"]>>): AiQuotaGate => ({
  async beginCall() { throw new Error("unused"); },
  async endCall() { throw new Error("unused"); },
  async finish() { throw new Error("unused"); },
  async reserve() { return reply; },
});
const context = { actorId: "a", language: "zh" as const, ledgerKey: "k", now: new Date("2026-11-27T03:00:00.000Z") };
const chat = (async () => { throw new Error("no model call"); }) as never;

test("plan edits and reviews over their monthly limit: the refusal carries the public number and reset, no upgrade", async () => {
  for (const [method, feature, cap] of [["fix", "plan_revise", TIER_LIMITS.free.plan_revise.month], ["reviewFix", "plan_review", TIER_LIMITS.free.plan_review.month]] as const) {
    const ai = createDeepseekPlanFlowAi({ chat, ledger: refusing({ cap, limit: "monthly", ok: false, reason: "monthly_limit", retryOn: DEC_1 }), log: () => undefined, model: "m" });
    const outcome = await (ai[method] as (input: unknown, ctx: typeof context) => Promise<{ ok: boolean; quota?: Record<string, string> }>)({}, context);
    assert.equal(outcome.ok, false);
    const notice = overLimitNoticeOf(outcome.quota);
    assert.deepEqual(notice && [notice.feature, notice.limit, notice.upgradable], [feature, cap, false]);
    assert.equal(overLimitText("zh", notice!), `这个月的 ${cap} 次已用完，12月1日恢复。已有的内容照常可以查看。`);
  }
  // A daily refusal (the plan-flow 15) is not one of these public monthly lines.
  const daily = createDeepseekPlanFlowAi({ chat, ledger: refusing({ cap: 15, limit: "plan_flow", ok: false, reason: "daily_limit", retryOn: DEC_1 }), log: () => undefined, model: "m" });
  assert.equal(((await (daily.fix as (input: unknown, ctx: typeof context) => Promise<{ quota?: unknown }>)({}, context)).quota), undefined);
  assert.equal(PLAN_REVIEW_MONTHLY_LIMIT, TIER_LIMITS.free.plan_review.month, "the review count reads the tier table");
});
