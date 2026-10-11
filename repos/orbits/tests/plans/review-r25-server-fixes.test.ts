/**
 * R25 独立复核的服务端修复（REVIEW.md S1 / M1–M4 / m2 / m3）：
 * - S1：见直草稿的手动编辑与确定在同一个事务里，确定的校验不过就整体回滚（草稿仍可再手动编辑）；草稿带 `slotState`，
 *   界面用它填配点槽后，有跳过类型的计划上「+5 一个类型」能确定、跳过的配点不变；
 * - M1：见直剩余 = min(用户次数, AI 成本上限)，账本先用完时显示 0 + `ai_budget`，送出不调 AI；
 * - M2：イベント枠的配点不能低于已得（确定、C9 校验器都拦）；
 * - M3：改目标（只保存）作废进行中的見直し；旧草稿送出 → STALE、不扣、AI 0 次；`currentReview` 不返回过期草稿；
 * - M4：C8 / C10 的输入只有 R… / C… 别名（没有 plog_ / 联系人 id / 计划 id），带面谈メモ摘要，依据映射回真实 id；
 * - m2：「確定以来の Step」按最终状态计；m3：次の目標的缓存按语言分。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { changeAllocation, type PlanAllocationSlot } from "../../shared/compute/plan-allocation";
import { PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES, planShortNameCandidates } from "../../shared/compute/plan-templates";
import type { PlanDraftView } from "../../shared/contract/plan-v2";
import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import { checkReviewFix } from "../../features/plans/v2/ai/schemas";
import type { NextGoalsInput, ReviewMarksInput } from "../../features/plans/v2/ai/types";
import { createMockPlanFlowContext, type PlanFlowContextSource } from "../../features/plans/v2/flow-context";
import { PlanFlowError } from "../../features/plans/v2/flow-service";
import { createPlanV2Service, planReviewQuota, planSinceConfirmed } from "../../features/plans/v2/service";
import { allocationSlotsOf } from "../../features/plans/v2/validate-content";
import { countingAi, flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { ANY_REFERENCES, SCOPE } from "./v2-fixture";

const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

async function confirmedPlan(world: ReturnType<typeof flowWorld>) {
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  return { detail: (await world.planService.detail(confirmed.planId))!, planId: confirmed.planId };
}

/** 界面的做法：配点槽 + 服务端给的 slotState（S1 的修法 1）。 */
function screenSlots(draft: PlanDraftView): PlanAllocationSlot[] {
  const state = new Map((draft.slotState ?? []).map((slot) => [slot.key, slot]));
  return allocationSlotsOf(draft.goalKind as never, draft.content).map((slot) => {
    const known = state.get(slot.key);
    return known ? { ...slot, earnedBase: known.earned, metCount: known.metCount, skipped: known.skipped } : slot;
  });
}

function editRequest(draft: PlanDraftView, slots: readonly PlanAllocationSlot[]) {
  const bySlot = new Map(slots.map((slot) => [slot.key, slot]));
  return {
    event: { allocation: bySlot.get("event")!.allocation, targetCount: bySlot.get("event")!.targetCount },
    expectedRevision: draft.revision,
    idempotencyKey: key("edit"),
    personTypes: draft.content.personTypes.map((type) => ({ allocation: bySlot.get(type.slot)!.allocation, key: type.key, targetCount: bySlot.get(type.slot)!.targetCount })),
    steps: draft.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  };
}

