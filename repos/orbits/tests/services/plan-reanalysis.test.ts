/**
 * W0012 SC-03 / SC-04：重新分析的四种触发（纯函数）、东京自然月额度、同时提交只成功一次、
 * 到期后的下一份不占额度、事务失败不留半份新版本（内存仓储；Postgres 版见 plans-repository.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanItem, PlanSnapshot } from "../../features/plans/contract";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import {
  buildPlanReview,
  createPlanFollowUpService,
  reanalysisQuotaKey,
  reanalysisTriggers,
  tokyoMonthKey,
} from "../../features/plans/reanalysis";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository, type PlanRepository } from "../../features/plans/repository";
import { createPlanService, PlanServiceError } from "../../features/plans/service";
import { CONTACTS, EVENTS, ME } from "../support/plan-bootstrap-fixture";
import { planInput } from "../support/plan-fixture";

async function rejectsWith(promise: Promise<unknown>, reason: PlanServiceError["reason"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PlanServiceError, `expected PlanServiceError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  });
}

test("the quota month is the Tokyo calendar month (UTC inputs at the month edge)", () => {
  assert.equal(tokyoMonthKey(new Date("2026-09-30T14:59:59.999Z")), "2026-09"); // 9/30 23:59 JST
  assert.equal(tokyoMonthKey(new Date("2026-09-30T15:00:00.000Z")), "2026-10"); // 10/1 00:00 JST
  assert.equal(tokyoMonthKey(new Date("2026-12-31T15:00:00.000Z")), "2027-01");
  assert.equal(reanalysisQuotaKey("2026-10"), "reanalysis:2026-10");
});

/** 一份 12 周、三阶段的计划快照（p1 第 1–3 周、p2 第 4–8 周、p3 第 9–12 周）。 */
function snapshot(items: Array<Partial<PlanItem> & { id: string }>, goal = "三个月内拿到 10 家企业客户的试用"): PlanSnapshot {
  return {
    items: items.map((item, index) => ({
      answer: null,
      carriedFromItemId: null,
      completedAt: null,
      contactLinks: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      criteria: null,
      deferralCount: 0,
      detail: null,
      kind: "action",
      linkedContactIds: [],
      linkedEventId: null,
      meta: {},
      phaseKey: "p1",
      planId: "plan:1",
      sortKey: index,
      status: "not_started",
      suggestedWeek: 1,
      title: item.id,
      updatedAt: "2026-09-01T00:00:00.000Z",
      ...item,
    })),
    log: [],
    plan: {
      analysis: {},
      archivedAt: null,
      createdAt: "2026-09-07T00:00:00.000Z",
      goalSnapshot: goal,
      horizon: "quarter",
      id: "plan:1",
      phases: [
        { endWeek: 3, granularity: "week", key: "p1", startWeek: 1, summary: null, title: "摸清需求" },
        { endWeek: 8, granularity: "week", key: "p2", startWeek: 4, summary: null, title: "集中接触" },
        { endWeek: 12, granularity: "week", key: "p3", startWeek: 9, summary: null, title: "推进落地" },
      ],
      previousPlanId: null,
      sourceSessionId: null,
      startsOn: "2026-09-07",
      status: "active",
      updatedAt: "2026-09-07T00:00:00.000Z",
      version: 1,
    },
  };
}

// 2026-09-07 起第 1 周；9/22 是第 3 周（p1 的最后一周），9/24 仍是第 3 周。
const WEEK_2 = new Date("2026-09-15T03:00:00.000Z");
const WEEK_3 = new Date("2026-09-22T03:00:00.000Z");

test("no trigger for a plan that is on track", () => {
  const plan = snapshot([{ id: "a1", suggestedWeek: 1, status: "done" }, { id: "a2", suggestedWeek: 2 }]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: "三个月内拿到 10 家企业客户的试用", now: WEEK_2, snapshot: plan }), []);
});

