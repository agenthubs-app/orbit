import assert from "node:assert/strict";
import test from "node:test";

import { checkFix } from "../../features/plans/v2/ai/schemas";
import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import type { DraftOutput, PlanAiOutcome } from "../../features/plans/v2/ai/types";
import { createMockPlanFlowContext, memoSummary, type PlanFlowContextSource } from "../../features/plans/v2/flow-context";
import { configuredPlanFlowAi } from "../../features/plans/v2/flow-factory";
import { PlanFlowError, PLAN_TEAM_MEMBER_LIMIT } from "../../features/plans/v2/flow-service";
import { PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES, planShortNameCandidates } from "../../shared/compute/plan-templates";
import { countingAi, flowWorld, JA, key, premiseReady } from "./flow-fixture";

// R23 复核修复（M1–M6、m1、m2、m17）的回归测试。
const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

test("M1: a failed 「もう一度」 replayed with the same key makes no AI call and returns the same state", async () => {
  const ai = countingAi();
  ai.next.background = { ok: false, reason: "failed" };
  const world = flowWorld({ ai });
  const intake = await world.flow.createIntake({ goalKind: "launch", goalText: "黒字化したい", idempotencyKey: key(), source: "task" }, JA);
  ai.next.background = { ok: false, reason: "failed" };
  const retryKey = key("retry");
  const first = await world.flow.retryBackground(intake.intakeId, retryKey, JA);
  const calls = ai.calls.background;
  const again = await world.flow.retryBackground(intake.intakeId, retryKey, JA);
  assert.equal(ai.calls.background, calls, "no extra AI call");
  assert.equal(again.updatedAt, first.updatedAt);
});

test("M2: a busy background draft is not written as a failure; a busy 「質問へ」 is AI_BUSY", async () => {
  const ai = countingAi();
  ai.next.background = { ok: false, reason: "busy" } as PlanAiOutcome<never>;
  const world = flowWorld({ ai });
  const intake = await world.flow.createIntake({ goalKind: "launch", goalText: "黒字化したい", idempotencyKey: key(), source: "task" }, JA);
  assert.equal(intake.status, "drafting");
  assert.equal(intake.aiSteps.background.state, "none", "busy is not a fallback");
  const done = await world.flow.retryBackground(intake.intakeId, key(), JA);
  assert.equal(done.aiSteps.background.state, "done");
  const confirmed = await (async () => {
    let current = await world.flow.confirmBlock(done.intakeId, { block: "me", expectedUpdatedAt: done.updatedAt, idempotencyKey: key(), me: { stance: "owner", wants: "黒字化" } }, JA);
    current = await world.flow.confirmBlock(current.intakeId, { block: "team", expectedUpdatedAt: current.updatedAt, idempotencyKey: key(), team: { members: [{ capabilities: [], memberId: "self", otherCapabilities: [], relation: null }], mode: "solo" } }, JA);
    return world.flow.confirmBlock(current.intakeId, { block: "purpose", expectedUpdatedAt: current.updatedAt, idempotencyKey: key(), purpose: { selectedLevel: current.background.purpose.value.selectedLevel ?? 2 } }, JA);
  })();
  ai.next.questions = { ok: false, reason: "busy" } as PlanAiOutcome<never>;
  await assert.rejects(world.flow.chooseQuestions(confirmed.intakeId, key(), JA), rejects("AI_BUSY"));
  assert.equal((await world.flow.getIntake(confirmed.intakeId, JA))!.status, "background");
});

function draftFor(): { draft: DraftOutput; input: Parameters<typeof checkFix>[1] } {
  const slots = PLAN_GOAL_TEMPLATES.fundraising.slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT).map((slot) => ({ allocation: slot.allocation, emoji: slot.emoji, shortNames: planShortNameCandidates(slot.slot, []).map((id) => ({ id, label: id })), slot: slot.slot, targetCount: slot.targetCount }));
  const landscape = [{ id: "L-101", summary: "s", title: "t", version: 1 }, { id: "L-102", summary: "s", title: "t", version: 1 }, { id: "L-103", summary: "s", title: "t", version: 1 }];
  return { draft: undefined as unknown as DraftOutput, input: { aliases: new Set(["C1"]), enforceTemplate: false, goalKind: "fundraising", landscape, slots } };
}

// 真实跑通（2026-10-11）后：不许改的部分不再整份拒绝，而是由服务端还原成修正前的值——结果同样「没换引用、没改聞くこと」。
test("M3: a revision may not swap citations or rewrite the questions to ask (they are put back as they were)", async () => {
  const { input } = draftFor();
  const outcome = await createMockPlanFlowAi().firstDraft({ background: "", contacts: [], eventSlot: { allocation: 10, targetCount: 2 }, gaps: [], goalKind: "fundraising", goalText: "調達", landscape: input.landscape, premise: [], purpose: null, slots: input.slots }, { actorId: "a", language: "ja", ledgerKey: "k", now: new Date() });
  const current = (outcome as { value: DraftOutput }).value;
  const swapped = structuredClone(current);
  swapped.citations = [{ id: "L-103", version: 1 }, { id: "L-102", version: 1 }];
  const swappedResult = checkFix({ reasons: [], revised: swapped, unchanged: [] }, input, current);
  assert.equal(swappedResult.ok, true);
  assert.deepEqual((swappedResult as { value: { revised: DraftOutput } }).value.revised.citations, current.citations);
  const rewritten = structuredClone(current);
  rewritten.personTypes[0]!.questions = ["a", "b", "c"];
  const rewrittenResult = checkFix({ reasons: [], revised: rewritten, unchanged: [] }, input, current);
  assert.equal(rewrittenResult.ok, true);
  assert.deepEqual((rewrittenResult as { value: { revised: DraftOutput } }).value.revised.personTypes[0]!.questions, current.personTypes[0]!.questions);
  // 类型的增删仍然拒绝（没法还原）。
  const dropped = structuredClone(current);
  dropped.personTypes = dropped.personTypes.slice(1);
  assert.equal(checkFix({ reasons: [], revised: dropped, unchanged: [] }, input, current).ok, false);
  const fine = structuredClone(current);
  fine.steps[0]!.doneCriteria = "新しい目安";
  fine.steps[1]!.personTypeKeys = [fine.personTypes[0]!.slot];
  assert.equal(checkFix({ reasons: [], revised: fine, unchanged: [] }, input, current).ok, true);
});

