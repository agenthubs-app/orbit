/**
 * W0050 SC-01（规则层）：`planNeedCoverage` 全分支与只读投影 `toOpportunityPlanView`。
 * 口径（W50-1）：t = targetCount（1–5 整数，缺省／非法按 1），a = contact_links 人数（linked + established），
 * 总覆盖度 = Σmin(a,t) ÷ Σt 取整，超额不抵其他需求，无需求为 null。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { planNeedCoverage, planNeedTarget, toOpportunityPlanView } from "../../features/plans/coverage";

const link = (contactId: string) => ({ contactId });

test("planNeedCoverage: established and linked both count, an over-filled need never offsets another one", () => {
  const result = planNeedCoverage([
    { contactLinks: [link("a"), link("b")], criteria: { targetCount: 2 }, id: "n1" }, // a 一位 linked、一位 established：都算
    { contactLinks: [link("c"), link("d"), link("e")], criteria: null, id: "n2" }, // 缺省 1，超额 2 位
    { contactLinks: [], criteria: { targetCount: 3 }, id: "n3" },
  ]);
  // Σmin = 2 + 1 + 0 = 3；Σt = 2 + 1 + 3 = 6 → 50%
  assert.equal(result.percent, 50);
  assert.deepEqual(result.needs, [
    { have: 2, missing: 0, needId: "n1", target: 2 },
    { have: 3, missing: 0, needId: "n2", target: 1 },
    { have: 0, missing: 3, needId: "n3", target: 3 },
  ]);
});

test("planNeedCoverage: rounding, duplicate links and the no-need case", () => {
  assert.equal(planNeedCoverage([{ contactLinks: [link("a")], criteria: { targetCount: 3 }, id: "n" }]).percent, 33);
  assert.equal(planNeedCoverage([{ contactLinks: [link("a"), link("b")], criteria: { targetCount: 3 }, id: "n" }]).percent, 67);
  assert.equal(planNeedCoverage([{ contactLinks: [link("a"), link("a")], criteria: { targetCount: 2 }, id: "n" }]).needs[0]!.have, 1);
  assert.deepEqual(planNeedCoverage([]), { needs: [], percent: null });
});

test("planNeedTarget: only integers 1–5 count, everything else falls back to 1", () => {
  for (const [value, expected] of [[undefined, 1], [1, 1], [5, 5], [0, 1], [6, 1], [2.5, 1], [-1, 1]] as const) {
    assert.equal(planNeedTarget(value === undefined ? {} : { targetCount: value }), expected, String(value));
  }
  assert.equal(planNeedTarget(null), 1);
});

test("toOpportunityPlanView: needs with phase titles, linked contacts, plan-named events and this week's open actions", () => {
  const view = toOpportunityPlanView({
    items: [
      { contactLinks: [{ contactId: "c1" }, { contactId: "c2" }] as never, criteria: { description: null, primaryIndustryId: null, secondaryIndustryId: null, targetCount: 2, titleKeywords: [] }, id: "need", kind: "network_need", linkedEventId: null, phaseKey: "p2", sortKey: 1, status: "linked", suggestedWeek: null, title: "需求" },
      { contactLinks: [], criteria: null, id: "ev", kind: "event", linkedEventId: "event-1", phaseKey: "p2", sortKey: 2, status: "recommended", suggestedWeek: 6, title: "活动" },
      { contactLinks: [], criteria: null, id: "a-late", kind: "action", linkedEventId: null, phaseKey: "p1", sortKey: 3, status: "not_started", suggestedWeek: 2, title: "拖期" },
      { contactLinks: [], criteria: null, id: "a-now", kind: "action", linkedEventId: null, phaseKey: "p2", sortKey: 4, status: "in_progress", suggestedWeek: 5, title: "本周" },
      { contactLinks: [], criteria: null, id: "a-later", kind: "action", linkedEventId: null, phaseKey: "p2", sortKey: 5, status: "not_started", suggestedWeek: 7, title: "以后" },
      { contactLinks: [], criteria: null, id: "a-done", kind: "action", linkedEventId: null, phaseKey: "p1", sortKey: 6, status: "done", suggestedWeek: 1, title: "完成" },
    ],
    plan: { goalSnapshot: "目标", id: "plan", phases: [{ endWeek: 4, key: "p1", startWeek: 1, title: "一" }, { endWeek: 8, key: "p2", startWeek: 5, title: "二" }], startsOn: "2026-08-31" },
  }, new Date("2026-10-01T03:00:00.000Z")); // 第 5 周
  assert.equal(view.percent, 100);
  assert.deepEqual(view.needs.map((need) => [need.needId, need.phaseTitle, need.have, need.target, need.linkedContactIds]), [["need", "二", 2, 2, ["c1", "c2"]]]);
  assert.deepEqual(view.eventItems, [{ eventId: "event-1", phaseKey: "p2" }]);
  assert.deepEqual(view.weekActions.map((action) => [action.id, action.weeksOverdue]).sort(), [["a-late", 3], ["a-now", 0]]);
  assert.deepEqual(view.linkedContactIds, ["c1", "c2"]);
  assert.equal(view.goal, "目标");
});