test("goal_changed fires when the profile goal differs from the plan's goal snapshot (whitespace ignored)", () => {
  const plan = snapshot([{ id: "a1", suggestedWeek: 2 }]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: " 三个月内拿到 10 家企业客户的试用 ", now: WEEK_2, snapshot: plan }), []);
  assert.deepEqual(reanalysisTriggers({ currentGoal: "半年内拿到 3 家代理商", now: WEEK_2, snapshot: plan }), ["goal_changed"]);
  // 读不到目标、目标为空：不据此提示。
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: WEEK_2, snapshot: plan }), []);
  assert.deepEqual(reanalysisTriggers({ currentGoal: "  ", now: WEEK_2, snapshot: plan }), []);
});

test("phase_done_early fires only when a started, unfinished phase has every action done", () => {
  const done = snapshot([
    { id: "a1", status: "done", suggestedWeek: 1 },
    { id: "a2", status: "done", suggestedWeek: 3 },
    { id: "b1", phaseKey: "p2", suggestedWeek: 4 },
  ]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: WEEK_2, snapshot: done }), ["phase_done_early"]);
  // 第 3 周是 p1 的最后一周：按时完成，不算提前。
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: WEEK_3, snapshot: done }), []);
  const partly = snapshot([{ id: "a1", status: "done" }, { id: "a2", suggestedWeek: 3 }]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: WEEK_2, snapshot: partly }), []);
});

test("deferred_actions fires at the third action slipped by two or more weeks", () => {
  // 第 3 周：建议第 1 周的未完成行动逾期 2 周。
  const two = snapshot([
    { id: "a1", suggestedWeek: 1 },
    { id: "a2", suggestedWeek: 1 },
    { id: "a3", suggestedWeek: 2 },
    { id: "a4", status: "done", suggestedWeek: 1 },
  ]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: WEEK_3, snapshot: two }), []);
  const three = snapshot([
    { id: "a1", suggestedWeek: 1 },
    { id: "a2", suggestedWeek: 1 },
    // 手动延后 2 次也算。
    { deferralCount: 2, id: "a3", suggestedWeek: 3 },
  ]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: WEEK_3, snapshot: three }), ["deferred_actions"]);
});

test("period_ended fires after the last week (12 weeks from 9/7 end on 11/29 JST)", () => {
  const plan = snapshot([{ id: "a1", status: "done" }]);
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: new Date("2026-11-29T14:59:59.999Z"), snapshot: plan }), []);
  assert.deepEqual(reanalysisTriggers({ currentGoal: null, now: new Date("2026-11-29T15:00:00.000Z"), snapshot: plan }), ["period_ended"]);
});

test("the review counts done actions, new people and where they were met", () => {
  const plan = snapshot([
    { id: "a1", status: "done" },
    { id: "a2" },
    {
      contactLinks: [
        { contactId: "c1", establishedAt: "2026-09-10T00:00:00.000Z", linkedAt: "2026-09-09T00:00:00.000Z", state: "established" },
        { contactId: "c2", establishedAt: null, linkedAt: "2026-09-09T00:00:00.000Z", state: "linked" },
      ],
      id: "n1",
      kind: "network_need",
      status: "established",
    },
    { id: "e1", kind: "event", linkedEventId: "event:jetro", status: "attended", title: "JETRO 交流会" },
  ]);
  const review = buildPlanReview(plan, {
    byEvent: [
      { count: 1, eventId: "event:other", title: "别的活动" },
      { count: 3, eventId: "event:jetro", title: "旧标题" },
    ],
    total: 7,
  });
  assert.deepEqual(review, {
    actionsDone: 1,
    actionsTotal: 2,
    established: 1,
    events: [
      { count: 3, eventId: "event:jetro", title: "JETRO 交流会" },
      { count: 1, eventId: "event:other", title: "别的活动" },
    ],
    newPeople: 7,
  });
  // 联系人读不到：新认识人数退回计划里关联过的人，已参加的活动照样列出。
  assert.deepEqual(buildPlanReview(plan, null).events, [{ count: 0, eventId: "event:jetro", title: "JETRO 交流会" }]);
  assert.equal(buildPlanReview(plan, null).newPeople, 2);
});

/* ------------------------------------------------------------------ */

