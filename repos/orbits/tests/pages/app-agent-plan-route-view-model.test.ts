/**
 * 「我的计划」route view-model（W0009，RW-10 / RW-07）。
 *
 * 只读当前生效计划的快照：报头（目标原文、版本、生成日、周进度刻度）、本周行动（逾期滚入）、
 * 阶段、人脉需求（计数、人员按添加倒序）、计划里的活动、进展记录；没有计划时引导去第 3 步。
 * 同一份快照还给首页「本周推进」与活动推荐理由用。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanSnapshot } from "../../features/plans/contract";
import {
  buildMyPlanViewModel,
  buildPlanWeekSummary,
  planEventReasons,
  type MyPlanView,
} from "../../app/(app)/app/agent/plan/plan-route-view-model";
import { PLAN_NOW, planSnapshotFixture } from "../support/plan-snapshot-fixture";

function readyView(snapshot: PlanSnapshot = planSnapshotFixture(), language: "en" | "zh" = "zh"): MyPlanView {
  const model = buildMyPlanViewModel({ guideEnabled: true, language, now: PLAN_NOW, snapshot });
  assert.equal(model.state, "ready");
  return (model as Extract<typeof model, { state: "ready" }>).view;
}

test("no plan → empty state pointing at guide step 3, or back to iOrbit when the guide is off", () => {
  assert.deepEqual(buildMyPlanViewModel({ guideEnabled: true, language: "zh", now: PLAN_NOW, snapshot: null }), {
    startHref: "/app/start",
    state: "none",
  });
  assert.deepEqual(buildMyPlanViewModel({ guideEnabled: false, language: "zh", now: PLAN_NOW, snapshot: null }), {
    startHref: "/app/agent",
    state: "none",
  });
  assert.deepEqual(
    buildMyPlanViewModel({ guideEnabled: true, language: "zh", now: PLAN_NOW, snapshot: "unavailable" }),
    { state: "unavailable" },
  );
});

test("the masthead carries the goal verbatim, version, creation day and the week ruler", () => {
  const view = readyView();
  assert.equal(view.goal, "三个月内找到 5 家日本中小企业试用我们的产品");
  assert.equal(view.version, 1);
  assert.equal(view.generatedLabel, "9/14");
  assert.equal(view.supplement, "先从东京开始");
  assert.deepEqual(view.week, {
    current: 3,
    ended: false,
    phaseNo: 1,
    phaseTitle: "摸清需求",
    rangeLabel: "9/28 – 10/4",
    total: 12,
  });
  // 刻度：阶段区间（起始周 + 跨度）与本周高亮。
  assert.deepEqual(
    view.ruler.phases.map((phase) => [phase.n, phase.title, phase.startWeek, phase.span, phase.current]),
    [
      [1, "摸清需求", 1, 3, true],
      [2, "集中接触", 4, 5, false],
      [3, "推进试用", 9, 4, false],
    ],
  );
  assert.equal(view.ruler.weeks.length, 12);
  assert.deepEqual(
    view.ruler.weeks.slice(0, 4).map((week) => week.state),
    ["past", "past", "now", "future"],
  );
  assert.equal(view.ruler.startLabel, "9/14 开始");
  assert.equal(view.ruler.endLabel, "12/6 结束");
  // 目标分析来自 plans.analysis。
  assert.ok(view.analysis);
  assert.equal(view.analysis!.answer, "12 周分 3 步：先摸清需求，再集中接触，最后拿下 5 家。");
  assert.deepEqual(view.analysis!.figures, ["5 家 · 12/6 前要达成", "10 位 · 要新认识的负责人"]);
  assert.match(view.analysis!.risk, /前 3 周/);
});

test("a plan without the bootstrap analysis hides the analysis instead of inventing one", () => {
  const snapshot = planSnapshotFixture();
  snapshot.plan.analysis = { summary: "hand-made" };
  const view = readyView(snapshot);
  assert.equal(view.analysis, null);
  assert.equal(view.supplement, null);
  assert.ok(view.phases.every((phase) => phase.pitch === null && phase.followups.length === 0));
});

test("this week lists due, undone actions with overdue ones marked by weeks overdue", () => {
  const view = readyView();
  assert.deepEqual(
    view.thisWeek.map((action) => [action.id, action.weeksOverdue, action.done, action.weekLabel]),
    [
      ["a-this-week", 0, false, "第 3 周"],
      ["a-overdue-1", 1, false, "第 2 周"],
      ["a-overdue-2", 2, false, "第 1 周"],
    ],
  );
  assert.equal(view.thisWeek[0]!.detail, "你已经认识 TA，是离目标最近的一步。");
});

test("a row ticked in this session stays visible (checked) only through the page's local sticky ids", () => {
  const snapshot = planSnapshotFixture();
  // 本周刚完成的那件：没有 sticky 时不在列表里；页面标了 sticky 才暂留，按同一顺序插回。
  const model = buildMyPlanViewModel({
    guideEnabled: true,
    language: "zh",
    now: PLAN_NOW,
    snapshot,
    stickyActionIds: ["a-done-this-week", "a-next-phase", "n-connector"],
  });
  assert.equal(model.state, "ready");
  const view = (model as Extract<typeof model, { state: "ready" }>).view;
  assert.deepEqual(
    view.thisWeek.map((action) => [action.id, action.done]),
    [
      ["a-this-week", false],
      ["a-done-this-week", true],
      ["a-overdue-1", false],
      ["a-overdue-2", false],
    ],
  );
  // 未来周的行动、非行动条目即使在 sticky 里也不会混进本周。
});

test("phases carry their items; only the current one gets the intro script", () => {
  const view = readyView();
  const [p1, p2, p3] = view.phases;
  assert.equal(p1!.current, true);
  assert.equal(p1!.weeksLabel, "第 1–3 周");
  assert.equal(p1!.actionsTotal, 5);
  assert.equal(p1!.actionsDone, 2);
  assert.deepEqual(p1!.who, ["能帮你引荐的行业前辈"]);
  assert.deepEqual(
    p1!.infos.map((info) => [info.title, info.answer]),
    [
      ["现在用什么记会议？", "大多手写，会后 30 分钟整理"],
      ["试用需要谁点头？", null],
    ],
  );
  assert.deepEqual(p1!.events.map((event) => [event.title, event.dateLabel, event.status]), [["东京创业者交流之夜", "9/30", "registered"]]);
  assert.equal(p1!.pitch?.text, "我正在推进一件事：三个月内找到 5 家试用客户。");
  assert.deepEqual(p1!.followups, ["当天：发一句感谢", "3 天内：约 20 分钟线上聊"]);
  assert.equal(p2!.current, false);
  assert.equal(p2!.pitch, null);
  assert.equal(p2!.actionsTotal, 1);
  assert.equal(p3!.actionsTotal, 0);
});

test("network needs count established / linked and list people newest first", () => {
  const view = readyView();
  const [connector, target] = view.needs;
  assert.equal(connector!.title, "能帮你引荐的行业前辈");
  assert.equal(connector!.industry, "社群与非营利 › 行业协会");
  assert.equal(connector!.established, 1);
  assert.equal(connector!.linked, 2);
  assert.equal(connector!.pendingMatches, 0);
  // c2 关联于 9/25，c1 关联于 9/20 → c2 在前；c2 的名字来自生成快照，c1 没有名字来源。
  assert.deepEqual(
    connector!.people.map((person) => [person.contactId, person.name, person.known, person.state]),
    [
      ["contact:c2", "高木一郎", true, "established"],
      ["contact:c1", "联系人", false, "linked"],
    ],
  );
  assert.equal(connector!.people[0]!.subtitle, "北辰精工 · 部长");
  assert.equal(target!.linked, 0);
  assert.deepEqual(target!.people, []);
  // 调用方补充的名字优先。
  const named = buildMyPlanViewModel({
    contactNames: { "contact:c1": { name: "森下真理", subtitle: null } },
    guideEnabled: true,
    language: "zh",
    now: PLAN_NOW,
    snapshot: planSnapshotFixture(),
  });
  assert.equal(named.state === "ready" && named.view.needs[0]!.people[1]!.name, "森下真理");
});

test("plan events are ordered by date and point at their phase's need", () => {
  const view = readyView();
  assert.deepEqual(
    view.events.map((event) => [event.title, event.dateLabel, event.status, event.phaseNo, event.need, event.eventId]),
    [
      ["东京创业者交流之夜", "9/30", "registered", 1, "能帮你引荐的行业前辈", "event:founders-night"],
      ["中小企业 DX 推进研讨会", "10/15", "recommended", 2, "中小企业的 IT 负责人", "event:dx-seminar"],
    ],
  );
});

test("the progress log localises structured entries and keeps manual notes verbatim", () => {
  const view = readyView();
  assert.deepEqual(
    view.log.map((line) => [line.kind, line.timeLabel, line.text]),
    [
      ["manual", "今天 11:00", "今天和老客户通了电话"],
      ["auto", "9/22", "完成「把 30 秒自我介绍发给 3 位老朋友」"],
      ["auto", "9/14", "生成计划 v1"],
    ],
  );
  const en = readyView(planSnapshotFixture(), "en");
  assert.equal(en.log[1]!.text, "Completed “把 30 秒自我介绍发给 3 位老朋友”");
  assert.equal(en.log[2]!.text, "Plan created");
  assert.equal(en.ruler.startLabel, "Starts 9/14");
});

test("counts: actions done / total across the plan and established contacts", () => {
  assert.deepEqual(readyView().counts, { actionsDone: 2, actionsTotal: 6, contactsEstablished: 1 });
});

test("the home summary is the current phase, week n of N, at most three actions and the counts", () => {
  const summary = buildPlanWeekSummary(planSnapshotFixture(), PLAN_NOW, "zh");
  assert.equal(summary.phaseNo, 1);
  assert.equal(summary.phaseTitle, "摸清需求");
  assert.equal(summary.week, 3);
  assert.equal(summary.totalWeeks, 12);
  // 本周刚完成的那件不占名额：3 个名额都给未完成的，逾期 2 周的那件不会被挤掉。
  assert.deepEqual(
    summary.actions.map((action) => action.id),
    ["a-this-week", "a-overdue-1", "a-overdue-2"],
  );
  assert.ok(summary.actions.every((action) => !action.done));
  assert.equal(summary.actionsDone, 2);
  assert.equal(summary.actionsTotal, 6);
  assert.equal(summary.contactsEstablished, 1);
});

test("the home keeps its 3 slots for undone actions; a row ticked on the home rides along outside them", () => {
  const snapshot = planSnapshotFixture();
  // 再加两件本周未完成的：名额满 3 件。
  const extra = snapshot.items.find((item) => item.id === "a-this-week")!;
  snapshot.items.push({ ...extra, id: "a-this-week-2", sortKey: 90 }, { ...extra, id: "a-this-week-3", sortKey: 91 });
  const plain = buildPlanWeekSummary(snapshot, PLAN_NOW, "zh");
  assert.deepEqual(plain.actions.map((action) => action.id), ["a-this-week", "a-this-week-2", "a-this-week-3"]);
  // 首页上刚勾掉的那件（服务端已是 done）暂留，另占一行，不挤掉任何未完成的。
  const ticked = { ...snapshot, items: snapshot.items.map((item) => (item.id === "a-this-week" ? { ...item, status: "done" as const } : item)) };
  const withSticky = buildPlanWeekSummary(ticked, PLAN_NOW, "zh", ["a-this-week"]);
  assert.deepEqual(
    withSticky.actions.map((action) => [action.id, action.done]),
    [
      ["a-this-week", true],
      ["a-this-week-2", false],
      ["a-this-week-3", false],
      ["a-overdue-1", false],
    ],
  );
});

test("RW-07: events linked to a plan phase map to that phase and its only network need", () => {
  const reasons = planEventReasons(planSnapshotFixture());
  assert.deepEqual(reasons["event:founders-night"], { isNeed: true, phaseNo: 1, target: "能帮你引荐的行业前辈" });
  assert.deepEqual(reasons["event:dx-seminar"], { isNeed: true, phaseNo: 2, target: "中小企业的 IT 负责人" });
  assert.equal(reasons["event:not-in-plan"], undefined);

  // 阶段里没有人脉需求时退回阶段名；挂了活动的行动同样算。
  const snapshot = planSnapshotFixture();
  snapshot.items = snapshot.items
    .filter((item) => item.kind !== "network_need")
    .map((item) => (item.id === "a-next-phase" ? { ...item, linkedEventId: "event:from-action" } : item));
  const fallback = planEventReasons(snapshot);
  assert.deepEqual(fallback["event:from-action"], { isNeed: false, phaseNo: 2, target: "集中接触" });
});

test("RW-07 honesty: a phase with several network needs names the phase, not one of the needs", () => {
  const snapshot = planSnapshotFixture();
  const connector = snapshot.items.find((item) => item.id === "n-connector")!;
  // 第 1 阶段再加一个人脉需求：活动与人脉需求之间没有结构化关联，不能替用户挑一个。
  snapshot.items.push({ ...connector, contactLinks: [], id: "n-second", linkedContactIds: [], sortKey: 99, title: "第一批试用客户" });
  const reasons = planEventReasons(snapshot);
  assert.deepEqual(reasons["event:founders-night"], { isNeed: false, phaseNo: 1, target: "摸清需求" });
  // 第 2 阶段仍只有一个人脉需求。
  assert.deepEqual(reasons["event:dx-seminar"], { isNeed: true, phaseNo: 2, target: "中小企业的 IT 负责人" });
  // 计划页右栏的活动同样不写「对应某个人脉需求」。
  const view = readyView(snapshot);
  assert.deepEqual(
    view.events.map((event) => [event.title, event.need]),
    [
      ["东京创业者交流之夜", null],
      ["中小企业 DX 推进研讨会", "中小企业的 IT 负责人"],
    ],
  );
});
