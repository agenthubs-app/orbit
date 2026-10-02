/**
 * W0012 SC-03 / SC-04：重新分析的四种触发（纯函数）、东京自然月额度、同时提交只成功一次、
 * 到期后的下一份不占额度、事务失败不留半份新版本（内存仓储；Postgres 版见 plans-repository.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanItem, PlanReferenceValidator, PlanSnapshot, PlanVersionOrigin } from "../../features/plans/contract";
import { AI_PLAN_GENERATOR_ID } from "../../features/plans/ai-generator";
import type { PlanGenerator } from "../../features/plans/generator";
import { PlanGenerationInProgressError } from "../../features/plans/generator";
import { aiGenerator, fakeDeepseek, MemoryAiLedger, skeletonReply as skeletonReplyFor } from "../support/plan-ai-fixture";
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

function harness(options: {
  clock: { now: string };
  repository?: PlanRepository;
  actorId?: string;
  references?: PlanReferenceValidator;
  readLinkedContactNames?: (actorId: string) => Promise<Readonly<Record<string, string>>>;
  generator?: PlanGenerator;
}) {
  const actorId = options.actorId ?? ME;
  const repository = options.repository ?? createMemoryPlanRepository();
  const references =
    options.references ?? createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } });
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
    generator: options.generator ?? createMockPlanGenerator(),
    now: () => new Date(options.clock.now),
    plans,
    readLinkedContactNames: options.readLinkedContactNames,
    references,
    source: { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => EVENTS },
  });
  const request = (basePlanId: string, key: string, origin: PlanVersionOrigin = "reanalysis") => ({
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

/* ------------------------------------------------------------------ */
/* W0023 SC-03：新版本为带入的已关联需求在当周生成「约 TA」               */
/* ------------------------------------------------------------------ */

/** 除 `deleted` 里的 id 外都是本人的联系人；`explode` 打开时校验 kato 抛错（模拟生成步骤失败）。 */
function mutableReferences(state: { deleted: Set<string>; explode: boolean }): PlanReferenceValidator {
  return {
    async findMissingContactIds(ids) {
      // 只在校验到带入需求上的联系人（kato）时失败：生成器自己的引用照常通过。
      if (state.explode && ids.includes("contact:kato")) throw new Error("reference lookup failed");
      return ids.filter((id) => state.deleted.has(id));
    },
    async findMissingEventIds() {
      return [];
    },
  };
}

/** 包一层仓储：记录当前是否在事务里（称呼必须在事务外读）。 */
function trackingRepository() {
  const inner = createMemoryPlanRepository();
  const state = { inTransaction: false };
  const repository: PlanRepository = {
    read: (scope, operation) => inner.read(scope, operation),
    transact: (scope, operation) =>
      inner.transact(scope, async (tx) => {
        state.inTransaction = true;
        try {
          return await operation(tx);
        } finally {
          state.inTransaction = false;
        }
      }),
  };
  return { inner, repository, state };
}

const matchActionsOf = (snapshot: PlanSnapshot) => snapshot.items.filter((item) => item.meta.source === "network_match");
const START = "2026-10-05"; // 13 周计划，第 14 周从 2027-01-04 起
const IN_WEEK_2 = "2026-10-13T03:00:00.000Z";
const AFTER_END = "2027-01-05T03:00:00.000Z";

