import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_GOAL_TEMPLATES } from "../../shared/compute/plan-templates";
import { PlanFlowError } from "../../features/plans/v2/flow-service";
import { countingAi, flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { SCOPE, draftInput } from "./v2-fixture";

// R23 SC-R23-04 / 05 / 06：初版、AI 修正、手動編集、確定（DESIGN §2.4、§5.2 C6 / C7）。
const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

test("the first draft is a full plan: points total 100, short names from the dictionary, citations are published entries", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const content = draft.content;
  const total = content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + content.event.allocation;
  assert.equal(total, 100);
  assert.ok(content.personTypes.every((type) => type.itemId === type.key && type.shortLabel && type.allocation % 5 === 0));
  assert.ok(content.steps.length >= 1 && content.steps.length <= 7);
  assert.ok(draft.citations.length > 0 && draft.citations.every((citation) => citation.sourceUrl.startsWith("https://")));
  assert.equal(draft.aiFixUsed, 0);
  assert.equal(draft.aiFixLimit, 3);
  assert.equal(draft.manualEditAvailable, true);
  assert.equal(world.ai.calls.firstDraft, 1);
  const again = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.equal(again.draftId, draft.draftId, "asking again returns the same draft");
  assert.equal(world.ai.calls.firstDraft, 1);
});

test("a failed first draft saves nothing and can be tried again with a new ledger key", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  ai.next.firstDraft = { ok: false, reason: "failed" };
  await assert.rejects(world.flow.makeDraft(premise.intakeId, key(), JA), rejects("AI_FAILED"));
  const after = await world.flow.getIntake(premise.intakeId, JA);
  assert.equal(after!.draftId, null);
  assert.equal(after!.aiSteps.draft.state, "failed");
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.ok(draft.draftId);
  assert.match(ai.keys.at(-1)!, /#2$/);
});

test("a first draft at the limit is reported as a limit (not a failure)", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  ai.next.firstDraft = { limit: "monthly", ok: false, reason: "limit", retryOn: "2026-10-31T15:00:00.000Z" };
  await assert.rejects(world.flow.makeDraft(premise.intakeId, key(), JA), (error: unknown) => error instanceof PlanFlowError && error.reason === "AI_LIMIT" && error.details.limit === "monthly");
});

test("changing the premise redoes the first draft without using an AI revision", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const first = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const edited = await world.flow.editPremise(premise.intakeId, { idempotencyKey: key(), key: "purpose", value: "まず黒字化" }, JA);
  assert.equal(edited.draftId, null);
  assert.equal(edited.status, "premise");
  const second = await world.flow.makeDraft(premise.intakeId, key(), JA);
  assert.notEqual(second.draftId, first.draftId);
  assert.equal(second.aiFixUsed, 0);
  assert.equal((await world.flow.getDraft(first.draftId, JA))!.status, "discarded");
});

test("AI revisions: 3 at most, a 'no change' answer also counts, a failed one does not", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const one = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "主催者には最初の 1 回は無料で試してほしい" }, JA);
  assert.equal(one.aiFixUsed, 1);
  assert.ok(one.turns[0]!.changes.length > 0 && one.turns[0]!.changes[0]!.before && one.turns[0]!.changes[0]!.after);
  assert.ok(one.turns[0]!.unchanged.length > 0);
  ai.next.fix = { ok: false, reason: "failed" };
  await assert.rejects(world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "事例は 3 件" }, JA), rejects("AI_FAILED"));
  assert.equal((await world.flow.getDraft(draft.draftId, JA))!.aiFixUsed, 1, "a failed revision does not count");
  const two = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "事例は 3 件にしたい" }, JA);
  assert.equal(two.aiFixUsed, 2);
  const three = await world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "このままで、変更しないでください" }, JA);
  assert.equal(three.aiFixUsed, 3);
  assert.deepEqual(three.turns[2]!.changes, []);
  assert.ok(three.turns[2]!.noChangeReason, "a 'no change' turn explains why and still counts");
  await assert.rejects(world.flow.fix(draft.draftId, { idempotencyKey: key(), text: "もう一回" }, JA), rejects("FIX_LIMIT"));
});

