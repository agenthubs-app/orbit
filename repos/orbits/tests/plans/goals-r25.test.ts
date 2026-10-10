/**
 * R25 達成、下一目标、改目标、多目标与以前のプラン（DESIGN §2.9–2.11、SC-R25-03 / 04 / 05）。
 * PLANNER 把它们列成 achievement / goal-edit / multi-goal / legacy 四个测试；共用同一个夹具，放在一个文件里按 describe 分组。
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { PlanFlowError } from "../../features/plans/v2/flow-service";
import { flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { SCOPE } from "./v2-fixture";

const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

async function confirmedPlan(world: ReturnType<typeof flowWorld>) {
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  return { detail: (await world.planService.detail(confirmed.planId))!, planId: confirmed.planId };
}

describe("achievement", () => {
  test("achieving freezes the score, frees the active slot, and the done page has the numbers", async () => {
    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    const [first, second] = detail.content.personTypes;
    await world.planService.award({ itemId: first!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
    await world.planService.skip({ idempotencyKey: key(), itemId: second!.itemId, planId });
    await assert.rejects(world.flow.achieve(planId, { expectedRevision: detail.revision + 9, idempotencyKey: key() }), rejects("STALE"));
    const achieveKey = key();
    const done = await world.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: achieveKey });
    assert.deepEqual(await world.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: achieveKey }), done, "replay");
    await assert.rejects(world.planService.award({ itemId: first!.itemId, planId, request: { basis: "talked", contactId: "demo-person-sato", idempotencyKey: key() } }), "no points after achieving");
    await assert.rejects(world.flow.startReview(planId, key(), JA), rejects("PLAN_ACHIEVED"));
    assert.equal((await world.flow.quota()).activeGoals, 0, "an achieved goal does not take an active slot");

    const view = (await world.planService.achievement(planId, "ja"))!;
    assert.equal(view.talkedPeople, 1);
    assert.equal(view.events, 0);
    assert.deepEqual(view.skippedAreas, [second!.shortLabel]);
    assert.ok(view.total > 0);
    assert.match(view.bestMove!.text, new RegExp(first!.shortLabel));
    assert.equal(view.bestMove!.basis.length, 1);
    assert.equal(await world.planService.achievement(planId.replace(/.$/, "x"), "ja"), null);
  });

  test("next goal candidates: AI once per plan (cached); a failure leaves only 'decide myself'", async () => {
    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    await assert.rejects(world.flow.nextGoals(planId, JA), rejects("PLAN_NOT_FOUND"), "only after achieving");
    await world.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: key() });
    const first = await world.flow.nextGoals(planId, JA);
    assert.equal(first.source, "ai");
    assert.equal(first.candidates.length, 2);
    await world.flow.nextGoals(planId, JA);
    assert.equal(world.ai.calls.nextGoals, 1, "cached per plan");

    const other = flowWorld();
    const plan = await confirmedPlan(other);
    await other.flow.achieve(plan.planId, { expectedRevision: plan.detail.revision, idempotencyKey: key() });
    other.ai.next.nextGoals = { ok: false, operationId: "op", reason: "failed" } as never;
    const failed = await other.flow.nextGoals(plan.planId, JA);
    assert.deepEqual(failed, { candidates: [], source: "none" });
  });
});

describe("goal edit", () => {
  test("save_only changes the goal but not the allocation; save_and_rebuild opens a review draft and costs nothing until sent", async () => {
    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    const saved = await world.flow.editGoal(planId, { expectedRevision: detail.revision, goalText: "年内にシリーズA を閉じる", idempotencyKey: key(), mode: "save_only" }, JA);
    assert.equal(saved.reviewDraftId, null);
    const after = (await world.planService.detail(planId))!;
    assert.equal(after.goal, "年内にシリーズA を閉じる");
    assert.deepEqual(after.content.personTypes.map((type) => type.allocation), detail.content.personTypes.map((type) => type.allocation), "save_only keeps the points");
    assert.equal(world.repository.dump(SCOPE).revisions.at(-1)!.source, "goal_edit");
    await assert.rejects(world.flow.editGoal(planId, { expectedRevision: detail.revision, goalText: "x", idempotencyKey: key(), mode: "save_only" }, JA), rejects("STALE"));

    const rebuilt = await world.flow.editGoal(planId, { expectedRevision: saved.revision, goalText: "来春までにシリーズA", idempotencyKey: key(), mode: "save_and_rebuild" }, JA);
    assert.ok(rebuilt.reviewDraftId);
    const review = (await world.flow.getReview(rebuilt.reviewDraftId!, JA))!;
    assert.equal(review.draft.premise.find((row) => row.key === "purpose")!.value, "来春までにシリーズA");
    assert.equal(review.reviewLeftThisMonth, 3, "opening the rebuild costs nothing");
    await world.flow.reviewFix(rebuilt.reviewDraftId!, { idempotencyKey: key(), premise: [], text: "目標に合わせて" }, JA);
    assert.equal((await world.flow.quota()).reviewLeftThisMonth, 2, "sending is what costs");
  });
});

describe("multi goal", () => {
  test("two active goals, switching follows summary.current, a third is refused with no paywall", async () => {
    const world = flowWorld();
    const a = await confirmedPlan(world);
    const b = await confirmedPlan(world);
    const quota = await world.flow.quota();
    assert.equal(quota.activeGoals, 2);
    assert.equal(quota.activeGoalLimit, 2);
    await world.planService.markOpened(a.planId);
    assert.equal((await world.planService.summary()).current!.planId, a.planId);
    await world.planService.markOpened(b.planId);
    assert.equal((await world.planService.summary()).current!.planId, b.planId);
    // 第 3 个目标在开始生成流程时就被拒（不出付费入口）。
    await assert.rejects(premiseReady(world), (error: unknown) => {
      assert.ok(error instanceof PlanFlowError && error.reason === "PLAN_GOAL_LIMIT");
      assert.doesNotMatch(JSON.stringify(error.details ?? {}), /upgrade|billing|plan_tier|ご利用プラン/i, "no paywall data");
      return true;
    });
  });
});

describe("legacy", () => {
  const legacy = {
    actionsDone: 1,
    actionsTotal: 2,
    analysisSummary: "旧い分析",
    archivedAt: "2026-10-08T00:00:00.000Z",
    goal: "旧い目標",
    items: [
      { kind: "action" as const, phase: "p1", status: "done", title: "やったこと" },
      { kind: "action" as const, phase: "p1", status: "not_started", title: "まだのこと" },
      { kind: "network_need" as const, phase: null, status: "open", title: "会いたい人" },
    ],
    needs: 1,
    planId: "v1-plan",
    startsOn: "2026-09-01",
    status: "archived" as const,
  };

  test("v1 plans are read-only summaries, still readable after a v2 plan is confirmed", async () => {
    const world = flowWorld();
    world.repository.seed(SCOPE, { activeV1PlanId: "v1-plan", legacy: [legacy] });
    await confirmedPlan(world);
    const list = await world.planService.legacyList();
    assert.equal(list.plans.length, 1);
    assert.equal("items" in list.plans[0]!, false, "the list has no items");
    const detail = (await world.planService.legacyDetail("v1-plan"))!;
    assert.equal(detail.items.length, 3);
    assert.equal(detail.actionsDone, 1);
    assert.equal(await world.planService.legacyDetail("nope"), null);
    assert.equal((await world.planService.summary()).goals.some((goal) => goal.planId === "v1-plan"), false, "v1 is never turned into v2");
  });
});
