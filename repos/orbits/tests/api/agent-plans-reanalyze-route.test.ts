/**
 * W0012 SC-03 / SC-04：`POST /api/agent/plans/reanalyze`、`GET /api/agent/plans/weekly-summary`、
 * `GET /api/agent/plans/current` 的惰性「进入新阶段」。
 *
 * 未登录 401；坏输入 400；重新分析 201、同键回放 200、本月第二次 409 `REANALYSIS_QUOTA_EXHAUSTED`；
 * 同时提交两次只有一个 201；到期前的下一份 409 `PLAN_NOT_ENDED`；他人计划 409（不是本人的生效计划）；
 * 目标只从服务端资料读。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanReanalyzeRouteHandlers } from "../../app/api/agent/plans/reanalyze/route-handlers";
import { createPlanRouteHandlers } from "../../app/api/agent/plans/route-handlers";
import { USER_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import type { PlanGenerator } from "../../features/plans/generator";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { aiGenerator, fakeDeepseek, MemoryAiLedger } from "../support/plan-ai-fixture";
import { createPhaseRefiner } from "../../features/plans/phase-refinement";
import { createLinkedContactNameReader, createPlanFollowUpService } from "../../features/plans/reanalysis";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { CONTACTS, EVENTS, ME, OTHER } from "../support/plan-bootstrap-fixture";
import { planInput } from "../support/plan-fixture";

function harness(clock: { now: string }, names?: Record<string, string>, generatorFor?: () => PlanGenerator, afterPlanSaved?: (actorId: string, planId: string) => Promise<void>, goalMarks: [string, string][] = []) {
  const repository = createMemoryPlanRepository();
  const goals: string[] = [];
  let tick = 0;
  const plansFor = (actorId: string) =>
    createPlanService({
      now: () => new Date(Date.parse(clock.now) + tick++).toISOString(),
      phaseRefiner: createPhaseRefiner(createMockPlanGenerator()),
      references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository,
      scope: { actorId, workspaceId: "w" },
    });
  const reanalyzeFor = (actorId: string | null) =>
    createPlanReanalyzeRouteHandlers({
      readGoal: async (id) => {
        goals.push(id);
        return "三个月内拿到 10 家企业客户的试用（3 个月内）";
      },
      isDemo: async () => false,
      markInsightsGoalDirty: async (actorId, goal) => { goalMarks.push([actorId, goal]); },
      ...(afterPlanSaved ? { afterPlanSaved } : {}),
      resolveActor: async () => (actorId ? { id: actorId } : null),
      serviceForActor: (id) => {
        const plans = plansFor(id);
        const references = createAllowListPlanReferenceValidator({ actorId: id, allowList: { contactsByActor: "any", eventIds: "any" } });
        return {
          mode: "mock" as const,
          service: {
            followUp: createPlanFollowUpService({
              actorId: id,
              generator: generatorFor?.() ?? createMockPlanGenerator(),
              now: () => new Date(clock.now),
              plans,
              readLinkedContactNames: names ? async () => names : undefined,
              references,
              source: {
                listContacts: async () => ({ contacts: CONTACTS.map((entry) => ({ ...entry, ownerId: id })), total: CONTACTS.length }),
                listEvents: async () => EVENTS,
              },
            }),
            metered: Boolean(generatorFor),
            quota: () => plans.reanalysisQuota(),
          },
          success: true as const,
        };
      },
    });
  const plansRoutesFor = (actorId: string) =>
    createPlanRouteHandlers({
      resolveActor: async () => ({ id: actorId }),
      serviceForActor: (id) => ({ mode: "mock" as const, service: plansFor(id), success: true as const }),
    });
  return { goals, plansFor, plansRoutesFor, reanalyzeFor };
}

const post = (body: unknown) =>
  new Request("http://localhost/api/agent/plans/reanalyze", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

test("re-analysis: 401, 400, 201, replay 200, second submit this month 409", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const { goals, plansFor, reanalyzeFor } = harness(clock);
  const v1 = await plansFor(ME).createVersion(planInput({ startsOn: "2026-10-05" }));

  assert.equal((await reanalyzeFor(null).POST(post({ basePlanId: v1.plan.id, idempotencyKey: "k1" }))).status, 401);
  assert.deepEqual(goals, []);
  const routes = reanalyzeFor(ME);
  assert.equal((await routes.POST(post({ basePlanId: v1.plan.id }))).status, 400);
  assert.equal((await routes.POST(post({ idempotencyKey: "k1" }))).status, 400);
  assert.equal((await routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "k1", origin: "later" }))).status, 400);

  const created = await routes.POST(post({ basePlanId: v1.plan.id, goal: "请求体里的目标会被忽略", idempotencyKey: "k1" }));
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.data.version, 2);
  assert.deepEqual(body.data.quota, { limit: 1, month: "2026-10", remaining: 0, used: 1 });
  assert.equal((await plansFor(ME).getCurrent())?.plan.goalSnapshot, "三个月内拿到 10 家企业客户的试用（3 个月内）");

  const replay = await routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "k1" }));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.replayed, true);

  const again = await routes.POST(post({ basePlanId: body.data.planId, idempotencyKey: "k2" }));
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.context.reason, "REANALYSIS_QUOTA_EXHAUSTED");
  assert.equal((await plansFor(ME).listVersions()).length, 2);
});

test("two simultaneous re-analysis submits get exactly one 201", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const { plansFor, reanalyzeFor } = harness(clock);
  const v1 = await plansFor(ME).createVersion(planInput({ startsOn: "2026-10-05" }));
  const routes = reanalyzeFor(ME);
  const responses = await Promise.all([
    routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "tab-a" })),
    routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "tab-b" })),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await plansFor(ME).listVersions()).length, 2);
});

test("the next plan is refused before the period ends and free after it; another actor's plan id is refused", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const { plansFor, reanalyzeFor } = harness(clock);
  const mine = await plansFor(ME).createVersion(planInput({ startsOn: "2026-10-05" }));
  const theirs = await plansFor(OTHER).createVersion(planInput({ startsOn: "2026-10-05" }));
  const routes = reanalyzeFor(ME);
  const early = await routes.POST(post({ basePlanId: mine.plan.id, idempotencyKey: "n1", origin: "next_plan" }));
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.context.reason, "PLAN_NOT_ENDED");

  const foreign = await routes.POST(post({ basePlanId: theirs.plan.id, idempotencyKey: "f1" }));
  assert.equal(foreign.status, 409);
  assert.equal((await foreign.json()).error.context.reason, "BASE_PLAN_MISMATCH");
  assert.equal((await plansFor(OTHER).listVersions()).length, 1);

  clock.now = "2027-01-05T03:00:00.000Z"; // 13 周后
  const next = await routes.POST(post({ basePlanId: mine.plan.id, idempotencyKey: "n2", origin: "next_plan" }));
  assert.equal(next.status, 201);
  assert.equal((await next.json()).data.quota.remaining, 1);
});

test("GET current enters the new phase lazily; GET weekly-summary is null except on a Tokyo Monday", async () => {
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const { plansFor, plansRoutesFor } = harness(clock);
  await plansFor(ME).createVersion(planInput({ startsOn: "2026-09-28" }));
  const routes = plansRoutesFor(ME);

  clock.now = "2026-10-27T03:00:00.000Z"; // 周二，第 5 周：p2
  const current = await (await routes.GET_CURRENT()).json();
  assert.equal(current.data.log[0].event, "phase_entered");
  assert.equal(current.data.log[0].payload.phaseKey, "p2");
  await routes.GET_CURRENT();
  assert.equal((await plansFor(ME).getCurrent())!.log.filter((entry) => entry.event === "phase_entered").length, 1);

  assert.equal((await (await routes.GET_WEEKLY_SUMMARY()).json()).data, null);
  clock.now = "2026-11-01T15:00:00.000Z"; // 11/2（周一）00:00 JST
  const summary = await (await routes.GET_WEEKLY_SUMMARY()).json();
  assert.equal(summary.data.window.start, "2026-10-26");
  assert.deepEqual(summary.data.counts.phasesEntered, ["建立渠道"]);
});

test("W0023: the next plan through the route schedules 约 {name} in week 1 for a need linked after the plan ended", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const { plansFor, reanalyzeFor } = harness(clock, { "contact:lin": "林玫" });
  const v1 = await plansFor(ME).createVersion(planInput({ startsOn: "2026-10-05" }));
  const need = v1.items.find((item) => item.kind === "network_need")!;
  clock.now = "2027-01-05T03:00:00.000Z"; // 第 14 周，已到期
  const linked = await plansFor(ME).linkNeedContact({ contactId: "contact:lin", contactName: "林玫", needItemId: need.id });
  assert.equal(linked.action, null);
  assert.equal((await plansFor(ME).getCurrent())!.items.filter((item) => item.meta.source === "network_match").length, 0);

  const response = await reanalyzeFor(ME).POST(post({ basePlanId: v1.plan.id, idempotencyKey: "n-lin", origin: "next_plan" }));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.data).sort(), ["planId", "quota", "replayed", "version"]);
  const current = (await plansFor(ME).getCurrent())!;
  assert.equal(current.plan.id, body.data.planId);
  const meets = current.items.filter((item) => item.meta.source === "network_match");
  assert.deepEqual(meets.map((item) => [item.title, item.suggestedWeek, item.status]), [["约 林玫", 1, "not_started"]]);
  const replay = await reanalyzeFor(ME).POST(post({ basePlanId: v1.plan.id, idempotencyKey: "n-lin", origin: "next_plan" }));
  assert.equal(replay.status, 200);
  assert.equal((await plansFor(ME).getCurrent())!.items.filter((item) => item.meta.source === "network_match").length, 1);
});

test("W0023: the linked-contact name reader reads the active needs once and names in one batch", async () => {
  const calls: Array<[string, unknown]> = [];
  const reader = createLinkedContactNameReader({
    async readActiveNeedViews(actorId) {
      calls.push(["needs", actorId]);
      return [
        { eventIds: [], id: "n1", linkedContactIds: ["contact:a", "contact:b"], primaryIndustryId: null, secondaryIndustryId: null, title: "n1" },
        { eventIds: [], id: "n2", linkedContactIds: ["contact:b"], primaryIndustryId: null, secondaryIndustryId: null, title: "n2" },
      ];
    },
    async readContactViews(actorId, ids) {
      calls.push(["contacts", [actorId, ids]]);
      return [
        { displayName: "阿部", id: "contact:a", metEventId: null, organization: null, role: null },
        { displayName: " ", id: "contact:b", metEventId: null, organization: null, role: null },
      ];
    },
  });
  assert.deepEqual(await reader(ME), { "contact:a": "阿部" });
  assert.deepEqual(calls, [["needs", ME], ["contacts", [ME, ["contact:a", "contact:b"]]]]);

  const none = createLinkedContactNameReader({
    readActiveNeedViews: async () => [{ eventIds: [], id: "n1", linkedContactIds: [], primaryIndustryId: null, secondaryIndustryId: null, title: "n1" }],
    readContactViews: async () => assert.fail("no linked contacts means no contact read"),
  });
  assert.deepEqual(await none(ME), {});
});

test("W0048b SC-04: ai_regenerate — 400 without the AI provider or on a non-template plan, 201 then replay 200; quota untouched; 429 when the user pool is full", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const template = () => planInput({ analysis: { generator: "mock-template-v1", kind: "plan_bootstrap" }, startsOn: "2026-10-05" });

  const mock = harness(clock);
  const t0 = await mock.plansFor(ME).createVersion(template());
  const unavailable = await mock.reanalyzeFor(ME).POST(post({ basePlanId: t0.plan.id, idempotencyKey: "a1", origin: "ai_regenerate" }));
  assert.equal(unavailable.status, 400);
  assert.equal((await unavailable.json()).error.context.reason, "AI_REGENERATE_UNAVAILABLE");

  const ledger = new MemoryAiLedger();
  const deepseek = fakeDeepseek({});
  const ai = harness(clock, undefined, () => aiGenerator({ fetchImplementation: deepseek.fetchImplementation, ledger }));
  const v1 = await ai.plansFor(ME).createVersion(template());
  const routes = ai.reanalyzeFor(ME);
  const created = await routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "a1", origin: "ai_regenerate" }));
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.deepEqual(body.data.quota, { limit: 1, month: "2026-10", remaining: 1, used: 0 });
  const replay = await routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "a2", origin: "ai_regenerate" }));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.replayed, true);
  // 新版本已是 AI 计划：再要求 AI 重新生成 → 400。
  const notTemplate = await routes.POST(post({ basePlanId: body.data.planId, idempotencyKey: "a3", origin: "ai_regenerate" }));
  assert.equal(notTemplate.status, 400);
  assert.equal((await notTemplate.json()).error.context.reason, "INVALID_INPUT");

  ledger.preset.user = USER_POOL_DAILY_LIMIT;
  const before = deepseek.requests.length;
  const limited = await routes.POST(post({ basePlanId: body.data.planId, idempotencyKey: "r1", origin: "reanalysis" }));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.context.reason, "USER_DAILY_LIMIT");
  assert.equal(deepseek.requests.length, before);
});

test("W0050: a re-analysed plan version enqueues its 'plan' match job after the save; refusals do not", async () => {
  const clock = { now: "2026-10-05T03:00:00.000Z" };
  const saved: Array<[string, string]> = [];
  const { plansFor, reanalyzeFor } = harness(clock, undefined, undefined, async (actorId, planId) => { saved.push([actorId, planId]); });
  const v1 = await plansFor(ME).createVersion(planInput({ startsOn: "2026-10-05" }));
  const created = await (await reanalyzeFor(ME).POST(post({ basePlanId: v1.plan.id, idempotencyKey: "w50" }))).json();
  assert.deepEqual(saved, [[ME, created.data.planId]]);
  assert.equal((await reanalyzeFor(ME).POST(post({ basePlanId: created.data.planId, idempotencyKey: "w50-2" }))).status, 409);
  assert.equal(saved.length, 1);
});

test("W0051（W51-1）：每月重新分析保存成功后统一标一次目标已变的洞察；回放（同一幂等键）不再标", async () => {
  const clock = { now: "2026-09-28T03:00:00.000Z" };
  const goalMarks: [string, string][] = [];
  const { plansFor, reanalyzeFor } = harness(clock, undefined, undefined, undefined, goalMarks);
  const v1 = await plansFor(ME).createVersion(planInput());
  const routes = reanalyzeFor(ME);
  assert.equal((await routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "w51-1" }))).status, 201);
  assert.deepEqual(goalMarks, [[ME, "三个月内拿到 10 家企业客户的试用（3 个月内）"]]);
  assert.equal((await routes.POST(post({ basePlanId: v1.plan.id, idempotencyKey: "w51-1" }))).status, 200);
  assert.equal(goalMarks.length, 1);
});