test("W0023 SC-03: the next plan schedules one 约 TA per carried, still-linked pair in its first week and skips the rest", async () => {
  const clock = { now: IN_WEEK_2 };
  const refs = { deleted: new Set<string>(), explode: false };
  const tracked = trackingRepository();
  const nameReads: string[] = [];
  const { followUp, plans, request } = harness({
    clock,
    readLinkedContactNames: async (actorId) => {
      assert.equal(tracked.state.inTransaction, false, "names are read outside the transaction");
      nameReads.push(actorId);
      return { "contact:kato": "加藤", "contact:sato": "佐藤", "contact:suzuki": "铃木", "contact:tanaka": "田中" };
    },
    references: mutableReferences(refs),
    repository: tracked.repository,
  });
  const v1 = await plans.createVersion(planInput({ startsOn: START }));
  const need = v1.items.find((item) => item.kind === "network_need")!;
  // 第 2 周：kato 关联（行动未完成）、tanaka 关联后行动直接勾完成（关联仍是 linked）、suzuki 记一次互动（已建立联系）。
  await plans.linkNeedContact({ contactId: "contact:kato", contactName: "加藤", needItemId: need.id });
  const tanaka = await plans.linkNeedContact({ contactId: "contact:tanaka", contactName: "田中", needItemId: need.id });
  await plans.updateItem({ change: { op: "set_status", status: "done" }, itemId: tanaka.action!.id });
  const suzuki = await plans.linkNeedContact({ contactId: "contact:suzuki", contactName: "铃木", needItemId: need.id });
  await plans.recordInteraction({ actionItemId: suzuki.action!.id });
  // 到期后：sato 与 gone 只记关联；gone 随后被删除。
  clock.now = AFTER_END;
  assert.equal((await plans.linkNeedContact({ contactId: "contact:sato", needItemId: need.id })).action, null);
  assert.equal((await plans.linkNeedContact({ contactId: "contact:gone", needItemId: need.id })).action, null);
  refs.deleted.add("contact:gone");

  const next = await followUp.create(request(v1.plan.id, "next-1", "next_plan"));
  const snapshot = next.snapshot;
  const newNeed = snapshot.items.find((item) => item.kind === "network_need" && item.carriedFromItemId === need.id)!;
  assert.ok(newNeed, "the linked need is carried");
  const generated = matchActionsOf(snapshot).filter((item) => item.meta.needItemId === newNeed.id && item.carriedFromItemId === null);
  assert.deepEqual(generated.map((item) => [item.title, item.meta.contactId]).sort(), [
    ["约 佐藤", "contact:sato"],
    ["约 加藤", "contact:kato"],
  ]);
  for (const action of generated) {
    assert.equal(action.suggestedWeek, 1);
    assert.equal(action.status, "not_started");
    assert.equal(action.planId, snapshot.plan.id);
    assert.equal(action.phaseKey, newNeed.phaseKey);
    assert.equal(action.carriedFromItemId, null);
    assert.equal(action.meta.source, "network_match");
    assert.deepEqual(action.contactLinks.map((link) => [link.contactId, link.state]), [[action.meta.contactId, "linked"]]);
  }
  // tanaka 的已完成行动被带入，不再生成；suzuki 已建立联系；gone 已删除。
  // review P2：带入的「约 TA」重新锚定到新版本里的需求。
  const carriedDone = matchActionsOf(snapshot).filter((item) => item.status === "done");
  assert.deepEqual(carriedDone.map((item) => item.meta.contactId).sort(), ["contact:suzuki", "contact:tanaka"]);
  assert.ok(carriedDone.every((item) => item.meta.needItemId === newNeed.id && item.carriedFromItemId !== null));
  assert.equal(matchActionsOf(snapshot).filter((item) => item.meta.contactId === "contact:gone").length, 0);
  assert.equal(matchActionsOf(snapshot).length, 4);
  const created = snapshot.log.find((entry) => entry.event === "plan_created")!;
  assert.equal(created.payload.matchActionCount, 2);
  assert.deepEqual(nameReads, [ME], "names are read once");

  // 同一个键重放：回放那一份，不重复生成。
  const replay = await followUp.create(request(v1.plan.id, "next-1", "next_plan"));
  assert.equal(replay.replayed, true);
  assert.equal(matchActionsOf((await plans.getCurrent())!).length, 4);
});

test("W0023 SC-03 (D17): re-analysis uses the same rule; unreadable names fall back to 约 TA", async () => {
  for (const reader of [async () => ({}), async () => Promise.reject(new Error("names down"))]) {
    const clock = { now: IN_WEEK_2 };
    const { followUp, plans, request } = harness({ clock, readLinkedContactNames: reader });
    const v1 = await plans.createVersion(planInput({ startsOn: START }));
    const need = v1.items.find((item) => item.kind === "network_need")!;
    await plans.linkNeedContact({ contactId: "contact:kato", contactName: "加藤", needItemId: need.id });
    const v2 = await followUp.create(request(v1.plan.id, "re-1"));
    const newNeed = v2.snapshot.items.find((item) => item.carriedFromItemId === need.id)!;
    const generated = matchActionsOf(v2.snapshot).filter((item) => item.meta.needItemId === newNeed.id);
    assert.deepEqual(generated.map((item) => [item.title, item.suggestedWeek]), [["约 TA", 1]]);
    // v1 那条未完成的「约 加藤」不带入：新版本只有这一条。
    assert.equal(matchActionsOf(v2.snapshot).length, 1);
  }
});

