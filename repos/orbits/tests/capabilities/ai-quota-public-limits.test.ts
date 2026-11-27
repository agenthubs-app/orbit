/**
 * 对外额度清单（features/ai-quota/public-limits.ts）与拦截用的常量是同一个来源：每道日上限 / 月上限都在清单里、数值相同，
 * 清单里没有常量之外的数字；文案三语齐全、不带感叹号。
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as constants from "../../features/ai-quota/constants";
import { AI_QUOTA_PUBLIC_LIMITS, PUBLIC_LIMIT_UNIT_LABELS, publicLimit } from "../../features/ai-quota/public-limits";
import { ACCOUNT_TIERS, TIER_LIMITS, tierLimit } from "../../features/ai-quota/tiers";

const valueOf = (id: string) => publicLimit(id)?.limit;

test("every daily and monthly limit the ledger enforces is in the public list with the same value", () => {
  const named: [string, number][] = [
    ["agent_chat.day", constants.AGENT_CHAT_DAILY_LIMIT],
    ["user_pool.day", constants.USER_POOL_DAILY_LIMIT],
    ["manual_reanalysis.day", constants.MANUAL_REANALYSIS_DAILY_LIMIT],
    ["manual_reanalysis.month", constants.MANUAL_REANALYSIS_MONTHLY_LIMIT],
    ["instant_insight.day", constants.INSTANT_INSIGHT_DAILY_LIMIT],
    ["instant_insight.month", constants.INSTANT_INSIGHT_MONTHLY_LIMIT],
    ["background_insight.month", constants.BACKGROUND_INSIGHT_MONTHLY_LIMIT],
    ["background_pool.day", constants.BACKGROUND_POOL_DAILY_LIMIT],
    ["plan_flow.day", constants.PLAN_FLOW_DAILY_LIMIT],
    ["event_assessment.day", constants.EVENT_ASSESSMENT_DAILY_LIMIT],
    ["plan_search.plan", constants.PLAN_SEARCH_PER_PLAN_LIMIT],
    ["plan_prep.plan", constants.PLAN_PREP_INITIAL_CARDS_LIMIT],
  ];
  for (const [id, value] of named) assert.equal(valueOf(id), value, id);
  for (const [purpose, value] of Object.entries(constants.AI_QUOTA_MONTHLY_LIMITS)) assert.equal(valueOf(`${purpose}.month`), value, `${purpose}.month`);
  for (const [purpose, value] of Object.entries(constants.AI_QUOTA_DAILY_PURPOSE_LIMITS)) assert.equal(valueOf(`${purpose}.day`), value, `${purpose}.day`);
  // Every monthly fuse is listed (the list's fuse entries are exactly the fuse table).
  const fuseIds: Record<string, string> = { "background:insight:": "background_insight.month", "user:insight:auto": "instant_insight.month", "user:snapshot:manual": "manual_reanalysis.month" };
  assert.equal(constants.AI_QUOTA_MONTHLY_FUSES.length, Object.keys(fuseIds).length, "a new fuse needs its public entry");
  for (const fuse of constants.AI_QUOTA_MONTHLY_FUSES) assert.equal(valueOf(fuseIds[`${fuse.pool}:${fuse.purpose}:${fuse.trigger ?? ""}`]!), fuse.limit);
  // The tiered monthly limits: one row per tier, each the tier table's value.
  const tiered = ["agent_chat", "card_scan", "plan_new_goal"] as const;
  for (const feature of tiered) for (const tier of ACCOUNT_TIERS) assert.equal(valueOf(`${feature}.month.${tier}`), tierLimit(tier, feature, "month"), `${feature}.month.${tier}`);
  // Nothing in the list that is not one of the above.
  assert.equal(AI_QUOTA_PUBLIC_LIMITS.length, named.length + tiered.length * ACCOUNT_TIERS.length + Object.keys(constants.AI_QUOTA_MONTHLY_LIMITS).length + Object.keys(constants.AI_QUOTA_DAILY_PURPOSE_LIMITS).length);
  assert.equal(new Set(AI_QUOTA_PUBLIC_LIMITS.map((item) => item.id)).size, AI_QUOTA_PUBLIC_LIMITS.length, "ids are unique");
});

test("every entry names its feature and unit in three languages, plainly", () => {
  for (const item of AI_QUOTA_PUBLIC_LIMITS) {
    assert.ok(Number.isInteger(item.limit) && item.limit > 0, item.id);
    for (const text of [item.feature, PUBLIC_LIMIT_UNIT_LABELS[item.unit]]) {
      for (const language of ["zh", "ja", "en"] as const) {
        assert.ok(text[language]?.trim(), `${item.id} ${language}`);
        assert.doesNotMatch(text[language], /[!！]/u);
      }
    }
  }
});

test("one source: the constants the ledger enforces are the tier table's values (the user's 2026-11-27 table)", () => {
  assert.deepEqual(TIER_LIMITS.free.agent_chat, { day: 100, month: 100 });
  assert.deepEqual(TIER_LIMITS.pro.agent_chat, { day: 100, month: 1000 });
  assert.deepEqual([TIER_LIMITS.free.card_scan.month, TIER_LIMITS.pro.card_scan.month], [30, 300]);
  assert.deepEqual([TIER_LIMITS.free.plan_new_goal.month, TIER_LIMITS.pro.plan_new_goal.month], [1, 10]);
  for (const tier of ACCOUNT_TIERS) {
    const limits = TIER_LIMITS[tier];
    assert.equal(constants.AGENT_CHAT_DAILY_LIMIT, limits.agent_chat.day);
    assert.equal(constants.AI_QUOTA_MONTHLY_LIMITS.plan_revise, limits.plan_revise.month);
    assert.equal(constants.AI_QUOTA_MONTHLY_LIMITS.plan_review, limits.plan_review.month);
    assert.deepEqual([constants.EVENT_ASSESSMENT_DAILY_LIMIT, constants.AI_QUOTA_MONTHLY_LIMITS.event_assessment], [limits.event_assessment.day, limits.event_assessment.month]);
    assert.deepEqual([constants.MANUAL_REANALYSIS_DAILY_LIMIT, constants.MANUAL_REANALYSIS_MONTHLY_LIMIT], [limits.manual_reanalysis.day, limits.manual_reanalysis.month]);
    assert.deepEqual([constants.INSTANT_INSIGHT_DAILY_LIMIT, constants.INSTANT_INSIGHT_MONTHLY_LIMIT], [limits.instant_insight.day, limits.instant_insight.month]);
    assert.equal(constants.BACKGROUND_INSIGHT_MONTHLY_LIMIT, limits.background_insight.month);
    assert.equal(constants.AI_QUOTA_MONTHLY_LIMITS.memo_extraction, limits.memo_extraction.month);
    assert.equal(constants.AI_QUOTA_MONTHLY_LIMITS.draft_assist, limits.draft_assist.month);
  }
});