test("the same revision request replayed does not call the AI again", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const idempotencyKey = key();
  await world.flow.fix(draft.draftId, { idempotencyKey, text: "営業は 2 人でやる" }, JA);
  const again = await world.flow.fix(draft.draftId, { idempotencyKey, text: "営業は 2 人でやる" }, JA);
  assert.equal(again.aiFixUsed, 1);
  assert.equal(world.ai.calls.fix, 1);
});

test("manual edit: one save, total stays 100, remainder to the last person, and it confirms the plan", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const types = draft.content.personTypes;
  const edit = (allocations: Record<string, number>, idempotencyKey = key()) => ({
    event: { allocation: draft.content.event.allocation, targetCount: draft.content.event.targetCount },
    expectedRevision: draft.revision,
    idempotencyKey,
    personTypes: types.map((type) => ({ allocation: allocations[type.key] ?? type.allocation, key: type.key, targetCount: type.targetCount })),
    steps: draft.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  });
  await assert.rejects(world.flow.manualEdit(draft.draftId, edit({ [types[0]!.key]: types[0]!.allocation + 5 }), JA), rejects("INVALID_INPUT"), "the total must stay 100");
  await assert.rejects(world.flow.manualEdit(draft.draftId, edit({ [types[0]!.key]: types[0]!.allocation + 3, [types[1]!.key]: types[1]!.allocation - 3 }), JA), rejects("INVALID_INPUT"), "5-point steps");
  const moved = edit({ [types[0]!.key]: types[0]!.allocation + 5, [types[1]!.key]: types[1]!.allocation - 5 });
  moved.steps = [...moved.steps.slice(0, 1).map((step) => ({ ...step, title: "名前を変えた" })), ...moved.steps.slice(1), { doneCriteria: "新しい目安", key: null, personTypeKeys: [types[0]!.key], title: "追加した Step" }];
  const confirmed = await world.flow.manualEdit(draft.draftId, moved, JA);
  assert.match(confirmed.href, /^\/app\/tasks\?tab=plan&plan=/);
  const detail = await world.planService.detail(confirmed.planId);
  assert.equal(detail!.content.steps[0]!.title, "名前を変えた");
  assert.equal(detail!.content.steps.at(-1)!.title, "追加した Step");
  assert.equal(detail!.quota.manualEditAvailable, false, "the one manual edit is used");
  await assert.rejects(world.flow.manualEdit(draft.draftId, edit({}), JA), rejects("DRAFT_CLOSED"));
});

test("confirming writes one active v2 plan, archives v1, keeps a manual edit for later, and is idempotent", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const first = await world.flow.confirm(draft.draftId, key(), JA);
  const second = await world.flow.confirm(draft.draftId, key(), JA);
  assert.equal(second.planId, first.planId);
  assert.equal(second.replayed, true);
  const summary = await world.planService.summary();
  assert.equal(summary.goals.filter((goal) => goal.status === "active").length, 1);
  const detail = await world.planService.detail(first.planId);
  assert.equal(detail!.quota.manualEditAvailable, true, "confirmed without a manual edit → one kept for later");
  assert.equal(detail!.goalKind, "fundraising");
  const intake = await world.flow.getIntake(premise.intakeId, JA);
  assert.equal(intake!.status, "planned");
  assert.equal(intake!.planId, first.planId);
  const state = world.repository.dump(SCOPE);
  assert.equal(state.plans.length, 1);
  assert.ok(state.typeItems.length === PLAN_GOAL_TEMPLATES.fundraising.slots.length - 1);
});

test("a third active goal is refused at confirm time", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  await world.planService.createPlanFromDraft(draftInput({ creationKey: "x1", goalId: "other-1" }));
  await world.planService.createPlanFromDraft(draftInput({ creationKey: "x2", goalId: "other-2" }));
  await assert.rejects(world.flow.confirm(draft.draftId, key(), JA), rejects("PLAN_GOAL_LIMIT"));
});

test("App deep links: the platform decides the href shape", async () => {
  const world = flowWorld();
  const intake = await world.flow.createIntake({ goalKind: "career", goalText: "キャリアを変えたい", idempotencyKey: key(), source: "task" }, { language: "en", platform: "app" });
  assert.equal(intake.href, `/plans/flow/${intake.intakeId}`);
});
