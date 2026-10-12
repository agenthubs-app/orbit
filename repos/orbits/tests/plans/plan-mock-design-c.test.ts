/**
 * 计划页像素返工 · 子任务 C（主会话 2026-10-12 同意）：mock 模式补数据到设计稿示例。
 * 1. mock 的見直し修正：提到「青葉ベンチャーズ」的示例对话照 b4「見直し · Web」给两条差分（Step 3 / Step 4 的目安），
 *    并且这份输出经真实 AI 用的同一个校验（`checkReviewFix`）通过；其余输入仍是原来的一条差分。
 * 2. fixture c-done：C10 候选是放进「每计划一次」缓存回执的数据，经同一个服务读出、过同一份接口 schema，不调 AI。
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import { checkReviewFix } from "../../features/plans/v2/ai/schemas";
import type { FixOutput, PlanFlowAi, ReviewFixInput } from "../../features/plans/v2/ai/types";
import { fixturesC } from "../../features/plans/v2/design-fixtures/c";
import { planNextGoalsResponseSchema, planReviewViewSchema } from "../../shared/api-schema/plan-v2";
import { countingAi, flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { SCOPE } from "./v2-fixture";

describe("C: mock review fix for the design sample", () => {
  test("the 青葉ベンチャーズ sample gives two changes (Step 3 / Step 4) and passes the same check as the real AI", async () => {
    const mock = createMockPlanFlowAi();
    let seen: { input: ReviewFixInput; output: FixOutput } | null = null;
    const ai: PlanFlowAi = { ...countingAi(mock), async reviewFix(input, context) {
      const outcome = await mock.reviewFix(input, context);
      if (outcome.ok === true) seen = { input, output: outcome.value };
      return outcome;
    } } as PlanFlowAi;
    const world = flowWorld({ ai: ai as never });
    const premise = await premiseReady(world);
    const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
    const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
    const opened = await world.flow.startReview(confirmed.planId, key(), JA);
    const fixed = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "リード候補は青葉ベンチャーズ（高橋さん）。CVC にも並行で当たりたいです。" }, JA);
    assert.deepEqual(fixed.draft.turns.at(-1)!.changes.map((change) => change.path), ["steps.2.doneCriteria", "steps.3.doneCriteria"]);
    assert.ok(planReviewViewSchema.parse(fixed));
    const { input, output } = seen!;
    const checked = checkReviewFix(output, { aliases: new Set(input.contacts.map((contact) => contact.alias)), enforceTemplate: false, goalKind: input.goalKind, landscape: input.landscape, slots: input.slots }, input.current, input);
    assert.equal(checked.ok, true, (checked as { issues?: string[] }).issues?.join(" | "));

    // Any other request keeps the old single change on Step 1.
    const again = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "CVC にも並行で当たりたい" }, JA);
    assert.deepEqual(again.draft.turns.at(-1)!.changes.map((change) => change.path), ["steps.0.doneCriteria"]);
  });
});

describe("C: fixture c-done", () => {
  test("next goals come from the cached receipt (no AI call) and pass the response schema", async () => {
    const ai = countingAi();
    const world = flowWorld({ ai });
    const state = fixturesC["c-done"]!();
    world.repository.seed(SCOPE, state);
    const planId = state.plans![0]!.id;
    const next = planNextGoalsResponseSchema.parse(await world.flow.nextGoals(planId, JA));
    assert.deepEqual(next.candidates.map((candidate) => [candidate.goalText, candidate.subtitle]), [["大手製造業との事業提携", "CVC 担当者経由で 2社と PoC を始める"], ["営業責任者の採用", "シリーズA 後の体制づくり"]]);
    assert.equal(ai.calls.nextGoals, 0, "the cached receipt answers; no AI");
  });
});
