import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_GOAL_TEMPLATES, planCapabilityGaps } from "../../shared/compute/plan-templates";
import { PlanFlowError, PLAN_NEW_GOAL_MONTHLY_LIMIT } from "../../features/plans/v2/flow-service";
import type { PlanFlowContextSource } from "../../features/plans/v2/flow-context";
import { createMockPlanFlowContext } from "../../features/plans/v2/flow-context";
import { confirmedBackground, countingAi, flowWorld, JA, key } from "./flow-fixture";
import { draftInput } from "./v2-fixture";

// R23 SC-R23-02 / 03 / 07：背景确认、选题、前提（DESIGN §2.2–2.3、§5）。
const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

test("creating an intake drafts all three background blocks with one AI call", async () => {
  const world = flowWorld();
  const intake = await world.flow.createIntake({ goalKind: "fundraising", goalText: "シリーズA の資金調達をしたい", idempotencyKey: key(), source: "task" }, JA);
  assert.equal(world.ai.calls.background, 1);
  assert.equal(intake.status, "background");
  assert.equal(intake.aiSteps.background.state, "done");
  assert.equal(intake.background.me.value.name, "Orbit デモ");
  assert.ok(intake.background.team.value.members.some((member) => member.isSelf));
  assert.ok(intake.background.team.value.members.some((member) => member.name === "青木 里奈"), "the 共同創業者 contact is drafted into the team");
  const rungs = intake.background.purpose.value.rungs;
  assert.deepEqual(rungs.map((rung) => rung.level), [4, 3, 2, 1]);
  assert.equal(rungs.find((rung) => rung.level === 2)?.text, "シリーズA の資金調達をしたい", "the original goal sits on level 2");
  assert.ok(intake.reading.some((item) => item.kind === "network"));
  assert.equal(intake.href, `/app/plans/flow/${intake.intakeId}`);
});

test("the same create request replayed does not call the AI again", async () => {
  const world = flowWorld();
  const idempotencyKey = key();
  const request = { goalKind: "fundraising" as const, goalText: "資金調達", idempotencyKey, source: "task" as const };
  const first = await world.flow.createIntake(request, JA);
  const again = await world.flow.createIntake(request, JA);
  assert.equal(again.intakeId, first.intakeId);
  assert.equal(world.ai.calls.background, 1);
  await assert.rejects(world.flow.createIntake({ ...request, goalText: "別の目標" }, JA), rejects("IDEMPOTENCY_KEY_REUSED"));
});

test("a failed background draft falls back to rules, can be retried, and blocks still work", async () => {
  const ai = countingAi();
  ai.next.background = { ok: false, reason: "failed" };
  const world = flowWorld({ ai });
  const intake = await world.flow.createIntake({ goalKind: "launch", goalText: "Orbit を黒字化したい", idempotencyKey: key(), source: "task" }, JA);
  assert.equal(intake.aiSteps.background.state, "fallback");
  assert.deepEqual(intake.background.team.value.members.map((member) => member.memberId), ["self"]);
  assert.deepEqual(intake.background.team.value.members[0]!.capabilities, []);
  assert.deepEqual(intake.background.purpose.value.rungs, [{ level: 2, text: "Orbit を黒字化したい" }]);
  assert.equal(intake.background.purpose.value.suggestedLevel, null);
  const retried = await world.flow.retryBackground(intake.intakeId, key("retry"), JA);
  assert.equal(retried.aiSteps.background.state, "done");
  assert.equal(world.ai.calls.background, 2);
  assert.match(ai.keys.at(-1)!, /:background:2$/, "the retry uses a new ledger key");
});

test("a background draft at the daily limit shows the limit, not a failure card", async () => {
  const ai = countingAi();
  ai.next.background = { limit: "daily", ok: false, reason: "limit", retryOn: "2026-10-08T15:00:00.000Z" };
  const world = flowWorld({ ai });
  const intake = await world.flow.createIntake({ goalKind: "sales", goalText: "新規顧客を 5 社", idempotencyKey: key(), source: "task" }, JA);
  assert.equal(intake.aiSteps.background.state, "fallback");
  assert.equal(intake.aiSteps.background.limit, "daily");
  assert.equal(intake.aiSteps.background.retryOn, "2026-10-08T15:00:00.000Z");
});

test("blocks are confirmed in order; the questions need all three", async () => {
  const world = flowWorld();
  const intake = await world.flow.createIntake({ goalKind: "fundraising", goalText: "資金調達したい", idempotencyKey: key(), source: "task" }, JA);
  await assert.rejects(world.flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key(), purpose: { selectedLevel: 3 } }, JA), rejects("BLOCK_ORDER"));
  await assert.rejects(world.flow.chooseQuestions(intake.intakeId, key(), JA), rejects("BACKGROUND_NOT_CONFIRMED"));
  await assert.rejects(world.flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: "2000-01-01T00:00:00.000Z", idempotencyKey: key(), me: { stance: "owner", wants: "x" } }, JA), rejects("STALE"));
});