test("W0023 SC-03: a version without an origin (first plan, plain createVersion) generates nothing", async () => {
  const clock = { now: IN_WEEK_2 };
  const { plans } = harness({ clock });
  const v1 = await plans.createVersion(planInput({ startsOn: START }));
  assert.equal(matchActionsOf(v1).length, 0);
  const need = v1.items.find((item) => item.kind === "network_need")!;
  clock.now = AFTER_END;
  await plans.linkNeedContact({ contactId: "contact:kato", needItemId: need.id });
  const v2 = await plans.createVersion(planInput({ startsOn: "2027-01-04" }));
  assert.equal(matchActionsOf(v2).length, 0);
});

test("W0023 SC-03: generated actions never push the plan past itemsPerPlan", async () => {
  const filler = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ kind: "action" as const, phaseKey: "p1", suggestedWeek: 1, title: `行动 ${index + 1}` }));
  for (const [fillers, expected] of [[298, 1], [299, 0]] as const) {
    const clock = { now: IN_WEEK_2 };
    const { plans } = harness({ clock });
    const v1 = await plans.createVersion(planInput({ startsOn: START }));
    const need = v1.items.find((item) => item.kind === "network_need")!;
    clock.now = AFTER_END;
    await plans.linkNeedContact({ contactId: "contact:kato", needItemId: need.id });
    await plans.linkNeedContact({ contactId: "contact:sato", needItemId: need.id });
    const { snapshot } = await plans.createVersionWithOutcome(
      planInput({ basePlanId: v1.plan.id, items: filler(fillers), startsOn: "2027-01-04" }),
      { contactNames: { "contact:kato": "加藤", "contact:sato": "佐藤" }, origin: "next_plan" },
    );
    assert.equal(matchActionsOf(snapshot).length, expected);
    assert.ok(snapshot.items.length <= 300);
  }
});

test("W0023 SC-03: a failing generation step leaves both versions untouched", async () => {
  const clock = { now: IN_WEEK_2 };
  const refs = { deleted: new Set<string>(), explode: false };
  const tracked = trackingRepository();
  const { followUp, plans, request } = harness({ clock, references: mutableReferences(refs), repository: tracked.repository });
  const v1 = await plans.createVersion(planInput({ startsOn: START }));
  const need = v1.items.find((item) => item.kind === "network_need")!;
  clock.now = AFTER_END;
  await plans.linkNeedContact({ contactId: "contact:kato", needItemId: need.id });
  const before = tracked.inner.dump({ actorId: ME, workspaceId: "w" });
  refs.explode = true;
  await assert.rejects(followUp.create(request(v1.plan.id, "next-x", "next_plan")), /reference lookup failed/);
  assert.deepEqual(tracked.inner.dump({ actorId: ME, workspaceId: "w" }), before);
  assert.equal((await plans.getCurrent())?.plan.id, v1.plan.id);
});

test("W0023 review P2: a done 约 TA on a still-linked pair is never scheduled again across 4 and 5 versions", async () => {
  const clock = { now: IN_WEEK_2 };
  const { plans } = harness({ clock });
  const v1 = await plans.createVersion(planInput({ startsOn: START }));
  const need = v1.items.find((item) => item.kind === "network_need")!;
  // v1 第 2 周：tanaka 关联并生成「约 TA」，直接勾完成（关联仍是 linked）。
  const tanaka = await plans.linkNeedContact({ contactId: "contact:tanaka", contactName: "田中", needItemId: need.id });
  await plans.updateItem({ change: { op: "set_status", status: "done" }, itemId: tanaka.action!.id });
  let current = v1;
  let startsOn = START;
  for (let version = 2; version <= 5; version += 1) {
    // 每一版都到期后再制定下一份（13 周计划，往后推 14 周）。
    const next = new Date(Date.parse(`${startsOn}T03:00:00.000Z`) + 14 * 7 * 86_400_000);
    clock.now = next.toISOString();
    startsOn = clock.now.slice(0, 10);
    const { snapshot } = await plans.createVersionWithOutcome(
      planInput({ basePlanId: current.plan.id, startsOn }),
      { contactNames: { "contact:tanaka": "田中" }, origin: "next_plan" },
    );
    const meets = matchActionsOf(snapshot).filter((item) => item.meta.contactId === "contact:tanaka");
    assert.equal(meets.length, 1, `version ${version}: exactly one 约 TA for the pair`);
    assert.equal(meets[0]!.status, "done", `version ${version}: it is the carried done action`);
    assert.equal(snapshot.log.find((entry) => entry.event === "plan_created")!.payload.matchActionCount, 0);
    current = snapshot;
  }
});

