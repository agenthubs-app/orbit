/**
 * 计划页像素返工 · 子任务 A（主会话 2026-10-12 同意）：只在 mock 补设计稿示例数据。
 * 1. fixture w17-overview-many：分数是示例的 46（s46），Step 3 的「完了しましたか？」由 mock 的
 *    `withMockStepSuggestions` 补上（规则上 VC 2 / 3 还没达标）；输出过同一份接口 schema。
 * 2. 不包这一层（= live 走的路径，以及 mock 没有指定 Step 时）：规则照旧，Step 3 不出确认卡。
 * 3. resolvePlanV2Service：没有 fixture 指定 Step 时返回的是原服务（不包）。
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { fixturesA, stepSuggestionsA } from "../../features/plans/v2/design-fixtures/a";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { overridePlansV2MockSeed, resetPlansV2MockRepositoryForTests, resolvePlanV2Service, withMockStepSuggestions } from "../../features/plans/v2/service-factory";
import { planV2DetailSchema } from "../../shared/api-schema/plan-v2";

const SCOPE = { actorId: "fixture-a", workspaceId: "w" };
const PLAN = "demo-plan-series-a";

function serviceFor(name: string) {
  const repository = createMemoryPlanV2Repository();
  repository.seed(SCOPE, fixturesA[name]!());
  return createPlanV2Service({ createContact: async () => "x", events: async () => [], now: () => new Date("2026-10-12T03:00:00Z"), repository, sample: true, scope: SCOPE });
}

describe("A: mock step suggestion for the design sample", () => {
  test("w17: score 46, Step 3 asks 「完了しましたか？」 only through the mock wrapper; the shape is the contract's", async () => {
    const plain = await serviceFor("w17-overview-many").detail(PLAN);
    assert.ok(plain);
    assert.equal(plain.score.total, 46, "the sample score (s46)");
    assert.equal((plain.stepSuggestions ?? []).some((item) => item.stepKey === "demo-step-3"), false, "the rule alone: VC 2 / 3 is not done");
    const wrapped = await withMockStepSuggestions(serviceFor("w17-overview-many"), stepSuggestionsA["w17-overview-many"]!).detail(PLAN);
    assert.ok(wrapped);
    assert.deepEqual(wrapped.stepSuggestions?.map((item) => item.stepKey), ["demo-step-3"]);
    assert.equal(wrapped.score.total, 46, "the wrapper adds a suggestion only");
    assert.ok(planV2DetailSchema.parse(wrapped));
    assert.equal(wrapped.quota.manualEditAvailable, true, "手動で編集 is available in the sample");
  });

  test("no fixture step → resolvePlanV2Service hands back the plain service (live never wraps)", async () => {
    resetPlansV2MockRepositoryForTests();
    overridePlansV2MockSeed(fixturesA["w17-overview-many"]!(), null, null);
    const resolution = resolvePlanV2Service({ actorId: "fixture-a-plain", mode: "mock" });
    assert.equal(resolution.success, true);
    const detail = resolution.success ? await resolution.service.detail(PLAN) : null;
    assert.equal((detail?.stepSuggestions ?? []).some((item) => item.stepKey === "demo-step-3"), false);
    overridePlansV2MockSeed(fixturesA["w17-overview-many"]!(), null, ["demo-step-3"]);
    const forced = resolvePlanV2Service({ actorId: "fixture-a-forced", mode: "mock" });
    const forcedDetail = forced.success ? await forced.service.detail(PLAN) : null;
    assert.deepEqual(forcedDetail?.stepSuggestions?.map((item) => item.stepKey), ["demo-step-3"]);
    overridePlansV2MockSeed(null);
    resetPlansV2MockRepositoryForTests();
  });
});