test("toggling capabilities changes the gaps by rule, with no AI call", async () => {
  const world = flowWorld();
  const intake = await world.flow.createIntake({ goalKind: "fundraising", goalText: "資金調達したい", idempotencyKey: key(), source: "task" }, JA);
  const me = await world.flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: key(), me: { stance: "owner", wants: "資金調達したい" } }, JA);
  const before = { ...world.ai.calls };
  const all = PLAN_GOAL_TEMPLATES.fundraising.capabilities;
  const team = await world.flow.confirmBlock(me.intakeId, {
    block: "team",
    expectedUpdatedAt: me.updatedAt,
    idempotencyKey: key(),
    team: { members: [{ capabilities: all.slice(0, 6), memberId: "self", otherCapabilities: ["法務"], relation: null }], mode: "solo" },
  }, JA);
  assert.deepEqual(planCapabilityGaps("fundraising", team.background.team.value.members), all.slice(6));
  assert.deepEqual(team.background.team.value.members.map((member) => member.memberId), ["self"], "solo keeps only you");
  assert.deepEqual(world.ai.calls, before);
});

test("the ladder is rebuilt only when 'wants' changes, at most 3 times", async () => {
  const world = flowWorld();
  const intake = await world.flow.createIntake({ goalKind: "launch", goalText: "Orbit を落地して黒字化したい", idempotencyKey: key(), source: "task" }, JA);
  const same = await world.flow.recomputeLadder(intake.intakeId, { idempotencyKey: key(), wants: intake.background.me.value.wants }, JA);
  assert.equal(world.ai.calls.ladder, 0);
  assert.equal(same.limits.ladderLeft, 3);
  let current = same;
  for (const wants of ["Orbit を世に出す", "ブランドにしたい", "事業にしたい"]) current = await world.flow.recomputeLadder(intake.intakeId, { idempotencyKey: key(), wants }, JA);
  assert.equal(world.ai.calls.ladder, 3);
  assert.equal(current.limits.ladderLeft, 0);
  assert.equal(current.background.me.value.wants, "事業にしたい");
  assert.equal(current.background.purpose.confirmedAt, null, "a rebuilt ladder must be confirmed again");
  await assert.rejects(world.flow.recomputeLadder(intake.intakeId, { idempotencyKey: key(), wants: "もう一回" }, JA), rejects("LADDER_LIMIT"));
});

test("members from the network get inferred capabilities; hand-written members never become contacts unless asked", async () => {
  const added: string[] = [];
  const context: PlanFlowContextSource = { ...createMockPlanFlowContext(), addContact: async (_actor, input) => { added.push(input.name); return "contact:new"; } };
  const world = flowWorld({ context });
  const intake = await world.flow.createIntake({ goalKind: "launch", goalText: "Orbit を黒字化したい", idempotencyKey: key(), source: "task" }, JA);
  const fromNetwork = await world.flow.addMembers(intake.intakeId, { contactIds: ["demo-person-matsui", "someone-else"], idempotencyKey: key(), mode: "network" }, JA);
  const matsui = fromNetwork.background.team.value.members.find((member) => member.contactId === "demo-person-matsui");
  assert.ok(matsui && matsui.capabilities.length > 0 && matsui.source === "network");
  assert.ok(!fromNetwork.background.team.value.members.some((member) => member.contactId === "someone-else"), "only the actor's own contacts");
  assert.equal(world.ai.calls.members, 1);
  const written = await world.flow.addMembers(intake.intakeId, { alsoAddToNetwork: false, capabilities: ["design", "unknown"], idempotencyKey: key(), mode: "manual", name: "田中さん", otherCapabilities: [], relation: "advisor" }, JA);
  const tanaka = written.background.team.value.members.find((member) => member.name === "田中さん")!;
  assert.deepEqual(tanaka.capabilities, ["design"]);
  assert.equal(tanaka.contactId, null);
  assert.deepEqual(added, []);
  assert.equal(world.ai.calls.members, 1, "writing a member by hand never calls the AI");
  const withContact = await world.flow.addMembers(intake.intakeId, { alsoAddToNetwork: true, capabilities: [], idempotencyKey: key(), mode: "manual", name: "佐藤さん", otherCapabilities: [], relation: "contractor" }, JA);
  assert.deepEqual(added, ["佐藤さん"]);
  assert.equal(withContact.background.team.value.members.find((member) => member.name === "佐藤さん")?.contactId, "contact:new");
});

test("questions: at most 5 from the bank, same background → same questions in the same order (cached, no second AI call)", async () => {
  const first = flowWorld();
  const a = await confirmedBackground(first);
  const askedA = await first.flow.chooseQuestions(a.intakeId, key(), JA);
  assert.equal(askedA.status, "questions");
  assert.ok(askedA.questions!.length > 0 && askedA.questions!.length <= 5);
  const bank = PLAN_GOAL_TEMPLATES.fundraising.questions.map((question) => question.id);
  assert.ok(askedA.questions!.every((question) => bank.includes(question.id) && question.why));
  const b = await confirmedBackground(first);
  const askedB = await first.flow.chooseQuestions(b.intakeId, key(), JA);
  assert.deepEqual(askedB.questions!.map((question) => question.id), askedA.questions!.map((question) => question.id));
  assert.equal(first.ai.calls.questions, 1, "the second intake with the same background reads the cache");
});

