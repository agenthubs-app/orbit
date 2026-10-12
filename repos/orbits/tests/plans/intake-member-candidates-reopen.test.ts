/**
 * 计划页像素返工：生成流程的「人脈から選ぶ」默认候补（只读、不调 AI）与 D38「背景を開き直す」（内存仓储 + mock AI）。
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createMockPlanFlowContext, type PlanFlowContact, type PlanFlowContextSource } from "../../features/plans/v2/flow-context";
import { PlanFlowError } from "../../features/plans/v2/flow-service";
import { planCapabilitiesInText, rankPlanMemberCandidates } from "../../shared/compute/plan-member-candidates";
import { planIntakeReopenRequestSchema, planMemberCandidatesResponseSchema } from "../../shared/api-schema/plan-v2";
import { confirmedBackground, flowWorld, JA, key } from "./flow-fixture";
import { SCOPE } from "./v2-fixture";

const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

const person = (id: string, role: string | null, extra: Partial<PlanFlowContact> = {}): PlanFlowContact => ({ id, industry: null, name: `名前 ${id}`, notes: null, organization: `${id} 社`, role, tags: [], ...extra });

function contextWith(people: PlanFlowContact[], team: PlanFlowContact[] = []): PlanFlowContextSource {
  const base = createMockPlanFlowContext();
  return { ...base, async contacts(_actor, ids) { return [...team, ...people].filter((item) => ids.includes(item.id)); }, async draftContacts() { return people; }, async teamCandidates() { return team; } };
}

describe("shared rule: できること / 空き / 共同創業者", () => {
  test("capability names in any of the three languages count; co-founders first, then gap fillers, then the original order", () => {
    assert.deepEqual(planCapabilitiesInText("CFO · 財務 / investor relations", ["finance", "investor_relations", "pitch"]), ["finance", "investor_relations"]);
    assert.deepEqual(planCapabilitiesInText("", ["finance"]), []);
    const ranked = rankPlanMemberCandidates([
      { context: "", id: "plain", role: "部長" },
      { context: "", id: "fills", role: "事業計画・財務モデル担当" },
      { context: "タグ：Co-Founder", id: "cofounder", role: "CTO" },
      { context: "ピッチ", id: "notgap", role: null },
    ], "fundraising", ["financial_model"]);
    assert.deepEqual(ranked.map((item) => item.id), ["cofounder", "fills", "plain", "notgap"]);
    assert.deepEqual(ranked[1]!.fills, ["financial_model"]);
    assert.deepEqual(ranked[3]!.capabilities, ["pitch"], "a capability that is not a gap is still listed");
    assert.deepEqual(ranked[3]!.fills, []);
  });
});

describe("member candidates", () => {
  test("lists own contacts (co-founder candidates first), without people already in the team, with gaps; no AI", async () => {
    const team = [person("cof", "共同創業者 · CTO")];
    const people = [person("a", "営業部長"), person("b", "CFO", { notes: "offering: 事業計画・財務モデル" }), person("cof", "共同創業者 · CTO"), person("c", "弁護士", { tags: ["法務・手続き"] })];
    const world = flowWorld({ context: contextWith(people, team) });
    const intake = await world.flow.createIntake({ goalKind: "fundraising", goalText: "シリーズA の資金調達をしたい", idempotencyKey: key(), source: "task" }, JA);
    const inTeam = new Set(intake.background.team.value.members.map((member) => member.contactId));
    const calls = { ...world.ai.calls };
    const listed = planMemberCandidatesResponseSchema.parse(await world.flow.memberCandidates(intake.intakeId, JA));
    assert.deepEqual(world.ai.calls, calls, "no AI call");
    assert.ok(listed.gaps.length > 0);
    assert.equal(listed.candidates.some((candidate) => inTeam.has(candidate.contactId)), false, "people already in the team are left out");
    assert.equal(new Set(listed.candidates.map((candidate) => candidate.contactId)).size, listed.candidates.length, "no duplicates");
    const b = listed.candidates.find((candidate) => candidate.contactId === "b")!;
    assert.ok(b.capabilities.includes("financial_model"));
    if (listed.gaps.includes("financial_model")) assert.deepEqual(b.fills.includes("financial_model"), true);
    const c = listed.candidates.find((candidate) => candidate.contactId === "c")!;
    assert.ok(c.capabilities.includes("legal_admin"), "tags count");
    assert.deepEqual({ name: c.name, organization: c.organization, role: c.role }, { name: "名前 c", organization: "c 社", role: "弁護士" });
    // 补得上空き的排在不补的前面。
    const order = listed.candidates.map((candidate) => candidate.fills.length > 0);
    assert.deepEqual(order, [...order].sort((x, y) => Number(y) - Number(x)));
    await assert.rejects(world.flow.memberCandidates("nope", JA), rejects("INTAKE_NOT_FOUND"));
  });

  test("the mock world has candidates; at most 20", async () => {
    const world = flowWorld();
    const intake = await world.flow.createIntake({ goalKind: "fundraising", goalText: "シリーズA の資金調達をしたい", idempotencyKey: key(), source: "task" }, JA);
    const listed = await world.flow.memberCandidates(intake.intakeId, JA);
    assert.ok(listed.candidates.length > 0 && listed.candidates.length <= 20);
    const many = Array.from({ length: 40 }, (_, index) => person(`p${index}`, "マネージャー"));
    const big = flowWorld({ context: contextWith(many) });
    const other = await big.flow.createIntake({ goalKind: "sales", goalText: "新規顧客を 10 社つくりたい", idempotencyKey: key(), source: "task" }, JA);
    assert.equal((await big.flow.memberCandidates(other.intakeId, JA)).candidates.length, 20);
  });
});

describe("reopen the background (D38)", () => {
  async function drafted(world: ReturnType<typeof flowWorld>) {
    const background = await confirmedBackground(world);
    const asked = await world.flow.chooseQuestions(background.intakeId, key("questions"), JA);
    const first = asked.questions![0]!;
    const answersKey = key("answers");
    const oldAnswers = [{ questionId: first.id, text: "β 運用中", values: [] }];
    const premise = await world.flow.submitAnswers(asked.intakeId, { answers: oldAnswers, idempotencyKey: answersKey }, JA);
    const draft = await world.flow.makeDraft(premise.intakeId, key("draft"), JA);
    const intake = (await world.flow.getIntake(premise.intakeId, JA))!;
    return { answersKey, draft, intake, oldAnswers };
  }

  test("voids questions, answers, premise and the first draft, and returns to the background step; replays are idempotent", async () => {
    const world = flowWorld();
    const { draft, intake } = await drafted(world);
    assert.equal(intake.status, "drafted");
    assert.equal(planIntakeReopenRequestSchema.safeParse({ expectedUpdatedAt: intake.updatedAt, idempotencyKey: "k", extra: 1 }).success, false, "the body is strict");
    await assert.rejects(world.flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: "2000-01-01T00:00:00.000Z", idempotencyKey: key() }, JA), rejects("STALE"));

    const reopenKey = key("reopen");
    const reopened = await world.flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: reopenKey }, JA);
    assert.equal(reopened.status, "background");
    assert.deepEqual([reopened.questions, reopened.answers, reopened.premise, reopened.draftId], [null, null, null, null]);
    assert.deepEqual([reopened.background.me.confirmedAt, reopened.background.team.confirmedAt, reopened.background.purpose.confirmedAt], [null, null, null], "back to confirming the background");
    assert.equal(reopened.background.me.value.wants, intake.background.me.value.wants, "what was written is kept");
    assert.equal(world.repository.dump(SCOPE).drafts.find((row) => row.id === draft.draftId)!.status, "discarded");

    const replay = await world.flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: reopenKey }, JA);
    assert.equal(replay.updatedAt, reopened.updatedAt, "same key: no second change");
    const again = await world.flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: key() }, JA);
    assert.equal(again.updatedAt, reopened.updatedAt, "already open: a no-op");
    await assert.rejects(world.flow.makeDraft(intake.intakeId, key(), JA), rejects("PREMISE_NOT_READY"), "no draft without new answers");
  });

  test("old answers are refused after the reopen, and new questions do not carry them over", async () => {
    const world = flowWorld();
    const { answersKey, intake, oldAnswers } = await drafted(world);
    const reopened = await world.flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: key() }, JA);
    await assert.rejects(world.flow.submitAnswers(intake.intakeId, { answers: oldAnswers, idempotencyKey: key() }, JA), rejects("QUESTIONS_NOT_READY"), "old answers with a new key are refused");
    await assert.rejects(world.flow.chooseQuestions(intake.intakeId, key(), JA), rejects("BACKGROUND_NOT_CONFIRMED"), "the background must be confirmed again first");

    // 重新确认背景 → 重新出题：没有沿用旧回答；同一键重放旧回答也不会写进来。
    let current = reopened;
    current = await world.flow.confirmBlock(current.intakeId, { block: "me", expectedUpdatedAt: current.updatedAt, idempotencyKey: key(), me: { stance: current.background.me.value.stance ?? "owner", wants: current.background.me.value.wants } }, JA);
    const team = current.background.team.value;
    current = await world.flow.confirmBlock(current.intakeId, { block: "team", expectedUpdatedAt: current.updatedAt, idempotencyKey: key(), team: { members: team.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation })), mode: team.mode } }, JA);
    current = await world.flow.confirmBlock(current.intakeId, { block: "purpose", expectedUpdatedAt: current.updatedAt, idempotencyKey: key(), purpose: { selectedLevel: current.background.purpose.value.selectedLevel ?? 2 } }, JA);
    const asked = await world.flow.chooseQuestions(current.intakeId, key(), JA);
    assert.equal(asked.status, "questions");
    assert.equal(asked.answers, null, "new questions start without the old answers");
    assert.equal(asked.premise, null);
    const replayed = await world.flow.submitAnswers(current.intakeId, { answers: oldAnswers, idempotencyKey: answersKey }, JA);
    assert.equal(replayed.status, "questions", "replaying the old answers' key does not apply them");
    assert.equal(replayed.answers, null);

    const answered = await world.flow.submitAnswers(current.intakeId, { answers: [], idempotencyKey: key() }, JA);
    assert.equal(answered.status, "premise");
    assert.equal(answered.premiseVersion, intake.premiseVersion + 1, "the premise version keeps counting up");
    assert.ok(answered.answers!.every((answer) => answer.guessed), "nothing carried over: unanswered rows are guesses");
    const before = world.repository.dump(SCOPE).drafts.map((row) => row.id);
    const draft = await world.flow.makeDraft(current.intakeId, key(), JA);
    assert.equal(draft.status, "open");
    assert.equal(before.includes(draft.draftId), false, "a new first draft, not the voided one");
  });

  test("a finished flow cannot be reopened", async () => {
    const world = flowWorld();
    const { draft, intake } = await drafted(world);
    await world.flow.confirm(draft.draftId, key(), JA);
    const planned = (await world.flow.getIntake(intake.intakeId, JA))!;
    await assert.rejects(world.flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: planned.updatedAt, idempotencyKey: key() }, JA), rejects("BACKGROUND_LOCKED"));
  });
});
