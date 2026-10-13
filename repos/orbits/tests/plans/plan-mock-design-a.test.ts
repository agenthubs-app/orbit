/**
 * 计划页像素返工 · 子任务 A：只在 mock 补设计稿示例数据，Step 完成卡一律按规则出（用户 2026-10-12 选 A，1981a0aa）。
 * 1. fixture b12-214-step-done（b12 W-R24-04c，s56c）：Step 1「CFO 1 / 1」达标、没驳回 → 规则自己出 Step 1 的「完了しましたか？」；
 *    Step 3 仍是 VC 2 / 3，不出卡；確認待ち的候补只有 1 条；输出过同一份接口 schema。
 * 2. fixture w17-overview-many（web.html #17 / b8，s46）：没有 Step 达标（Step 4 习熟済み已驳回）→ 不出卡。
 * 3. resolvePlanV2Service 的 mock 分支不再包任何一层：同一 fixture 经它读出的完成卡与规则一致。
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { eventFactsA, fixturesA } from "../../features/plans/v2/design-fixtures/a";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { overridePlansV2MockSeed, resetPlansV2MockRepositoryForTests, resolvePlanV2Service } from "../../features/plans/v2/service-factory";
import { planV2DetailSchema } from "../../shared/api-schema/plan-v2";

const SCOPE = { actorId: "fixture-a", workspaceId: "w" };
const PLAN = "demo-plan-series-a";

function serviceFor(name: string) {
  const repository = createMemoryPlanV2Repository();
  repository.seed(SCOPE, fixturesA[name]!());
  return createPlanV2Service({ createContact: async () => "x", events: async () => eventFactsA[name]?.() ?? [], now: () => new Date("2026-10-12T03:00:00Z"), repository, sample: true, scope: SCOPE });
}

describe("A: step suggestions on the design samples come from the rule", () => {
  test("b12-214 (s56c): Step 1 CFO 1 / 1 is met, so the rule asks 「完了しましたか？」 there; Step 3 (VC 2 / 3) does not", async () => {
    const overview = await serviceFor("b12-214-step-done").overview(PLAN);
    assert.ok(overview);
    assert.equal(overview.score.total, 56, "the sample score (s56c)");
    assert.deepEqual(overview.stepSuggestions?.map((item) => item.stepKey), ["demo-step-1"]);
    const progress = new Map(overview.stepProgress?.map((item) => [item.stepKey, item]));
    assert.equal(progress.get("demo-step-1")?.label, "1 / 1");
    const vc = progress.get("demo-step-3")?.parts.find((part) => part.key === "vc_partner");
    assert.deepEqual([vc?.done, vc?.total], [2, 3], "Step 3 stays VC 2 / 3");
    assert.equal(overview.pending?.filter((item) => item.kind === "candidate").length, 1, "確認待ち: one candidate (佐々木)");
    const network = Object.fromEntries(overview.content.personTypes.map((type) => [type.key, overview.typeStats?.find((stats) => stats.itemId === type.itemId)?.candidates]));
    assert.deepEqual(network, { angel: 1, cfo: 1, cvc: 0, funded_founder: 2, lawyer: 1, vc_partner: 4 }, "人脈の候補 = confirmed + unconfirmed, as the board's type cards");
    assert.ok(planV2DetailSchema.parse(overview));
  });

  test("w17 (s46): no step is met, so no card", async () => {
    const overview = await serviceFor("w17-overview-many").overview(PLAN);
    assert.ok(overview);
    assert.equal(overview.score.total, 46);
    assert.deepEqual(overview.stepSuggestions ?? [], []);
    assert.equal(overview.quota.manualEditAvailable, true, "手動で編集 is available in the sample");
  });

  test("W-R24-07 (弁護士): 会える活動 count = the rows the rail lists (2); W-R25-07 sample: 128 points, +38 over full, by the score rule", async () => {
    const law = await serviceFor("b12-222-law-skipped").typeDetail(PLAN, "demo-plan-item-lawyer");
    assert.deepEqual(law?.events.map((event) => event.title), ["Japan SaaS Summit 2026 秋", "CFO Night Tokyo vol.18"]);
    const lawStats = (await serviceFor("b12-222-law-skipped").overview(PLAN))?.typeStats?.find((stats) => stats.itemId === "demo-plan-item-lawyer");
    assert.equal(lawStats?.events, 2);
    const achieve = await serviceFor("b12-270-achieve").overview(PLAN);
    assert.equal(achieve?.score.total, 128);
    assert.equal(achieve?.score.overflow, 38);
    assert.deepEqual(achieve?.stepSuggestions ?? [], [], "steps 1–4 were already answered on the board");
  });

  test("resolvePlanV2Service (mock) serves the plain rule: the same card through the route's service", async () => {
    resetPlansV2MockRepositoryForTests();
    overridePlansV2MockSeed(fixturesA["b12-214-step-done"]!(), eventFactsA["b12-214-step-done"]!());
    const resolution = resolvePlanV2Service({ actorId: "fixture-a-mock", mode: "mock" });
    assert.equal(resolution.success, true);
    const overview = resolution.success ? await resolution.service.overview(PLAN) : null;
    assert.deepEqual(overview?.stepSuggestions?.map((item) => item.stepKey), ["demo-step-1"]);
    overridePlansV2MockSeed(null);
    resetPlansV2MockRepositoryForTests();
  });
});