test("questions fall back to the template order when the AI fails", async () => {
  const ai = countingAi();
  ai.next.questions = { ok: false, reason: "failed" };
  const world = flowWorld({ ai });
  const background = await confirmedBackground(world);
  const asked = await world.flow.chooseQuestions(background.intakeId, key(), JA);
  assert.equal(asked.aiSteps.questions.state, "fallback");
  assert.equal(asked.questions!.length, 5);
});

test("answers are submitted at once; blanks become guesses; the premise marks each row's source", async () => {
  const world = flowWorld();
  const background = await confirmedBackground(world);
  const asked = await world.flow.chooseQuestions(background.intakeId, key(), JA);
  const [q1, q2] = asked.questions!;
  await assert.rejects(world.flow.submitAnswers(asked.intakeId, { answers: [{ questionId: q1!.id, text: null, values: ["nope"] }], idempotencyKey: key() }, JA), rejects("INVALID_INPUT"));
  const answered = await world.flow.submitAnswers(asked.intakeId, { answers: [{ questionId: q1!.id, text: "メモ", values: [] }, { questionId: q2!.id, text: null, values: [] }], idempotencyKey: key() }, JA);
  assert.equal(answered.status, "premise");
  assert.equal(answered.premiseVersion, 1);
  const rows = answered.premise!;
  assert.deepEqual(rows.slice(0, 2).map((row) => [row.key, row.source]), [["purpose", "background"], ["team", "background"]]);
  assert.equal(rows[2]!.source, "q1");
  assert.equal(rows[2]!.guessed, false);
  assert.equal(rows[3]!.guessed, true, "a blank answer is a guess");
  assert.equal(rows.length, 2 + asked.questions!.length);
});

test("editing a premise row bumps the premise version", async () => {
  const world = flowWorld();
  const background = await confirmedBackground(world);
  const asked = await world.flow.chooseQuestions(background.intakeId, key(), JA);
  const answered = await world.flow.submitAnswers(asked.intakeId, { answers: [], idempotencyKey: key() }, JA);
  const edited = await world.flow.editPremise(answered.intakeId, { idempotencyKey: key(), key: "purpose", value: "会社を伸ばす" }, JA);
  assert.equal(edited.premiseVersion, 2);
  assert.equal(edited.premise!.find((row) => row.key === "purpose")?.value, "会社を伸ばす");
  await assert.rejects(world.flow.editPremise(answered.intakeId, { idempotencyKey: key(), key: "nope", value: "x" }, JA), rejects("INVALID_INPUT"));
});

test("the goal kind guess: short text and repeats never call the AI; the daily cap falls back to rules", async () => {
  const world = flowWorld();
  assert.deepEqual(await world.flow.guessGoalKind("採用", JA), { goalKind: "hiring", source: "rule" });
  assert.equal(world.ai.calls.goalKind, 0);
  const first = await world.flow.guessGoalKind("エンジニアを 3 人採用したい", JA);
  await world.flow.guessGoalKind("エンジニアを 3 人採用したい", JA);
  assert.equal(first.goalKind, "hiring");
  assert.equal(world.ai.calls.goalKind, 1, "the same text is cached");
  for (let index = 0; index < 25; index += 1) await world.flow.guessGoalKind(`資金調達の目標 その${index}`, JA);
  assert.equal(world.ai.calls.goalKind, 20, "at most 20 AI guesses per Tokyo day");
});

test("at most 10 new goals a month; a third active goal is refused before any AI call", async () => {
  const world = flowWorld();
  for (let index = 0; index < PLAN_NEW_GOAL_MONTHLY_LIMIT; index += 1) {
    await world.flow.createIntake({ goalKind: "sales", goalText: `目標 ${index}`, idempotencyKey: key(), source: "task" }, JA);
  }
  const list = await world.flow.listIntakes(JA);
  assert.equal(list.newGoalsLeftThisMonth, 0);
  await assert.rejects(world.flow.createIntake({ goalKind: "sales", goalText: "11 個目", idempotencyKey: key(), source: "task" }, JA), (error: unknown) => error instanceof PlanFlowError && error.reason === "GOAL_MONTHLY_LIMIT" && Boolean(error.details.retryOn));

  const full = flowWorld();
  await full.planService.createPlanFromDraft(draftInput({ creationKey: "a", goalId: "g1" }));
  await full.planService.createPlanFromDraft(draftInput({ creationKey: "b", goalId: "g2" }));
  await assert.rejects(full.flow.createIntake({ goalKind: "sales", goalText: "3 つ目", idempotencyKey: key(), source: "task" }, JA), rejects("PLAN_GOAL_LIMIT"));
  assert.equal(full.ai.calls.background, 0);
});
