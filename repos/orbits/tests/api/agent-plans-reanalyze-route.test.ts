/**
 * W0012 计划后续接口（原 `POST /api/agent/plans/reanalyze` 的路由测试）。
 *
 * R25：v1 计划不再重新分析 / 续订——`reanalyze` 一律 409 PLAN_V1_RETIRED（`features/plans/v2/v1-retired.ts`，由
 * `v1-retired` 测试锁住），它的处理函数 `reanalyze/route-handlers.ts` 删除，只测它的用例随之删除。这里只留与那个处理函数
 * 无关的两条：`GET current` 的惰性进入阶段与周一小结，以及续订时用到的「已关联联系人姓名」读取器。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanRouteHandlers } from "../../app/api/agent/plans/route-handlers";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { createPhaseRefiner } from "../../features/plans/phase-refinement";
import { createLinkedContactNameReader } from "../../features/plans/reanalysis";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { ME } from "../support/plan-bootstrap-fixture";
import { planInput } from "../support/plan-fixture";

function harness(clock: { now: string }) {
  const repository = createMemoryPlanRepository();
  let tick = 0;
  const plansFor = (actorId: string) =>
    createPlanService({
      now: () => new Date(Date.parse(clock.now) + tick++).toISOString(),
      phaseRefiner: createPhaseRefiner(createMockPlanGenerator()),
      references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository,
      scope: { actorId, workspaceId: "w" },
    });
  const plansRoutesFor = (actorId: string) =>
    createPlanRouteHandlers({
      resolveActor: async () => ({ id: actorId }),
      serviceForActor: (id) => ({ mode: "mock" as const, service: plansFor(id), success: true as const }),
    });
  return { plansFor, plansRoutesFor };
}

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
