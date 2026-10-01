/**
 * W0036 SC-01／SC-03 纯函数：今日要事里的计划行动挑选、名额、阶段名、跳转地址、本地存储 key、
 * 补人脉的免打扰判断，以及活动池的计划点名取法（`iorbit-0918/today-plan-items.ts`）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanViewItem, PlanViewSnapshot } from "../../features/plans/contract";
import {
  networkNudgeQuiet,
  networkNudgeStorageKey,
  planPoolEventIds,
  selectTodayPlanActions,
  todayPlanActionHref,
  todayPlanPhase,
  todayPlanSlots,
  todaySkipStorageKey,
  TODAY_SKIP_KEY_PREFIX,
} from "../../app/(app)/app/agent/iorbit-0918/today-plan-items";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

function fixture(): PlanViewSnapshot {
  return planSnapshotFixture() as unknown as PlanViewSnapshot;
}

function withItems(snapshot: PlanViewSnapshot, items: PlanViewItem[]): PlanViewSnapshot {
  return { ...snapshot, items };
}

test("slots: base 0／1／2／≥3 items leave room for 2／2／1／0 plan actions", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(todayPlanSlots), [2, 2, 1, 0, 0, 0]);
});

test("overdue actions come first (most overdue first), then this week's, by suggested week and sortKey", () => {
  // 夹具在第 3 周：a-this-week（第 3 周）、a-overdue-1（第 2 周）、a-overdue-2（第 1 周）。
  const picked = selectTodayPlanActions(fixture(), PLAN_NOW, { baseCount: 0, skippedIds: [] });
  assert.deepEqual(picked.map((entry) => [entry.id, entry.weeksOverdue]), [
    ["a-overdue-2", 2],
    ["a-overdue-1", 1],
  ]);
  // 与本周推进（本周的在前）顺序相反，这正是要的「拖期优先」。
});

test("the number picked follows the slots, and skipped ids are removed after picking (no backfill, W36-3)", () => {
  const snapshot = fixture();
  assert.deepEqual(selectTodayPlanActions(snapshot, PLAN_NOW, { baseCount: 2, skippedIds: [] }).map((entry) => entry.id), ["a-overdue-2"]);
  assert.deepEqual(selectTodayPlanActions(snapshot, PLAN_NOW, { baseCount: 3, skippedIds: [] }), []);
  // 隐藏第 1 条后不由第 3 条补上。
  assert.deepEqual(
    selectTodayPlanActions(snapshot, PLAN_NOW, { baseCount: 0, skippedIds: ["a-overdue-2"] }).map((entry) => entry.id),
    ["a-overdue-1"],
  );
  assert.deepEqual(selectTodayPlanActions(snapshot, PLAN_NOW, { baseCount: 2, skippedIds: ["a-overdue-2"] }), []);
});

test("completed and future actions never enter today", () => {
  const ids = selectTodayPlanActions(fixture(), PLAN_NOW, { baseCount: 0, skippedIds: ["a-overdue-2", "a-overdue-1"] }).map(
    (entry) => entry.id,
  );
  assert.deepEqual(ids, []);
  const done = fixture();
  const onlyThisWeek = withItems(
    done,
    done.items.filter((item) => item.id === "a-this-week" || item.id === "a-done-this-week" || item.id === "a-next-phase"),
  );
  assert.deepEqual(
    selectTodayPlanActions(onlyThisWeek, PLAN_NOW, { baseCount: 0, skippedIds: [] }).map((entry) => [entry.id, entry.weeksOverdue]),
    [["a-this-week", 0]],
  );
});

test("phase label: the item's phase, else the current phase, else none", () => {
  const snapshot = fixture();
  const byId = (id: string) => snapshot.items.find((item) => item.id === id)!;
  assert.deepEqual(todayPlanPhase(snapshot, byId("a-this-week"), PLAN_NOW), { phaseNo: 1, phaseTitle: "摸清需求" });
  assert.deepEqual(todayPlanPhase(snapshot, byId("a-next-phase"), PLAN_NOW), {
    phaseNo: 2,
    phaseTitle: snapshot.plan.phases[1]!.title,
  });
  // phaseKey 为空或不在阶段表里：退回当前阶段（第 3 周在第 1 阶段）。
  assert.deepEqual(todayPlanPhase(snapshot, { ...byId("a-this-week"), phaseKey: null }, PLAN_NOW), { phaseNo: 1, phaseTitle: "摸清需求" });
  assert.deepEqual(todayPlanPhase(snapshot, { ...byId("a-this-week"), phaseKey: "gone" }, PLAN_NOW), { phaseNo: 1, phaseTitle: "摸清需求" });
  // 计划没有阶段：只写「本周计划」。
  const noPhases = { ...snapshot, plan: { ...snapshot.plan, phases: [] } };
  assert.equal(todayPlanPhase(noPhases, byId("a-this-week"), PLAN_NOW), null);
});

test("the title link goes to the contact, then the event, then the plan row anchor", () => {
  const base = fixture().items.find((item) => item.id === "a-this-week")!;
  assert.equal(todayPlanActionHref({ ...base, linkedContactIds: ["contact:c1", "contact:c2"], linkedEventId: "event:x" }), "/app/contacts/contact%3Ac1");
  assert.equal(
    todayPlanActionHref({ ...base, meta: { contactId: "contact:m", source: "network_match" } }),
    "/app/contacts/contact%3Am",
  );
  // meta.contactId 只认匹配行动生成的。
  assert.equal(todayPlanActionHref({ ...base, meta: { contactId: "contact:m" } }), "/app/agent/plan#plan-action-a-this-week");
  assert.equal(todayPlanActionHref({ ...base, linkedEventId: "event:founders-night" }), "/app/events/event%3Afounders-night");
  assert.equal(todayPlanActionHref(base), "/app/agent/plan#plan-action-a-this-week");
});

test("storage keys are per account and per Tokyo day", () => {
  assert.equal(TODAY_SKIP_KEY_PREFIX, "orbit.today.skip.v1:");
  assert.equal(todaySkipStorageKey("user-a", "2026-10-01"), "orbit.today.skip.v1:user-a:2026-10-01");
  assert.equal(networkNudgeStorageKey("user-a"), "orbit.today.networkNudge.v1:user-a");
});

test("the network nudge stays quiet for 7 days and comes back on the 8th", () => {
  assert.equal(networkNudgeQuiet(null, "2026-10-01"), false);
  assert.equal(networkNudgeQuiet("2026-10-01", "2026-10-01"), true);
  assert.equal(networkNudgeQuiet("2026-10-01", "2026-10-07"), true);
  assert.equal(networkNudgeQuiet("2026-10-01", "2026-10-08"), false);
  assert.equal(networkNudgeQuiet("garbage", "2026-10-08"), false);
});

test("plan-named events for the pool: recommended event items and open actions with a linked event, in plan order", () => {
  const snapshot = fixture();
  const items: PlanViewItem[] = [
    ...snapshot.items,
    { ...snapshot.items.find((item) => item.id === "a-this-week")!, id: "a-linked", linkedEventId: "event:linked" },
    { ...snapshot.items.find((item) => item.id === "a-done-this-week")!, id: "a-done-linked", linkedEventId: "event:done" },
  ];
  // e-p2 推荐中 → 计入；e-p1 已报名（registered）→ 不计入；完成的行动不计入。
  assert.deepEqual(planPoolEventIds(withItems(snapshot, items)), ["event:dx-seminar", "event:linked"]);
});