test("S1: review / manual-edit drafts carry slotState (earned, met, skipped, event); intake drafts do not", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const initial = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.equal((await world.flow.getDraft(initial.draftId, JA))!.slotState, undefined, "intake drafts have no slotState");
  const { planId } = await world.flow.confirm(initial.draftId, key(), JA);
  const detail = (await world.planService.detail(planId))!;
  const [first, second] = detail.content.personTypes;
  await world.planService.award({ itemId: first!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
  await world.planService.skip({ idempotencyKey: key(), itemId: second!.itemId, planId });
  await world.planService.addEventToPlan({ eventId: "evt-1", planId, title: "Demo Day" });
  await world.planService.recordEventAttendanceForPlans({ eventId: "evt-1", title: "Demo Day" });

  const manual = await world.flow.openManualEdit(planId, key(), JA);
  const state = new Map(manual.slotState!.map((slot) => [slot.key, slot]));
  assert.ok(state.get(first!.slot)!.earned > 0);
  assert.equal(state.get(first!.slot)!.metCount, 1);
  assert.equal(state.get(second!.slot)!.skipped, true);
  assert.equal(state.get(second!.slot)!.earned, 0, "skip points are not earnedBase");
  assert.ok(state.get("event")!.earned > 0 && state.get("event")!.metCount === 1, "the event block is a slot too");
  assert.deepEqual((await world.flow.getDraft(manual.draftId, JA))!.slotState, manual.slotState, "getDraft returns the same state");
  const review = await world.flow.startReview(planId, key(), JA);
  assert.ok(review.draft.slotState && review.draft.slotState.length === manual.slotState!.length);
});

test("S1: +5 on one type of a plan with a skipped type confirms; the skipped allocation stays (post-confirm manual edit)", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const largest = [...detail.content.personTypes].sort((a, b) => b.allocation - a.allocation)[0]!;
  await world.planService.skip({ idempotencyKey: key(), itemId: largest.itemId, planId });
  const manual = await world.flow.openManualEdit(planId, key(), JA);
  const target = manual.content.personTypes.find((type) => type.slot !== largest.slot)!;
  const moved = changeAllocation(screenSlots(manual), target.slot, target.allocation + 5);
  assert.ok(moved.ok === true, "the shared reallocation finds a donor that is not skipped");
  await world.flow.manualEdit(manual.draftId, editRequest(manual, moved.slots), JA);
  const after = (await world.planService.detail(planId))!;
  assert.equal(after.content.personTypes.find((type) => type.slot === largest.slot)!.allocation, largest.allocation, "the skipped type keeps its points");
  assert.equal(after.content.personTypes.find((type) => type.slot === target.slot)!.allocation, target.allocation + 5);
});

test("S1: a review-draft manual edit that confirm refuses rolls back — the draft can still be edited by hand and confirmed", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const first = detail.content.personTypes[0]!;
  await world.planService.skip({ idempotencyKey: key(), itemId: first.itemId, planId });
  const review = await world.flow.startReview(planId, key(), JA);
  const fixed = await world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA);
  // 界面不知道跳过（旧做法）：把跳过的类型 +5、第 2 个类型 −5 → 确定必拒。
  const blind = allocationSlotsOf(fixed.draft.goalKind as never, fixed.draft.content).map((slot) => ({ ...slot }));
  blind.find((slot) => slot.key === first.slot)!.allocation += 5;
  blind.find((slot) => slot.key === fixed.draft.content.personTypes[1]!.slot)!.allocation -= 5;
  await assert.rejects(world.flow.manualEdit(review.draft.draftId, editRequest(fixed.draft, blind), JA), rejects("INVALID_INPUT"));

  const again = (await world.flow.getReview(review.draft.draftId, JA))!;
  assert.equal(again.draft.status, "open");
  assert.equal(again.draft.manualEditAvailable, true, "manualEditUsed was rolled back");
  assert.equal(again.draft.revision, fixed.draft.revision, "nothing was saved");
  assert.equal(world.repository.dump(SCOPE).drafts.find((draft) => draft.id === review.draft.draftId)!.manualEditUsed, false);

  const target = again.draft.content.personTypes.find((type) => type.slot !== first.slot)!;
  const moved = changeAllocation(screenSlots(again.draft), target.slot, target.allocation + 5);
  assert.ok(moved.ok === true);
  const confirmed = await world.flow.manualEdit(review.draft.draftId, editRequest(again.draft, moved.slots), JA);
  assert.equal(confirmed.planId, planId);
  const after = (await world.planService.detail(planId))!;
  assert.equal(after.content.personTypes.find((type) => type.slot === first.slot)!.allocation, first.allocation);
  assert.equal(after.quota.manualEditAvailable, false, "this review used its manual edit");
});