test("M4: 「人脈にも登録する」 never leaves an orphan contact when the member is refused, and one key makes one contact", async () => {
  const created: string[] = [];
  const context: PlanFlowContextSource = { ...createMockPlanFlowContext(), addContact: async (_actor, input) => { created.push(input.name); return `contact:${created.length}`; } };
  const world = flowWorld({ context });
  const intake = await world.flow.createIntake({ goalKind: "launch", goalText: "黒字化したい", idempotencyKey: key(), source: "task" }, JA);
  const idempotencyKey = key("member");
  const request = { alsoAddToNetwork: true, capabilities: [], idempotencyKey, mode: "manual" as const, name: "田中さん", otherCapabilities: [], relation: "advisor" as const };
  const [a, b] = await Promise.all([world.flow.addMembers(intake.intakeId, request, JA), world.flow.addMembers(intake.intakeId, request, JA)]);
  assert.ok(a && b);
  assert.deepEqual(created, ["田中さん"], "one key, one contact");
  const latest = (await world.flow.getIntake(intake.intakeId, JA))!;
  assert.equal(latest.background.team.value.members.find((member) => member.name === "田中さん")!.contactId, "contact:1");
  let current = latest;
  while (current.background.team.value.members.length < PLAN_TEAM_MEMBER_LIMIT) {
    current = await world.flow.addMembers(intake.intakeId, { ...request, alsoAddToNetwork: false, idempotencyKey: key(), name: `人 ${current.background.team.value.members.length}` }, JA);
  }
  await assert.rejects(world.flow.addMembers(intake.intakeId, { ...request, idempotencyKey: key(), name: "13 人目" }, JA), rejects("INVALID_INPUT"));
  assert.deepEqual(created, ["田中さん"], "a refused member creates no contact");
});

test("M5: contacts carry a memo-derived summary for C2 / C3 (never the memo text itself)", () => {
  assert.equal(memoSummary({ offering: ["UI デザイン"], seeking: [], topics: ["β の課題"] }), "offering: UI デザイン / topics: β の課題");
  assert.equal(memoSummary({}), null);
});

test("M6: live without the AI switch never produces mock content — the first draft is a failure card", async () => {
  const ai = configuredPlanFlowAi({});
  const outcome = await ai.firstDraft({} as never, { actorId: "a", language: "ja", ledgerKey: "k", now: new Date() });
  assert.deepEqual(outcome, { ok: false, reason: "disabled" });
  const world = flowWorld({ ai: countingAi(ai) });
  const premise = await premiseReady(world);
  await assert.rejects(world.flow.makeDraft(premise.intakeId, key(), JA), rejects("AI_FAILED"));
});

test("m1: a person type needs at least 5 points (remove it instead of setting 0)", async () => {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const [first, second] = draft.content.personTypes;
  await assert.rejects(world.flow.manualEdit(draft.draftId, {
    event: draft.content.event,
    expectedRevision: draft.revision,
    idempotencyKey: key(),
    personTypes: draft.content.personTypes.map((type) => ({ allocation: type.key === first!.key ? 0 : type.key === second!.key ? type.allocation + first!.allocation : type.allocation, key: type.key, targetCount: type.targetCount })),
    steps: draft.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  }, JA), rejects("INVALID_INPUT"));
});

test("m2: a failed first draft replayed with the same key returns the same error and makes no AI call", async () => {
  const ai = countingAi();
  const world = flowWorld({ ai });
  const premise = await premiseReady(world);
  ai.next.firstDraft = { ok: false, reason: "failed" };
  const draftKey = key("draft");
  await assert.rejects(world.flow.makeDraft(premise.intakeId, draftKey, JA), rejects("AI_FAILED"));
  await assert.rejects(world.flow.makeDraft(premise.intakeId, draftKey, JA), rejects("AI_FAILED"));
  assert.equal(ai.calls.firstDraft, 1);
});

test("m17: AI inputs never carry contact, intake or draft ids", async () => {
  const inputs: unknown[] = [];
  const base = createMockPlanFlowAi();
  const spy = countingAi({ ...base, background: async (input, context) => { inputs.push(input); return base.background(input, context); }, firstDraft: async (input, context) => { inputs.push(input); return base.firstDraft(input, context); }, members: async (input, context) => { inputs.push(input); return base.members(input, context); } });
  const world = flowWorld({ ai: spy });
  const premise = await premiseReady(world);
  await world.flow.addMembers(premise.intakeId, { contactIds: ["demo-person-matsui"], idempotencyKey: key(), mode: "network" }, JA).catch(() => undefined);
  await world.flow.makeDraft(premise.intakeId, key(), JA);
  const text = JSON.stringify(inputs);
  assert.ok(inputs.length >= 2);
  assert.ok(!/demo-person-|intake_|draft_/.test(text), text.slice(0, 300));
});
