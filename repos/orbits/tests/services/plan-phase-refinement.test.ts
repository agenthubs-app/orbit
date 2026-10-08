/**
 * W0012 SC-05 / SC-01（进入新阶段）：一年期进入下一季度段时补充周级行动，不占额度、只补一次；
 * 三个月计划进入新阶段只记日志；惰性生产者与 `plan-phase` 维护任务都幂等、按人隔离、有上限。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanBootstrapService } from "../../features/plans/bootstrap";
import type { PlanSnapshot } from "../../features/plans/contract";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { buildMyPlanViewModel } from "../../app/(app)/app/agent/plan/plan-route-view-model";
import { BACKGROUND_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { bindDeepseekPlanChat, createAiPhaseRefiner } from "../../features/plans/ai-generator";
import type { PlanGenerator } from "../../features/plans/generator";
import {
  createPhaseRefiner,
  createPlanPhaseMaintenanceTask,
  defaultPhaseRefiner,
  PLAN_AI_REFINE_SOURCE,
  planRefineKey,
  runPlanPhaseEntriesBatch,
  phaseEnteredKey,
  phaseToEnter,
  planPhaseRefinement,
  PLAN_PHASE_TASK,
} from "../../features/plans/phase-refinement";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { buildPlanReview } from "../../features/plans/reanalysis";
import { createMemoryPlanRepository, type MemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { planWeekActions, planWeekAt } from "../../features/plans/week";
import { aiGenerator, fakeDeepseek, MemoryAiLedger, skeletonReply } from "../support/plan-ai-fixture";
import { CONTACTS, EVENTS, ME, OTHER } from "../support/plan-bootstrap-fixture";

// 2026-09-28 起：第 14 周从 12/28 开始（一年期 q2），第 27 周从 2027-03-29 开始（q3）。
const WEEK_13 = "2026-12-27T03:00:00.000Z";
const WEEK_14 = "2026-12-28T03:00:00.000Z";
const WEEK_27 = "2027-03-29T03:00:00.000Z";

function harness(actorId: string, clock: { now: string }, repository: MemoryPlanRepository) {
  const references = createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } });
  let tick = 0;
  const plans = createPlanService({
    now: () => new Date(Date.parse(clock.now) + tick++).toISOString(),
    phaseRefiner: createPhaseRefiner(createMockPlanGenerator()),
    references,
    repository,
    scope: { actorId, workspaceId: "w" },
  });
  const bootstrap = createPlanBootstrapService({
    actorId,
    generator: createMockPlanGenerator(),
    now: () => new Date(clock.now),
    plans,
    references,
    source: {
      listContacts: async () => ({ contacts: CONTACTS.map((entry) => ({ ...entry, ownerId: actorId })), total: CONTACTS.length }),
      listEvents: async () => EVENTS,
    },
  });
  return { bootstrap, plans };
}

async function yearPlan(actorId: string, clock: { now: string }, repository: MemoryPlanRepository): Promise<{ plans: ReturnType<typeof harness>["plans"]; snapshot: PlanSnapshot }> {
  const { bootstrap, plans } = harness(actorId, clock, repository);
  const { snapshot } = await bootstrap.bootstrap({
    goal: { horizon: "year", snapshot: "一年内拿到 10 家企业客户（一年内）", text: "一年内拿到 10 家企业客户" },
    idempotencyKey: `year-${actorId}`,
    locale: "zh",
    supplement: null,
  });
  return { plans, snapshot };
}

test("phaseToEnter is null in the first phase and names the current later phase", () => {
  const plan = {
    phases: [
      { endWeek: 13, granularity: "quarter" as const, key: "q1", startWeek: 1, summary: null, title: "摸清需求" },
      { endWeek: 26, granularity: "quarter" as const, key: "q2", startWeek: 14, summary: null, title: "集中接触" },
    ],
    startsOn: "2026-09-28",
  };
  assert.equal(phaseToEnter(plan, new Date(WEEK_13)), null);
  assert.equal(phaseToEnter(plan, new Date(WEEK_14))?.phase.key, "q2");
  // 东京周边界：12/28 00:00 JST = 12/27 15:00 UTC。
  assert.equal(planWeekAt("2026-09-28", new Date("2026-12-27T14:59:59.999Z")), 13);
  assert.equal(phaseToEnter(plan, new Date("2026-12-27T15:00:00.000Z"))?.phase.key, "q2");
  assert.equal(phaseEnteredKey("plan:1", "q2"), "phase-entered:plan:1:q2");
});

test("refinement only fills weeks on same-titled unweeked actions and inserts the rest", () => {
  const refinement = planPhaseRefinement(
    [
      { kind: "action", suggestedWeek: 14, title: "回顾" },
      { kind: "action", suggestedWeek: 20, title: "拿到联系方式" },
      { kind: "action", suggestedWeek: 99, title: "超出阶段" },
      { kind: "network_need", title: "需求不补" },
      { kind: "action", suggestedWeek: null, title: "没有周次不补" },
    ],
    [
      {
        answer: null, carriedFromItemId: null, completedAt: null, contactLinks: [], createdAt: "", criteria: null,
        deferralCount: 0, detail: null, id: "old", kind: "action", linkedContactIds: [], linkedEventId: null, meta: {},
        phaseKey: "q2", planId: "p", sortKey: 0, status: "not_started", suggestedWeek: null, title: "拿到联系方式", updatedAt: "",
      },
    ],
    { endWeek: 26, key: "q2", startWeek: 14 },
  );
  assert.deepEqual(refinement.weekUpdates, [{ itemId: "old", suggestedWeek: 20 }]);
  assert.deepEqual(refinement.inserts.map((entry) => [entry.title, entry.suggestedWeek]), [["回顾", 14], ["超出阶段", 26]]);
});

test("a one-year plan entering its next quarter gets week-level actions once, without using the quota", async () => {
  const repository = createMemoryPlanRepository();
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const { plans, snapshot } = await yearPlan(ME, clock, repository);
  const q2Before = snapshot.items.filter((item) => item.kind === "action" && item.phaseKey === "q2");
  assert.ok(q2Before.length > 0);
  assert.ok(q2Before.every((item) => item.suggestedWeek === null), "q2 starts at quarter granularity");

  // 还在第一季度：不记、不补。
  clock.now = WEEK_13;
  assert.deepEqual(await plans.enterCurrentPhase(), { entered: null, refined: [] });

  clock.now = WEEK_14;
  const first = await plans.enterCurrentPhase();
  assert.ok(first.entered);
  assert.equal(first.entered.event, "phase_entered");
  assert.equal(first.entered.kind, "auto");
  assert.equal(first.entered.idempotencyKey, phaseEnteredKey(snapshot.plan.id, "q2"));
  assert.equal(first.entered.payload.phaseTitle, "集中接触");
  assert.ok(first.refined.length >= q2Before.length);

  const current = (await plans.getCurrent())!;
  const q2 = current.items.filter((item) => item.kind === "action" && item.phaseKey === "q2");
  assert.ok(q2.every((item) => item.suggestedWeek !== null && item.suggestedWeek >= 14 && item.suggestedWeek <= 26));
  // 原有的季度级行动只补周次，没有重复插入。
  assert.equal(new Set(q2.map((item) => item.title)).size, q2.length);
  assert.ok(q2Before.every((item) => q2.some((entry) => entry.id === item.id)));
  // 本周列表里出现了这一季度的行动。
  assert.ok(planWeekActions(current.items, 14).some((entry) => entry.item.phaseKey === "q2"));

  // 重复进入（再读、再跑维护）只补一次。
  const again = await plans.enterCurrentPhase();
  assert.deepEqual(again, { entered: null, refined: [] });
  const after = (await plans.getCurrent())!;
  assert.equal(after.items.length, current.items.length);
  assert.equal(after.log.filter((entry) => entry.event === "phase_entered").length, 1);
  // 不占重新分析额度。
  assert.equal((await plans.reanalysisQuota()).remaining, 1);

  // 下一季度再进入一次，另写一条。
  clock.now = WEEK_27;
  const q3 = await plans.enterCurrentPhase();
  assert.equal(q3.entered?.payload.phaseKey, "q3");
});

test("concurrent lazy reads write the phase entry once", async () => {
  const repository = createMemoryPlanRepository();
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const { plans } = await yearPlan(ME, clock, repository);
  clock.now = WEEK_14;
  const results = await Promise.all([plans.enterCurrentPhase(), plans.enterCurrentPhase(), plans.enterCurrentPhase()]);
  assert.equal(results.filter((result) => result.entered).length, 1);
  assert.equal((await plans.getCurrent())!.log.filter((entry) => entry.event === "phase_entered").length, 1);
});

test("a three-month plan entering phase 2 only logs; another actor's plan is untouched", async () => {
  const repository = createMemoryPlanRepository();
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const me = harness(ME, clock, repository);
  const other = harness(OTHER, clock, repository);
  const goal = { horizon: "quarter" as const, snapshot: "三个月内拿到 10 家企业客户的试用", text: "三个月内拿到 10 家企业客户的试用" };
  const mine = await me.bootstrap.bootstrap({ goal, idempotencyKey: "q-me", locale: "zh", supplement: null });
  await other.bootstrap.bootstrap({ goal, idempotencyKey: "q-other", locale: "zh", supplement: null });

  clock.now = "2026-10-19T03:00:00.000Z"; // 第 4 周：p2
  const entered = await me.plans.enterCurrentPhase();
  assert.equal(entered.entered?.payload.phaseKey, "p2");
  assert.deepEqual(entered.refined, []);
  assert.equal((await me.plans.getCurrent())!.items.length, mine.snapshot.items.length);
  assert.equal((await other.plans.getCurrent())!.log.some((entry) => entry.event === "phase_entered"), false);
});

test("the plan-phase maintenance task is bounded, isolates failures and skips when unconfigured", async () => {
  const calls: string[] = [];
  const task = createPlanPhaseMaintenanceTask({
    limit: 2,
    resolve: () => ({
      async listActorsEnteringPhase({ limit, today }) {
        assert.equal(today, "2026-12-28");
        assert.equal(limit, 2);
        return ["actor:a", "actor:b", "actor:c"];
      },
      planServiceFor: (actorId) =>
        ({
          async enterCurrentPhase() {
            calls.push(actorId);
            if (actorId === "actor:a") throw new Error("boom");
            return { entered: { id: "log" }, refined: [] };
          },
        }) as never,
    }),
    tokyoDate: () => "2026-12-28",
  });
  assert.equal(task.name, PLAN_PHASE_TASK);
  assert.deepEqual(await task.run({ deadline: Date.parse(WEEK_14) + 10_000, now: () => new Date(WEEK_14) }), {
    entered: 1,
    examined: 2,
    failed: 1,
  });
  assert.deepEqual(calls, ["actor:a", "actor:b"]);
  const unconfigured = createPlanPhaseMaintenanceTask({ resolve: () => null, tokyoDate: () => "x" });
  assert.deepEqual(await unconfigured.run({ deadline: Date.now() + 1000, now: () => new Date() }), { skipped: "database_unconfigured" });
});

test("after the period ends the first read writes nothing: no phase entry, no refinement, review unchanged", async () => {
  const repository = createMemoryPlanRepository();
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const { plans, snapshot } = await yearPlan(ME, clock, repository);
  // 一年（52 周）从 2026-09-28 起，2027-09-26 结束；之后第一次打开。
  const expired = new Date("2027-09-27T03:00:00.000Z");
  assert.equal(phaseToEnter(snapshot.plan, new Date("2027-09-26T03:00:00.000Z"))?.phase.key, "q4");
  assert.equal(phaseToEnter(snapshot.plan, expired), null);
  const before = repository.dump({ actorId: ME, workspaceId: "w" });
  const reviewBefore = buildPlanReview((await plans.getCurrent())!, null);
  clock.now = expired.toISOString();
  assert.deepEqual(await plans.enterCurrentPhase(), { entered: null, refined: [] });
  assert.deepEqual(repository.dump({ actorId: ME, workspaceId: "w" }), before);
  assert.deepEqual(buildPlanReview((await plans.getCurrent())!, null), reviewBefore);
});

/* ------------------------------------------------------------------ */
/* W0048b SC-03：AI 计划——读取路径 0 次调用；骨架阶段只在维护任务里、到期前补细（后台池）     */
/* ------------------------------------------------------------------ */

