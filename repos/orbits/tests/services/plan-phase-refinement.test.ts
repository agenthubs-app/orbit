/**
 * W0012 SC-05 / SC-01（进入新阶段）：一年期进入下一季度段时补充周级行动，不占额度、只补一次；
 * 三个月计划进入新阶段只记日志；惰性生产者与 `plan-phase` 维护任务都幂等、按人隔离、有上限。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanBootstrapService } from "../../features/plans/bootstrap";
import type { PlanSnapshot } from "../../features/plans/contract";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import {
  createPhaseRefiner,
  createPlanPhaseMaintenanceTask,
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
