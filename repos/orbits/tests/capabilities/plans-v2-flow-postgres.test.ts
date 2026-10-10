/**
 * R23 SC-R23-06（真实 PostgreSQL，本机回环库）：生成流程写 plan_intakes / plan_drafts / plan_flow_commands，
 * 确定后 plans 多一份 v2 生效计划，intake 与草稿标为已确定；改前提作废旧草稿。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMockPlanFlowContext } from "../../features/plans/v2/flow-context";
import { createPlanFlowService } from "../../features/plans/v2/flow-service";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { countingAi, JA } from "../plans/flow-fixture";
import { ANY_REFERENCES, steppingClock } from "../plans/v2-fixture";

const ACTOR = "actor:alice";

function flowFor(pool: import("pg").Pool) {
  const scope = { actorId: ACTOR, workspaceId: WORKSPACE };
  const repository = createPostgresPlanV2Repository({ pool });
  const now = steppingClock();
  let n = 0;
  const planService = createPlanV2Service({ newId: () => `pg${(n += 1)}`, now, references: ANY_REFERENCES, repository, scope });
  const ai = countingAi();
  return { ai, flow: createPlanFlowService({ ai, context: createMockPlanFlowContext(), newId: () => `pf${(n += 1)}`, now, planService, repository, scope }), planService };
}

test("the whole flow round-trips through PostgreSQL and confirms one v2 plan", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { ai, flow, planService } = flowFor(pool);
    let intake = await flow.createIntake({ goalKind: "launch", goalText: "Orbit を黒字化したい", idempotencyKey: "pg-create", source: "task" }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "pg-me", me: { stance: "cofounder", wants: "Orbit を世に出す" } }, JA);
    const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
    intake = await flow.confirmBlock(intake.intakeId, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "pg-team", team: { members, mode: intake.background.team.value.mode } }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "pg-purpose", purpose: { selectedLevel: 3 } }, JA);
    intake = await flow.chooseQuestions(intake.intakeId, "pg-q", JA);
    intake = await flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: "pg-a" }, JA);
    const first = await flow.makeDraft(intake.intakeId, "pg-d1", JA);
    await flow.editPremise(intake.intakeId, { idempotencyKey: "pg-p", key: "purpose", value: "まず黒字化" }, JA);
    const draft = await flow.makeDraft(intake.intakeId, "pg-d2", JA);
    const fixed = await flow.fix(draft.draftId, { idempotencyKey: "pg-f", text: "主催者を先に" }, JA);
    assert.equal(fixed.aiFixUsed, 1);
    const confirmed = await flow.confirm(draft.draftId, "pg-ok", JA);

    const intakes = (await pool.query("select status, plan_id, (ai_steps->>'premiseVersion')::int as pv from plan_intakes")).rows;
    assert.deepEqual(intakes, [{ plan_id: confirmed.planId, pv: 2, status: "planned" }]);
    const drafts = (await pool.query("select id, status, ai_fix_used, confirmed_at is not null as confirmed from plan_drafts order by created_at")).rows;
    assert.deepEqual(drafts.map((row) => [row.id, row.status, row.ai_fix_used, row.confirmed]), [[first.draftId, "discarded", 0, false], [draft.draftId, "confirmed", 1, true]]);
    const receipts = (await pool.query("select kind, intake_id is not null as has_intake from plan_flow_commands where kind like 'intake_%' or kind like 'draft_%' order by created_at")).rows;
    assert.ok(receipts.length >= 8 && receipts.every((row) => row.has_intake || /^draft_/.test(row.kind)));
    const plans = (await pool.query("select model_version, status, goal_id, creation_key, manual_edit_available from plans")).rows;
    assert.deepEqual(plans, [{ creation_key: draft.draftId, goal_id: intake.intakeId, manual_edit_available: true, model_version: 2, status: "active" }]);
    const detail = await planService.detail(confirmed.planId);
    assert.equal(detail!.goalKind, "launch");
    assert.equal(ai.calls.background, 1);
    assert.equal(ai.calls.firstDraft, 2);
  });
});

test("concurrent confirms of one draft create exactly one plan", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { flow } = flowFor(pool);
    let intake = await flow.createIntake({ goalKind: "sales", goalText: "新規顧客を増やす", idempotencyKey: "c-create", source: "task" }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "c-me", me: { stance: "owner", wants: "顧客を増やす" } }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "c-team", team: { members: [{ capabilities: [], memberId: "self", otherCapabilities: [], relation: null }], mode: "solo" } }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "c-purpose", purpose: { selectedLevel: 2 } }, JA);
    intake = await flow.chooseQuestions(intake.intakeId, "c-q", JA);
    intake = await flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: "c-a" }, JA);
    const draft = await flow.makeDraft(intake.intakeId, "c-d", JA);
    const results = await Promise.all([flow.confirm(draft.draftId, "c-1", JA), flow.confirm(draft.draftId, "c-2", JA), flow.confirm(draft.draftId, "c-3", JA)]);
    assert.equal(new Set(results.map((result) => result.planId)).size, 1);
    assert.equal(Number((await pool.query("select count(*) from plans where model_version = 2")).rows[0].count), 1);
  });
});

// R25：見直し（plan_drafts kind review、review_used 计次、plan_revisions）、手动编辑、改目标、达成、以前のプラン 走真实 PostgreSQL。
test("R25 review, manual edit, goal edit, achieve and legacy round-trip through PostgreSQL", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { flow, planService } = flowFor(pool);
    let intake = await flow.createIntake({ goalKind: "fundraising", goalText: "シリーズA を年内に", idempotencyKey: "r25-create", source: "task" }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "r25-me", me: { stance: "owner", wants: intake.background.me.value.wants } }, JA);
    const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
    intake = await flow.confirmBlock(intake.intakeId, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "r25-team", team: { members, mode: intake.background.team.value.mode } }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "r25-purpose", purpose: { selectedLevel: 2 } }, JA);
    intake = await flow.chooseQuestions(intake.intakeId, "r25-q", JA);
    intake = await flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: "r25-a" }, JA);
    const draft = await flow.makeDraft(intake.intakeId, "r25-d", JA);
    const { planId } = await flow.confirm(draft.draftId, "r25-ok", JA);
    const detail = (await planService.detail(planId))!;
    await planService.award({ itemId: detail.content.personTypes[0]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: "r25-aw" } });

    const review = await flow.startReview(planId, "r25-r1", JA);
    assert.equal((await flow.startReview(planId, "r25-r2", JA)).draft.draftId, review.draft.draftId);
    const fixed = await flow.reviewFix(review.draft.draftId, { idempotencyKey: "r25-f1", premise: [], text: "投資家に寄せたい" }, JA);
    assert.equal(fixed.reviewLeftThisMonth, 2);
    const change = fixed.draft.turns.at(-1)!.changes[0]!;
    await flow.toggleChange(review.draft.draftId, change.id!, { accepted: false, idempotencyKey: "r25-t" }, JA);
    await flow.toggleChange(review.draft.draftId, change.id!, { accepted: true, idempotencyKey: "r25-t2" }, JA);
    await flow.confirm(review.draft.draftId, "r25-rc", JA);
    assert.equal((await pool.query("select count(*)::int as n from plan_log where event = 'review_used'")).rows[0].n, 1);

    const manual = await flow.openManualEdit(planId, "r25-m", JA);
    await flow.manualEdit(manual.draftId, {
      event: { ...manual.content.event },
      expectedRevision: manual.revision,
      idempotencyKey: "r25-me2",
      personTypes: manual.content.personTypes.map((type) => ({ allocation: type.allocation, key: type.key, targetCount: type.targetCount })),
      steps: manual.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
    }, JA);
    const afterManual = (await planService.detail(planId))!;
    const edited = await flow.editGoal(planId, { expectedRevision: afterManual.revision, goalText: "来春までにシリーズA", idempotencyKey: "r25-g", mode: "save_only" }, JA);
    const revisions = (await pool.query("select source, from_revision, to_revision from plan_revisions order by to_revision")).rows;
    assert.deepEqual(revisions.map((row) => row.source), ["review", "manual_edit", "goal_edit"]);
    await flow.achieve(planId, { expectedRevision: edited.revision, idempotencyKey: "r25-ach" });
    const plan = (await pool.query("select status, achieved_at is not null as achieved, goal_snapshot from plans where id = $1", [planId])).rows[0];
    assert.deepEqual(plan, { achieved: true, goal_snapshot: "来春までにシリーズA", status: "archived" });
    const view = (await planService.achievement(planId, "ja"))!;
    assert.equal(view.talkedPeople, 1);
    assert.equal((await flow.quota()).activeGoals, 0);
    assert.deepEqual((await planService.legacyList()).plans, []);
  });
});