const YEAR_PHASES = [[1, 13], [14, 26], [27, 39], [40, 52]].map(([startWeek, endWeek], index) => ({
  endWeek,
  startWeek,
  summary: `季度 ${index + 1} 摘要`,
  title: `季度 ${index + 1}`,
}));

/** 用计次的 AI 生成器（假 fetch、内存账本）建一份一年期 AI 计划；读取路径用默认补细器包一个计数 spy。 */
async function aiYearPlan(clock: { now: string }) {
  const ledger = new MemoryAiLedger();
  const state = { inTransaction: false, fetchInTransaction: 0 };
  const deepseek = fakeDeepseek({
    onRequest: () => {
      if (state.inTransaction) state.fetchInTransaction += 1;
    },
    skeleton: () => skeletonReply({ extra: { phases: YEAR_PHASES } }),
  });
  const inner = createMemoryPlanRepository();
  const repository = {
    read: inner.read.bind(inner),
    transact: <T,>(scope: Parameters<typeof inner.transact>[0], operation: Parameters<typeof inner.transact<T>>[1]) =>
      inner.transact(scope, async (tx) => {
        state.inTransaction = true;
        try {
          return await operation(tx);
        } finally {
          state.inTransaction = false;
        }
      }),
  };
  const spy = { calls: 0 };
  const mock = createMockPlanGenerator();
  const counted: PlanGenerator = {
    id: mock.id,
    phaseDetail: async (input, phase) => {
      spy.calls += 1;
      return mock.phaseDetail(input, phase);
    },
    skeleton: (input) => mock.skeleton(input),
  };
  const references = createAllowListPlanReferenceValidator({ actorId: ME, allowList: { contactsByActor: "any", eventIds: "any" } });
  let tick = 0;
  const plans = createPlanService({
    now: () => new Date(Date.parse(clock.now) + tick++).toISOString(),
    phaseRefiner: defaultPhaseRefiner(counted),
    references,
    repository,
    scope: { actorId: ME, workspaceId: "w" },
  });
  const source = { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => EVENTS };
  const bootstrap = createPlanBootstrapService({
    actorId: ME,
    generator: aiGenerator({ fetchImplementation: deepseek.fetchImplementation, ledger }),
    now: () => new Date(clock.now),
    plans,
    references,
    source,
  });
  const { snapshot } = await bootstrap.bootstrap({
    goal: { horizon: "year", snapshot: "一年内拿到 10 家企业客户（一年内）", text: "一年内拿到 10 家企业客户" },
    idempotencyKey: "ai-year",
    locale: "zh",
    supplement: null,
  });
  const refineActor = createAiPhaseRefiner({
    chat: bindDeepseekPlanChat({ apiKey: "k", fetchImplementation: deepseek.fetchImplementation, model: "m" }),
    ledger,
    log: () => undefined,
    model: "m",
    now: () => new Date(clock.now),
    planServiceFor: () => plans,
    source,
  });
  const maintenance = () =>
    runPlanPhaseEntriesBatch(
      {
        listActorsEnteringPhase: async () => [ME],
        planServiceFor: () => plans,
        refinement: { listActorsNeedingRefinement: async () => [ME], refineActor },
      },
      { limit: 50, today: clock.now.slice(0, 10) },
    );
  return { deepseek, ledger, maintenance, plans, snapshot, spy, state };
}