function harness(options: { clock: { now: string }; repository?: PlanRepository; actorId?: string }) {
  const actorId = options.actorId ?? ME;
  const repository = options.repository ?? createMemoryPlanRepository();
  const references = createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } });
  let tick = 0;
  const plans = createPlanService({
    // 同一「时刻」里每次调用前进 1 ms，保证记录有先后。
    now: () => new Date(Date.parse(options.clock.now) + tick++).toISOString(),
    references,
    repository,
    scope: { actorId, workspaceId: "w" },
  });
  const followUp = createPlanFollowUpService({
    actorId,
    generator: createMockPlanGenerator(),
    now: () => new Date(options.clock.now),
    plans,
    references,
    source: { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => EVENTS },
  });
  const request = (basePlanId: string, key: string, origin: "reanalysis" | "next_plan" = "reanalysis") => ({
    basePlanId,
    goal: { horizon: "quarter" as const, snapshot: "三个月内拿到 10 家企业客户的试用", text: "三个月内拿到 10 家企业客户的试用" },
    idempotencyKey: key,
    locale: "zh" as const,
    origin,
  });
  return { followUp, plans, repository, request };
}

test("re-analysis creates a new version once per Tokyo month and carries finished work", async () => {
  const clock = { now: "2026-09-30T14:00:00.000Z" }; // 9/30 23:00 JST
  const { followUp, plans, request } = harness({ clock });
  const v1 = await plans.createVersion(planInput({ startsOn: "2026-09-28" }));
  const done = v1.items.find((item) => item.kind === "action")!;
  await plans.updateItem({ change: { op: "set_status", status: "done" }, itemId: done.id });
  assert.deepEqual(await plans.reanalysisQuota(), { limit: 1, month: "2026-09", remaining: 1, used: 0 });

  const v2 = await followUp.create(request(v1.plan.id, "k1"));
  assert.equal(v2.replayed, false);
  assert.equal(v2.snapshot.plan.version, 2);
  assert.equal(v2.snapshot.plan.previousPlanId, v1.plan.id);
  assert.ok(v2.snapshot.items.some((item) => item.carriedFromItemId === done.id && item.status === "done"));
  const created = v2.snapshot.log.find((entry) => entry.event === "plan_created")!;
  assert.equal(created.idempotencyKey, "reanalysis:2026-09");
  assert.equal(created.payload.origin, "reanalysis");
  assert.deepEqual(await plans.reanalysisQuota(), { limit: 1, month: "2026-09", remaining: 0, used: 1 });

  // 同一次点击的重试（同一个键）：回放，不再生成，不报额度用完。
  const replay = await followUp.create(request(v1.plan.id, "k1"));
  assert.equal(replay.replayed, true);
  assert.equal(replay.snapshot.plan.id, v2.snapshot.plan.id);

  // 本月第二次：额度用完，什么都不写。
  await rejectsWith(followUp.create(request(v2.snapshot.plan.id, "k2")), "REANALYSIS_QUOTA_EXHAUSTED");
  assert.equal((await plans.listVersions()).length, 2);

  // 东京 10/1 00:00 起是新的一个月。
  clock.now = "2026-09-30T15:00:00.000Z";
  assert.equal((await plans.reanalysisQuota()).remaining, 1);
  const v3 = await followUp.create(request(v2.snapshot.plan.id, "k3"));
  assert.equal(v3.snapshot.plan.version, 3);
  assert.equal(v3.snapshot.log.find((entry) => entry.event === "plan_created")!.idempotencyKey, "reanalysis:2026-10");
});