test("M2: the event block cannot go below its earned points (confirm and the C9 checker)", async () => {
  const world = flowWorld();
  const { planId } = await confirmedPlan(world);
  await world.planService.addEventToPlan({ eventId: "evt-1", planId, title: "Demo Day" });
  const scored = await world.planService.recordEventAttendanceForPlans({ eventId: "evt-1", title: "Demo Day" });
  const earned = scored.reduce((sum, row) => sum + row.points, 0);
  assert.ok(earned > 0);
  const manual = await world.flow.openManualEdit(planId, key(), JA);
  const slots = allocationSlotsOf(manual.goalKind as never, manual.content).map((slot) => ({ ...slot }));
  const event = slots.find((slot) => slot.key === "event")!;
  const lowered = Math.floor((earned - 1) / 5) * 5;
  slots.find((slot) => slot.key === manual.content.personTypes[0]!.slot)!.allocation += event.allocation - lowered;
  event.allocation = lowered;
  await assert.rejects(world.flow.manualEdit(manual.draftId, editRequest(manual, slots), JA), (error: unknown) => rejects("INVALID_INPUT")(error) && /Events/.test((error as Error).message));
  assert.equal((await world.planService.detail(planId))!.content.event.allocation, manual.content.event.allocation, "nothing changed");

  // C9 校验器：イベント枠低于已得 → 不合格（其余都合格时也拦）。
  const slotInfos = PLAN_GOAL_TEMPLATES.fundraising.slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => ({ allocation: slot.allocation, emoji: slot.emoji, shortNames: planShortNameCandidates(slot.slot, []).map((id) => ({ id, label: id })), slot: slot.slot, targetCount: slot.targetCount }));
  const drafted = await createMockPlanFlowAi().firstDraft({ background: "", contacts: [], eventSlot: { allocation: 10, targetCount: 1 }, gaps: [], goalKind: "fundraising", goalText: "シリーズA", landscape: [], premise: [], purpose: null, slots: slotInfos }, { actorId: "a", language: "ja", ledgerKey: "k", now: new Date() });
  assert.ok(drafted.ok === true);
  const current = drafted.value;
  const revised = { ...current, event: { ...current.event, allocation: current.event.allocation - 5 }, personTypes: current.personTypes.map((type, index) => (index === 0 ? { ...type, allocation: type.allocation + 5 } : type)) };
  const input = { aliases: new Set<string>(), enforceTemplate: false, goalKind: "fundraising" as const, landscape: [], slots: slotInfos };
  const raw = { noChangeReason: null, reasons: [], revised, unchanged: [] };
  assert.equal(checkReviewFix(raw, input, current, { earned: {}, skippedSlots: [] }).ok, true, "the same move is fine with nothing earned");
  const checked = checkReviewFix(raw, input, current, { earned: { event: current.event.allocation }, skippedSlots: [] });
  assert.equal(checked.ok, false);
  assert.deepEqual((checked as { issues: string[] }).issues, [`event: allocation below the points already earned (${current.event.allocation})`]);
});

test("M3: a save_only goal edit discards the open review; the old draft sends STALE with no charge and no AI call", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const review = await world.flow.startReview(planId, key(), JA);
  assert.equal((await world.flow.currentReview(planId, JA))!.draft.draftId, review.draft.draftId);
  await world.flow.editGoal(planId, { expectedRevision: detail.revision, goalText: "来春までにシリーズA", idempotencyKey: key(), mode: "save_only" }, JA);
  assert.equal(await world.flow.currentReview(planId, JA), null, "a stale draft is not the current review");
  const before = world.ai.calls.reviewFix;
  await assert.rejects(world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA), rejects("STALE"));
  assert.equal(world.ai.calls.reviewFix, before, "no AI call");
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 3, "not charged");
  await assert.rejects(world.flow.confirm(review.draft.draftId, key(), JA), rejects("STALE"));
  const fresh = await world.flow.startReview(planId, key(), JA);
  assert.notEqual(fresh.draft.draftId, review.draft.draftId, "starting again opens a new draft");
});

test("M3: a review draft whose plan changed underneath (draft still open) is STALE before any AI call", async () => {
  const world = flowWorld();
  const { planId } = await confirmedPlan(world);
  const review = await world.flow.startReview(planId, key(), JA);
  // 另一处直接推进了 revision（不经过会作废草稿的路径）。
  const state = world.repository.dump(SCOPE);
  world.repository.seed(SCOPE, { ...state, plans: state.plans.map((plan) => (plan.id === planId ? { ...plan, revision: plan.revision + 1 } : plan)) });
  assert.equal(await world.flow.currentReview(planId, JA), null);
  await assert.rejects(world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "x" }, JA), rejects("STALE"));
  assert.equal(world.ai.calls.reviewFix, 0);
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 3);
});