const refineOps = (ledger: MemoryAiLedger) => ledger.operations.filter((op) => op.purpose === "plan_refine");

test("W0048b SC-03: opening an AI plan at a phase boundary makes 0 model calls and only logs the phase entry; mock plans still refine", async () => {
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const ai = await aiYearPlan(clock);
  assert.deepEqual((ai.snapshot.plan.analysis.phases as Array<{ detailed: boolean }>).map((phase) => phase.detailed), [true, true, false, false]);
  const httpAfterCreate = ai.deepseek.requests.length;
  clock.now = WEEK_14;
  const view = await ai.plans.getCurrentView();
  assert.ok(view);
  assert.equal(ai.spy.calls, 0);
  assert.equal(ai.deepseek.requests.length, httpAfterCreate);
  assert.ok(view.log.some((entry) => entry.event === "phase_entered"));
  assert.equal(refineOps(ai.ledger).length, 0);

  // mock 年计划：行为与改前相同（读取路径用 mock 生成器补细季度段）。
  const repository = createMemoryPlanRepository();
  const mockClock = { now: "2026-09-28T03:00:00.000Z" };
  const { plans } = harness(ME, mockClock, repository);
  await yearPlan(ME, mockClock, repository);
  mockClock.now = WEEK_14;
  const refined = await plans.enterCurrentPhase();
  assert.ok(refined.refined.length > 0);
});