test("two simultaneous re-analysis submits: exactly one succeeds", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const { followUp, plans, request } = harness({ clock });
  const v1 = await plans.createVersion(planInput({ startsOn: "2026-10-05" }));
  const results = await Promise.allSettled([
    followUp.create(request(v1.plan.id, "tab-a")),
    followUp.create(request(v1.plan.id, "tab-b")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof PlanServiceError);
  assert.ok(["BASE_PLAN_MISMATCH", "REANALYSIS_QUOTA_EXHAUSTED"].includes(rejected.reason.reason));
  assert.equal((await plans.listVersions()).length, 2);

  // 不带 basePlanId 的并发（直接调服务）：只有额度在把关，同样只成功一次。
  const other = harness({ actorId: "actor:other", clock });
  await other.plans.createVersion(planInput({ startsOn: "2026-10-05" }));
  const draft = planInput({ startsOn: "2026-10-05" });
  const direct = await Promise.allSettled([
    other.plans.createVersionWithOutcome(draft, { origin: "reanalysis" }),
    other.plans.createVersionWithOutcome(draft, { origin: "reanalysis" }),
  ]);
  assert.equal(direct.filter((result) => result.status === "fulfilled").length, 1);
  const quota = direct.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.equal((quota.reason as PlanServiceError).reason, "REANALYSIS_QUOTA_EXHAUSTED");
});

test("the next plan after the period ends does not use the quota, and is refused before the end", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const { followUp, plans, request } = harness({ clock });
  const v1 = await plans.createVersion(planInput({ startsOn: "2026-10-05" })); // 13 周
  await rejectsWith(followUp.create(request(v1.plan.id, "early", "next_plan")), "PLAN_NOT_ENDED");

  // 先用掉本月的重新分析。
  const v2 = await followUp.create(request(v1.plan.id, "re"));
  assert.equal((await plans.reanalysisQuota()).remaining, 0);
  // 12 月再用掉 12 月的那一次（v2 从 10/5 起 12 周，12/27 JST 结束）。
  clock.now = "2026-12-28T03:00:00.000Z";
  await followUp.create(request(v2.snapshot.plan.id, "use-dec"));
  assert.equal((await plans.reanalysisQuota()).remaining, 0);
  const current = (await plans.getCurrent())!;
  clock.now = "2027-03-29T03:00:00.000Z"; // 当前版本（12/28 起 12 周）已到期，3 月额度未用
  const next = await followUp.create(request(current.plan.id, "next", "next_plan"));
  assert.equal(next.snapshot.plan.previousPlanId, current.plan.id);
  const created = next.snapshot.log.find((entry) => entry.event === "plan_created")!;
  assert.equal(created.payload.origin, "next_plan");
  assert.match(created.idempotencyKey, /^plan-created:/);
  assert.deepEqual(await plans.reanalysisQuota(), { limit: 1, month: "2027-03", remaining: 1, used: 0 });
  // 同一份到期计划只会有一份下一份（同一个键回放；换键时 basePlanId 已不是生效计划）。
  await rejectsWith(followUp.create(request(current.plan.id, "next-2", "next_plan")), "BASE_PLAN_MISMATCH");
});

test("a failure inside the version transaction leaves no half-written new version", async () => {
  const clock = { now: "2027-01-20T03:00:00.000Z" };
  const inner = createMemoryPlanRepository();
  let fail = false;
  const repository: PlanRepository = {
    read: (scope, operation) => inner.read(scope, operation),
    transact: (scope, operation) =>
      inner.transact(scope, (tx) =>
        operation({
          ...tx,
          async insertLog(entry) {
            if (fail && entry.event === "plan_created") throw new Error("disk full");
            return tx.insertLog(entry);
          },
        }),
      ),
  };
  const { followUp, plans, request } = harness({ clock: { now: "2026-10-05T03:00:00.000Z" }, repository });
  const v1 = await plans.createVersion(planInput({ startsOn: "2026-10-05" }));
  const before = inner.dump({ actorId: ME, workspaceId: "w" });
  fail = true;
  // 到期后的下一份与重新分析都在同一个事务里写：写到最后一步失败，全部回滚。
  const ended = harness({ clock, repository });
  await assert.rejects(ended.followUp.create(ended.request(v1.plan.id, "next", "next_plan")), /disk full/);
  await assert.rejects(followUp.create(request(v1.plan.id, "re")), /disk full/);
  assert.deepEqual(inner.dump({ actorId: ME, workspaceId: "w" }), before);
  assert.equal((await plans.getCurrent())?.plan.id, v1.plan.id);
  assert.equal((await plans.reanalysisQuota()).remaining, 1);
});