/* ------------------------------------------------------------------ */
/* W0048b SC-04：老模板计划「AI 重新生成」                                    */
/* ------------------------------------------------------------------ */

function aiHarness(clock: { now: string }) {
  const ledger = new MemoryAiLedger();
  const deepseek = fakeDeepseek({});
  const generator = aiGenerator({ fetchImplementation: deepseek.fetchImplementation, ledger });
  return { deepseek, ledger, ...harness({ clock, generator, readLinkedContactNames: async () => ({ "contact:kato": "加藤" }) }) };
}

const TEMPLATE_PLAN = () => planInput({ analysis: { generator: "mock-template-v1", kind: "plan_bootstrap" }, startsOn: START });

test("W0048b SC-04: a template plan regenerated with AI makes a new version without touching this month's re-analysis quota", async () => {
  const clock = { now: IN_WEEK_2 };
  const h = aiHarness(clock);
  const v1 = await h.plans.createVersion(TEMPLATE_PLAN());
  const before = await h.plans.reanalysisQuota();
  const v2 = await h.followUp.create(h.request(v1.plan.id, "ai-click-1", "ai_regenerate"));
  assert.equal(v2.replayed, false);
  assert.equal(v2.snapshot.plan.analysis.generator, AI_PLAN_GENERATOR_ID);
  assert.equal(v2.snapshot.plan.analysis.origin, "ai_regenerate");
  assert.equal(v2.snapshot.plan.previousPlanId, v1.plan.id);
  assert.deepEqual(await h.plans.reanalysisQuota(), before);
  assert.equal(before.used, 0);
  const all = await h.repository.read({ actorId: ME, workspaceId: "w" }, (reader) => reader.hasLogIdempotencyKey(reanalysisQuotaKey(tokyoMonthKey(new Date(clock.now)))));
  assert.equal(all, false, "no reanalysis:<month> key is written");
  // 计入用户主动池 1 次操作（purpose plan）。
  assert.deepEqual(h.ledger.operations.map((op) => [op.pool, op.purpose, op.status]), [["user", "plan", "succeeded"]]);
  // review P2-2：固定键 + 尝试序号做 single-flight；点击键不进账本键。
  assert.equal(h.ledger.operations[0]!.key, `ai-regenerate:${v1.plan.id}#1`);
  // 本月的重新分析仍然可用。
  const v3 = await h.followUp.create(h.request(v2.snapshot.plan.id, "re-after-ai", "reanalysis"));
  assert.equal(v3.replayed, false);
  assert.equal((await h.plans.reanalysisQuota()).used, 1);
});

test("W0048b SC-04: a second click (new click key, stale page) replays without generating", async () => {
  const clock = { now: IN_WEEK_2 };
  const h = aiHarness(clock);
  const v1 = await h.plans.createVersion(TEMPLATE_PLAN());
  const first = await h.followUp.create(h.request(v1.plan.id, "click-a", "ai_regenerate"));
  const http = h.deepseek.requests.length;
  const second = await h.followUp.create(h.request(v1.plan.id, "click-b", "ai_regenerate"));
  assert.equal(second.replayed, true);
  assert.equal(second.snapshot.plan.id, first.snapshot.plan.id);
  assert.equal(h.deepseek.requests.length, http);
  assert.equal(h.ledger.operations.length, 1);
});

