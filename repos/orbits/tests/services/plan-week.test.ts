/**
 * W0009：计划周次（`features/plans/week.ts`）。第 1 周从 `startsOn` 当天起算，按东京日历日；
 * 本周行动 = 建议周次 ≤ 本周且未完成的行动（已完成的一律不在），逾期的算出「已延后 N 周」。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanItem } from "../../features/plans/contract";
import {
  planPhaseIndexForWeek,
  planTokyoDate,
  planTotalWeeks,
  planWeekActions,
  planWeekAt,
  planWeekRange,
  planWeekState,
} from "../../features/plans/week";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

test("week 1 starts on starts_on and weeks roll every 7 days, not on Mondays", () => {
  // 2026-09-16 是周三。
  assert.equal(planWeekAt("2026-09-16", new Date("2026-09-16T03:00:00+09:00")), 1);
  assert.equal(planWeekAt("2026-09-16", new Date("2026-09-22T23:59:00+09:00")), 1);
  assert.equal(planWeekAt("2026-09-16", new Date("2026-09-23T00:00:00+09:00")), 2);
  assert.equal(planWeekAt("2026-09-16", new Date("2026-10-14T12:00:00+09:00")), 5);
  // 计划开始之前按第 1 周。
  assert.equal(planWeekAt("2026-09-16", new Date("2026-09-10T12:00:00+09:00")), 1);
});

test("the current week follows the Tokyo calendar day, not UTC", () => {
  // 东京 9/23 00:30 = UTC 9/22 15:30：UTC 还在第 1 周，东京已经是第 2 周。
  const at = new Date("2026-09-22T15:30:00.000Z");
  assert.equal(planTokyoDate(at), "2026-09-23");
  assert.equal(planWeekAt("2026-09-16", at), 2);
});

test("week ranges, totals and the phase for a week", () => {
  assert.deepEqual(planWeekRange("2026-09-14", 3), { end: "2026-10-04", start: "2026-09-28" });
  assert.deepEqual(planWeekRange("2026-12-28", 1), { end: "2027-01-03", start: "2026-12-28" });
  const phases = [
    { endWeek: 3, startWeek: 1 },
    { endWeek: 8, startWeek: 4 },
    { endWeek: 12, startWeek: 9 },
  ];
  assert.equal(planTotalWeeks(phases), 12);
  assert.equal(planPhaseIndexForWeek(phases, 1), 0);
  assert.equal(planPhaseIndexForWeek(phases, 3), 0);
  assert.equal(planPhaseIndexForWeek(phases, 4), 1);
  assert.equal(planPhaseIndexForWeek(phases, 12), 2);
  assert.equal(planPhaseIndexForWeek([], 1), -1);
});

test("a finished plan keeps counting weeks but displays its last week", () => {
  const state = planWeekState(
    { phases: [{ endWeek: 4, startWeek: 1 }], startsOn: "2026-08-01" },
    new Date("2026-09-28T12:00:00+09:00"),
  );
  assert.equal(state.currentWeek, 9);
  assert.equal(state.displayWeek, 4);
  assert.equal(state.totalWeeks, 4);
  assert.equal(state.ended, true);
  assert.equal(state.endsOn, "2026-08-28");
});

test("this week lists due-and-undone actions, overdue ones roll in with weeks overdue", () => {
  const { items, plan } = planSnapshotFixture();
  const state = planWeekState(plan, PLAN_NOW);
  assert.equal(state.currentWeek, 3);

  const actions = planWeekActions(items, state.currentWeek);
  assert.deepEqual(
    actions.map((entry) => [entry.item.id, entry.weeksOverdue]),
    [
      // 刚好本周的
      ["a-this-week", 0],
      // 逾期 1 周、2 周（进行中的也算未完成）
      ["a-overdue-1", 1],
      ["a-overdue-2", 2],
    ],
  );
  // 已完成的（上周完成的、本周刚完成的）一律不在；下一阶段（第 4 周）的也不在。
  const ids = actions.map((entry) => entry.item.id);
  assert.ok(!ids.includes("a-done-last-week"));
  assert.ok(!ids.includes("a-done-this-week"));
  assert.ok(actions.every((entry) => entry.item.status !== "done"));
  assert.ok(!ids.includes("a-next-phase"));
  // 非行动条目永远不进本周。
  assert.ok(actions.every((entry) => entry.item.kind === "action"));
});

test("crossing into the next week moves the boundary: last week's items become overdue", () => {
  const { items, plan } = planSnapshotFixture();
  // 第 4 周第 1 天（东京 10/5 00:10）。
  const next = new Date("2026-10-04T15:10:00.000Z");
  assert.equal(planWeekAt(plan.startsOn, next), 4);
  const actions = planWeekActions(items, 4);
  const byId = new Map(actions.map((entry) => [entry.item.id, entry]));
  assert.equal(byId.get("a-next-phase")?.weeksOverdue, 0);
  assert.equal(byId.get("a-this-week")?.weeksOverdue, 1);
  assert.equal(byId.get("a-overdue-2")?.weeksOverdue, 3);
  assert.ok(!byId.has("a-done-this-week"));
});

test("actions without a suggested week (later quarters of a year plan) never enter this week", () => {
  const base = planSnapshotFixture().items[0]!;
  const undated: PlanItem = { ...base, id: "a-undated", suggestedWeek: null };
  assert.deepEqual(planWeekActions([undated], 40), []);
});