test("W0048b SC-03: plan-phase refines the next skeleton phase when the previous one becomes current — outside the transaction, one background operation, once", async () => {
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const ai = await aiYearPlan(clock);
  const before = ai.deepseek.requests.length;

  // 第 1 段：第 3 段的前一阶段还没开始 → 不补。
  clock.now = WEEK_13;
  await ai.maintenance();
  assert.equal(ai.deepseek.requests.length, before);
  assert.equal(refineOps(ai.ledger).length, 0);

  // 第 2 段成为当前 → 补第 3 段（到期前一整段）。
  clock.now = WEEK_14;
  const batch = await ai.maintenance();
  assert.equal(batch.summary.refined, 1);
  assert.equal(ai.deepseek.requests.length, before + 1);
  assert.equal(ai.state.fetchInTransaction, 0, "the model is called outside any plan transaction");
  const [op] = refineOps(ai.ledger);
  assert.deepEqual([op!.pool, op!.purpose, op!.trigger, op!.maxCalls, op!.status, op!.calls.length], ["background", "plan_refine", "auto", 1, "succeeded", 1]);
  const current = (await ai.plans.getCurrent())!;
  const p3 = current.items.filter((item) => item.phaseKey === "p3");
  assert.ok(p3.length > 0 && p3.every((item) => item.meta.source === PLAN_AI_REFINE_SOURCE));
  assert.ok(p3.some((item) => item.kind === "network_need"));
  assert.ok(current.log.some((entry) => entry.event === "phase_refined" && entry.idempotencyKey === planRefineKey(current.plan.id, 2)));
  // review P2-3：同一事务里阶段元数据更新为已细化，跟进规则与要认识的人持久化；view-model 输出跟进规则、不再是骨架。
  const phase3 = (current.plan.analysis.phases as Array<{ key: string; detailed: boolean; followups: string[]; who: string[] }>)[2]!;
  assert.deepEqual([phase3.key, phase3.detailed, phase3.followups, phase3.who], ["p3", true, ["当天发感谢"], ["季度 3 要认识的人"]]);
  const view = await ai.plans.getCurrentView();
  const model = buildMyPlanViewModel({ guideEnabled: true, language: "zh", now: new Date(clock.now), snapshot: view });
  assert.equal(model.state, "ready");
  const p3View = model.state === "ready" ? model.view.phases[2]! : null;
  assert.deepEqual(p3View?.followups, ["当天发感谢"]);
  assert.equal(p3View?.refinement, "none");

  // 同一天重跑：0 次调用（已补细的阶段按幂等键挡住）。
  await ai.maintenance();
  assert.equal(ai.deepseek.requests.length, before + 1);
  assert.equal(refineOps(ai.ledger).length, 1);

  // 第 3 段成为当前：不再二次补细第 3 段，只补第 4 段。
  clock.now = WEEK_27;
  await ai.maintenance();
  assert.equal(ai.deepseek.requests.length, before + 2);
  const titles = ai.deepseek.requests.slice(before).map((request) => (request.payload.phase as { title: string }).title);
  assert.deepEqual(titles, ["季度 3", "季度 4"]);
  assert.equal((await ai.plans.getCurrent())!.items.filter((item) => item.phaseKey === "p3").length, p3.length);
});

test("W0048b SC-03: a full background pool (60) → 0 calls, deferred to the next Tokyo midnight; the next day's run refines", async () => {
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const ai = await aiYearPlan(clock);
  const before = ai.deepseek.requests.length;
  ai.ledger.preset.background = BACKGROUND_POOL_DAILY_LIMIT;
  clock.now = WEEK_14; // 2026-12-28 12:00 JST
  const batch = await ai.maintenance();
  assert.equal(batch.summary.refined, 0);
  assert.equal(batch.summary.refineDeferred, 1);
  assert.equal(ai.deepseek.requests.length, before);
  assert.equal(refineOps(ai.ledger).length, 0);
  // 用户主动的计划生成不受后台池影响（见 plan-ai-generator.test.ts）；次日后台池重新计数。
  ai.ledger.preset.background = 0;
  clock.now = "2026-12-29T03:00:00.000Z";
  const next = await ai.maintenance();
  assert.equal(next.summary.refined, 1);
  assert.equal(ai.deepseek.requests.length, before + 1);
});