test("W0048b SC-04: not a template plan (or no AI provider) → INVALID_INPUT before any call", async () => {
  const clock = { now: IN_WEEK_2 };
  const h = aiHarness(clock);
  const v1 = await h.plans.createVersion(planInput({ analysis: { generator: AI_PLAN_GENERATOR_ID }, startsOn: START }));
  await rejectsWith(h.followUp.create(h.request(v1.plan.id, "nope", "ai_regenerate")), "INVALID_INPUT");
  assert.equal(h.deepseek.requests.length, 0);
  assert.equal(h.ledger.operations.length, 0);
  // 服务层兜底：即使绕过预检，保存事务也只接受模板计划。
  await rejectsWith(
    h.plans.createVersionWithOutcome({ ...planInput({ startsOn: START }), basePlanId: v1.plan.id }, { origin: "ai_regenerate" }),
    "INVALID_INPUT",
  );
  const mock = harness({ clock });
  const t1 = await mock.plans.createVersion(TEMPLATE_PLAN());
  await rejectsWith(mock.followUp.create(mock.request(t1.plan.id, "mock", "ai_regenerate")), "INVALID_INPUT");
});

test("W0048b SC-04: AI regeneration carries finished work and schedules 约 TA under the same rule as re-analysis", async () => {
  const clock = { now: IN_WEEK_2 };
  const h = aiHarness(clock);
  const v1 = await h.plans.createVersion(TEMPLATE_PLAN());
  const need = v1.items.find((item) => item.kind === "network_need")!;
  await h.plans.linkNeedContact({ contactId: "contact:kato", contactName: "加藤", needItemId: need.id });
  const v2 = await h.followUp.create(h.request(v1.plan.id, "ai-carry", "ai_regenerate"));
  const newNeed = v2.snapshot.items.find((item) => item.carriedFromItemId === need.id)!;
  assert.ok(newNeed, "the linked need is carried");
  const generated = matchActionsOf(v2.snapshot).filter((item) => item.meta.needItemId === newNeed.id);
  assert.deepEqual(generated.map((item) => [item.title, item.suggestedWeek]), [["约 加藤", 1]]);
});

test("W0048b review P2-2: two different click keys at once share one single-flight claim — one HTTP chain, the other is told it is in progress", async () => {
  const clock = { now: IN_WEEK_2 };
  const ledger = new MemoryAiLedger();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const deepseek = fakeDeepseek({});
  const gated = (async (url: string, init?: RequestInit) => {
    await gate;
    return deepseek.fetchImplementation(url, init);
  }) as unknown as typeof fetch;
  const h = { ...harness({ clock, generator: aiGenerator({ fetchImplementation: gated, ledger }) }) };
  const v1 = await h.plans.createVersion(TEMPLATE_PLAN());
  const first = h.followUp.create(h.request(v1.plan.id, "click-a", "ai_regenerate"));
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(h.followUp.create(h.request(v1.plan.id, "click-b", "ai_regenerate")), PlanGenerationInProgressError);
  release();
  const saved = await first;
  assert.equal(saved.replayed, false);
  assert.equal(ledger.operations.length, 1, "one operation for both clicks");
  assert.equal(deepseek.requests.length, 3, "one chain: skeleton + 2 phases");
  assert.equal(ledger.finishes.length, 1);
  // 之后再点：replay。
  const again = await h.followUp.create(h.request(v1.plan.id, "click-c", "ai_regenerate"));
  assert.equal(again.replayed, true);
});

test("W0048b review P2-2: after a failed AI regeneration the next click claims attempt #2", async () => {
  const clock = { now: IN_WEEK_2 };
  const ledger = new MemoryAiLedger();
  let fail = true;
  const deepseek = fakeDeepseek({ skeleton: () => (fail ? { status: 500 } : skeletonReplyFor()) });
  const h = harness({ clock, generator: aiGenerator({ fetchImplementation: deepseek.fetchImplementation, ledger }) });
  const v1 = await h.plans.createVersion(TEMPLATE_PLAN());
  await assert.rejects(h.followUp.create(h.request(v1.plan.id, "try-1", "ai_regenerate")));
  fail = false;
  const ok = await h.followUp.create(h.request(v1.plan.id, "try-2", "ai_regenerate"));
  assert.equal(ok.replayed, false);
  assert.deepEqual(ledger.operations.map((op) => [op.key, op.status]), [
    [`ai-regenerate:${v1.plan.id}#1`, "failed"],
    [`ai-regenerate:${v1.plan.id}#2`, "succeeded"],
  ]);
});