test("M1: 2 failed + 1 successful send use up the AI budget of 3 → the quota shows 0 (ai_budget) and a send does not call AI", async () => {
  let ledger = 0;
  const ai = countingAi();
  const base = ai.reviewFix;
  // 账本：每次有响应的操作（成功或失败）都占 1 次。
  ai.reviewFix = async (input, context) => {
    ledger += 1;
    return base(input, context);
  };
  const reviewBudget = async () => ledger;
  const world = flowWorld({ ai, reviewBudget });
  const { planId } = await confirmedPlan(world);
  const review = await world.flow.startReview(planId, key(), JA);
  for (let index = 0; index < 2; index += 1) {
    ai.next.reviewFix = { ok: false, operationId: null, reason: "failed" } as never;
    await assert.rejects(world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "もっと投資家に寄せたい" }, JA), rejects("AI_FAILED"));
  }
  const afterFailures = await world.flow.quota();
  assert.equal(afterFailures.reviewLeftThisMonth, 1, "user count 3 left, budget 1 left → 1");
  assert.equal(afterFailures.reviewLimitReason, undefined);
  const sent = await world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "もっと投資家に寄せたい" }, JA);
  assert.equal(sent.reviewLeftThisMonth, 0);
  assert.equal(sent.reviewLimitReason, "ai_budget");
  const quota = await world.flow.quota();
  assert.equal(quota.reviewLeftThisMonth, 0);
  assert.equal(quota.reviewLimitReason, "ai_budget");
  const calls = world.ai.calls.reviewFix;
  await assert.rejects(world.flow.reviewFix(review.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA), rejects("REVIEW_LIMIT"));
  assert.equal(world.ai.calls.reviewFix, calls, "no AI call once the budget is used up");
  // 概要的 quota 同一口径。
  const planService = createPlanV2Service({ references: ANY_REFERENCES, repository: world.repository, reviewBudget, scope: SCOPE });
  const detail = (await planService.detail(planId))!;
  assert.equal(detail.quota.reviewLeftThisMonth, 0);
  assert.equal(detail.quota.reviewLimitReason, "ai_budget");
});

test("M1: planReviewQuota takes the smaller side and names the reason", () => {
  assert.deepEqual(planReviewQuota(0, null), { left: 3, reason: null });
  assert.deepEqual(planReviewQuota(1, 3), { left: 0, reason: "ai_budget" });
  assert.deepEqual(planReviewQuota(3, 3), { left: 0, reason: "monthly" });
  assert.deepEqual(planReviewQuota(1, 2), { left: 1, reason: null });
});

