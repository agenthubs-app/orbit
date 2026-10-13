/**
 * 复核 REWORK-REVIEW-web 问题 7：mock 生成流程的联系人来自 mock 仓储（设计稿 fixture 换了联系人，「人脈から選ぶ」的候补跟着换），
 * 不再写死演示世界；不传读取函数时（测试）仍是演示世界。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { B_FLOW_IDS, fixturesB } from "../../features/plans/v2/design-fixtures/b";
import { createMockPlanFlowContext } from "../../features/plans/v2/flow-context";
import { resolvePlanFlowService } from "../../features/plans/v2/flow-factory";
import { overridePlansV2MockSeed, resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { JA } from "./flow-fixture";

test("the mock context reads the contacts it is given, and keeps the demo world without a reader", async () => {
  const given = createMockPlanFlowContext(async () => [{ id: "c1", name: "森 美咲", organization: null, role: "UI デザイン" }]);
  assert.deepEqual((await given.draftContacts("me", "goal", new Date())).map((contact) => contact.name), ["森 美咲"]);
  assert.deepEqual(await given.contacts("me", ["c1", "other"]).then((rows) => rows.map((row) => row.id)), ["c1"]);
  const demo = createMockPlanFlowContext();
  assert.ok((await demo.draftContacts("me", "goal", new Date())).length > 2);
  assert.deepEqual((await demo.teamCandidates("me")).map((contact) => contact.id), ["demo-person-aoki"], "the demo co-founder keeps its tag");
});

test("on the mock server the default member candidates are the fixture's contacts (W-R23-06: 森 · 小林, 高木 already in the team)", async () => {
  resetPlansV2MockRepositoryForTests();
  overridePlansV2MockSeed(fixturesB["b12-140-add-member"]!());
  try {
    const resolution = resolvePlanFlowService({ actorId: "fixture-b-members", mode: "mock" });
    assert.equal(resolution.success, true);
    if (!resolution.success) return;
    const result = await resolution.service.memberCandidates(B_FLOW_IDS.background, JA);
    assert.deepEqual(result.candidates.map((candidate) => [candidate.name, candidate.fills]), [["森 美咲", ["design"]], ["小林 翔", ["sales"]]]);
  } finally {
    overridePlansV2MockSeed(null);
    resetPlansV2MockRepositoryForTests();
  }
});
