/**
 * 对外额度清单（features/ai-quota/public-limits.ts）与拦截用的常量是同一个来源：每道日上限 / 月上限都在清单里、数值相同，
 * 清单里没有常量之外的数字；文案三语齐全、不带感叹号。
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as constants from "../../features/ai-quota/constants";
import { AI_QUOTA_PUBLIC_LIMITS, PUBLIC_LIMIT_UNIT_LABELS, publicLimit } from "../../features/ai-quota/public-limits";

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
  // Nothing in the list that is not one of the above.
  assert.equal(AI_QUOTA_PUBLIC_LIMITS.length, named.length + Object.keys(constants.AI_QUOTA_MONTHLY_LIMITS).length + Object.keys(constants.AI_QUOTA_DAILY_PURPOSE_LIMITS).length);
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