test("M4: C8 / C10 inputs carry only R / C aliases plus memo summaries; evidence maps back to real ids", async () => {
  const memoText = "topics: ARR 1億円の見込み, シリーズA の時期";
  const memoAt = "2099-01-01T00:00:00.000Z";
  const asked: Array<{ contactIds: readonly string[]; since: string; limit: number }> = [];
  const context: PlanFlowContextSource = {
    ...createMockPlanFlowContext(),
    async planMemos(_actorId, request) {
      asked.push(request);
      return [
        { at: memoAt, contactId: "demo-person-ito", id: "note-memo-1", text: memoText },
        { at: memoAt, contactId: "someone-unrelated", id: "note-memo-2", text: "should be dropped" },
      ];
    },
  };
  const inputs: { marks?: ReviewMarksInput; next?: NextGoalsInput } = {};
  const mock = createMockPlanFlowAi();
  const ai = countingAi({
    ...mock,
    async nextGoals(input, ctx) {
      inputs.next = input;
      // 依据：第一条记录（计分）+ 面谈メモ。
      return { ok: true, operationId: null, value: { candidates: [{ evidenceIds: [input.records[0]!.id, input.records.find((record) => record.kind === "memo")!.id, "R999"], goalKind: "hiring", goalText: "採用を始める" }] } };
    },
    async reviewMarks(input, ctx) {
      inputs.marks = input;
      const row = input.premise.find((item) => item.source !== "background") ?? input.premise[0]!;
      const memo = input.records.find((record) => record.kind === "memo")!;
      return { ok: true, operationId: null, value: { marks: [{ evidenceIds: [input.records[0]!.id, memo.id], key: row.key, reason: "memo", suggested: "ARR 1億円" }] } };
      void ctx;
    },
  });
  const world = flowWorld({ ai, context });
  const { detail, planId } = await confirmedPlan(world);
  const award = await world.planService.award({ itemId: detail.content.personTypes[0]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
  void award;
  const review = await world.flow.startReview(planId, key(), JA);

  const raw = JSON.stringify(inputs.marks);
  assert.doesNotMatch(raw, /plog_/, "no internal record id");
  assert.doesNotMatch(raw, /demo-person|someone-unrelated/, "no contact id");
  assert.ok(!raw.includes(planId), "no plan id");
  assert.ok(inputs.marks!.records.every((record) => /^R\d+$/.test(record.id)));
  const memoRecord = inputs.marks!.records.find((record) => record.kind === "memo")!;
  assert.equal(memoRecord.text, memoText);
  assert.equal(memoRecord.contact, "C1");
  assert.equal(inputs.marks!.records.find((record) => record.kind === "talked")!.contact, "C1", "the same contact gets the same alias");
  assert.equal(inputs.marks!.records.filter((record) => record.kind === "memo").length, 1, "memos of unrelated contacts are dropped");
  assert.ok(asked[0]!.contactIds.includes("demo-person-ito") && asked[0]!.limit === 20);

  const log = world.repository.dump(SCOPE).log;
  const awardLog = log.find((entry) => entry.event === "score_awarded")!;
  const mark = review.premiseMarks[0]!;
  assert.deepEqual(mark.evidenceIds, [awardLog.id, "note-memo-1"], "aliases are mapped back to the real ids");
  assert.deepEqual(mark.evidence!.map((item) => item.text), [awardLog.body, memoText]);

  const current = (await world.planService.detail(planId))!;
  await world.flow.achieve(planId, { expectedRevision: current.revision, idempotencyKey: key() });
  const next = await world.flow.nextGoals(planId, JA);
  const nextRaw = JSON.stringify(inputs.next);
  assert.doesNotMatch(nextRaw, /plog_|demo-person/);
  assert.ok(!nextRaw.includes(planId));
  assert.deepEqual(next.candidates[0]!.basis.map((basis) => basis.ref), [awardLog.id, "note-memo-1"], "unknown aliases are dropped, known ones mapped back");
  assert.equal(next.candidates[0]!.basis[1]!.label, memoText);
});

test("m2: steps since confirmation count the final state (complete → reopen → complete = 1)", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const step = detail.content.steps[0]!.key;
  await world.planService.setStepCompleted({ completed: true, idempotencyKey: key(), planId, stepKey: step });
  await world.planService.setStepCompleted({ completed: false, idempotencyKey: key(), planId, stepKey: step });
  await world.planService.setStepCompleted({ completed: true, idempotencyKey: key(), planId, stepKey: step });
  const other = detail.content.steps[1]!.key;
  await world.planService.setStepCompleted({ completed: true, idempotencyKey: key(), planId, stepKey: other });
  await world.planService.setStepCompleted({ completed: false, idempotencyKey: key(), planId, stepKey: other });
  assert.equal((await world.planService.detail(planId))!.sinceConfirmed!.stepsDone, 1);
  assert.equal((await world.flow.startReview(planId, key(), JA)).sinceConfirmed.stepsCompleted, 1);
  // 确定之前的完成记录不算（按计划创建时刻）。
  const plan = { createdAt: "2026-10-07T00:00:00.000Z" };
  const entry = (event: "step_completed" | "step_reopened", at: string, stepKey = "s") => ({ author: "user" as const, body: "", createdAt: at, event, id: at, idempotencyKey: at, itemId: null, linkedContactIds: [], linkedEventId: null, payload: { stepKey }, planId: "p" });
  assert.equal(planSinceConfirmed(plan, [entry("step_completed", "2026-10-06T00:00:00.000Z")]).stepsCompleted, 0);
  assert.equal(planSinceConfirmed(plan, [entry("step_completed", "2026-10-08T00:00:00.000Z"), entry("step_reopened", "2026-10-08T01:00:00.000Z")]).stepsCompleted, 0);
});

test("m3: next-goal candidates are asked once per plan, whatever the language (paid-AI ceiling)", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  await world.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: key() });
  const ja = await world.flow.nextGoals(planId, JA);
  const en = await world.flow.nextGoals(planId, { ...JA, language: "en" });
  assert.equal(world.ai.calls.nextGoals, 1, "one paid call per plan");
  assert.deepEqual(en, ja, "another language reuses the cached candidates");
});
