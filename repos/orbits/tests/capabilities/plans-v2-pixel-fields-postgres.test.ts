/**
 * 计划页像素返工的服务端可选字段（真实 PostgreSQL，本机回环库）：
 * 見直し lastConfirmedAt（plan_revisions）/ turn.userText（plan_drafts.turns）、goalBackground / goalNote（plans.analysis）、
 * 以前のプラン phase（v1 plans.phases）与会いたい人的 detail / contactName / organization（plan_items + 本人联系人）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { createMockPlanFlowContext } from "../../features/plans/v2/flow-context";
import { createPlanFlowService, type PlanFlowService } from "../../features/plans/v2/flow-service";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service } from "../../features/plans/v2/service";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { planInput } from "../support/plan-fixture";
import { countingAi, JA } from "../plans/flow-fixture";
import { ANY_REFERENCES, steppingClock } from "../plans/v2-fixture";

const ACTOR = "actor:alice";

function flowFor(pool: import("pg").Pool) {
  const scope = { actorId: ACTOR, workspaceId: WORKSPACE };
  const repository = createPostgresPlanV2Repository({ pool });
  const now = steppingClock();
  let n = 0;
  const planService = createPlanV2Service({ newId: () => `px${(n += 1)}`, now, references: ANY_REFERENCES, repository, scope });
  return { flow: createPlanFlowService({ ai: countingAi(), context: createMockPlanFlowContext(), newId: () => `pxf${(n += 1)}`, now, planService, repository, scope }), planService };
}

async function makePlan(flow: PlanFlowService, label: string): Promise<string> {
  let intake = await flow.createIntake({ goalKind: "fundraising", goalText: "シリーズA を年内に", idempotencyKey: `${label}-create`, source: "task" }, JA);
  intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: `${label}-me`, me: { stance: "owner", wants: intake.background.me.value.wants } }, JA);
  const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
  intake = await flow.confirmBlock(intake.intakeId, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: `${label}-team`, team: { members, mode: intake.background.team.value.mode } }, JA);
  intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: `${label}-purpose`, purpose: { selectedLevel: 2 } }, JA);
  intake = await flow.chooseQuestions(intake.intakeId, `${label}-q`, JA);
  intake = await flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: `${label}-a` }, JA);
  const draft = await flow.makeDraft(intake.intakeId, `${label}-d`, JA);
  return (await flow.confirm(draft.draftId, `${label}-ok`, JA)).planId;
}

test("review lastConfirmedAt / userText and the goal notes round-trip through PostgreSQL", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { flow, planService } = flowFor(pool);
    const planId = await makePlan(flow, "px");
    const created = (await pool.query("select created_at from plans where id = $1", [planId])).rows[0].created_at as Date;

    const review = await flow.startReview(planId, "px-r", JA);
    assert.equal(review.lastConfirmedAt, created.toISOString(), "never reviewed: the plan's confirm time");
    const fixed = await flow.reviewFix(review.draft.draftId, { idempotencyKey: "px-f", premise: [{ key: "purpose", value: "来年までに 3 億円" }], text: "投資家に寄せたい" }, JA);
    assert.equal(fixed.draft.turns.at(-1)!.userText, "投資家に寄せたい");
    const stored = (await pool.query("select turns from plan_drafts where id = $1", [review.draft.draftId])).rows[0].turns as Array<{ userText?: string; input: string }>;
    assert.equal(stored.at(-1)!.userText, "投資家に寄せたい", "the user's words are stored with the turn");
    assert.match(stored.at(-1)!.input, /来年までに 3 億円/u);
    await flow.confirm(review.draft.draftId, "px-c", JA);
    const revisionAt = (await pool.query("select created_at from plan_revisions where plan_id = $1 and source = 'review'", [planId])).rows[0].created_at as Date;

    const detail = (await planService.detail(planId))!;
    await flow.editGoal(planId, { expectedRevision: detail.revision, goalBackground: "ARR 8,000万円", goalNote: "CFO を最優先", idempotencyKey: "px-g", mode: "save_only" }, JA);
    const analysis = (await pool.query("select analysis from plans where id = $1", [planId])).rows[0].analysis as Record<string, unknown>;
    assert.equal(analysis.goalBackground, "ARR 8,000万円");
    assert.equal(analysis.goalNote, "CFO を最優先");
    assert.ok(analysis.diagnosis, "the rest of the analysis is kept");
    const after = (await flowFor(pool).planService.detail(planId))!;
    assert.deepEqual([after.goalBackground, after.goalNote, after.goal], ["ARR 8,000万円", "CFO を最優先", detail.goal]);

    const again = await flow.startReview(planId, "px-r2", JA);
    assert.equal(again.lastConfirmedAt, revisionAt.toISOString(), "the latest confirmed review; the goal edit does not count");
  });
});

test("legacy plans carry the v1 phase and the need rows' detail / contact (PostgreSQL)", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const scope = { actorId: ACTOR, workspaceId: WORKSPACE };
    const v1 = createPlanService({
      references: createAllowListPlanReferenceValidator({ actorId: ACTOR, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository: createPostgresPlanRepository({ pool }),
      scope,
    });
    const extra = { criteria: { description: null, primaryIndustryId: null, secondaryIndustryId: null, titleKeywords: [] }, kind: "network_need" as const, phaseKey: "p3", title: "他人の連絡先" };
    const created = await v1.createVersion(planInput({ basePlanId: null, creationKey: "lg1", items: [...planInput().items, extra] }));
    const contact = (id: string, user: string, payload: Record<string, unknown>) => pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
       values ($1, 'contacts', $2, $3, 'system', $2, 'active', $4::jsonb, now(), now())`,
      [WORKSPACE, id, user, JSON.stringify(payload)],
    );
    await contact("c-mine", ACTOR, { displayName: "伊藤 さくら", organization: "Acme 商事" });
    await contact("c-theirs", "actor:bob", { displayName: "他人", organization: "Other" });
    const link = (contactId: string) => JSON.stringify([{ contactId, establishedAt: null, linkedAt: "2026-09-29T00:00:00.000Z", state: "linked" }]);
    await pool.query(`update plan_items set contact_links = $2::jsonb where plan_id = $1 and title = '日本市场的渠道伙伴'`, [created.plan.id, link("c-mine")]);
    await pool.query(`update plan_items set contact_links = $2::jsonb where plan_id = $1 and title = '他人の連絡先'`, [created.plan.id, link("c-theirs")]);

    const { planService } = flowFor(pool); // 时钟 2026-10-07，startsOn 2026-09-28 → 第 2 周 → フェーズ 1
    const listed = (await planService.legacyList()).plans[0]!;
    assert.deepEqual(listed.phase, { number: 1, title: "摸清市场", total: 3 });
    const detail = (await planService.legacyDetail(created.plan.id))!;
    const needs = detail.items.filter((item) => item.kind === "network_need");
    assert.deepEqual(needs.map((item) => [item.title, item.detail, item.contactName, item.organization, item.phaseNumber]), [
      ["日本市场的渠道伙伴", "能介绍日本渠道的人", "伊藤 さくら", "Acme 商事", 2],
      ["他人の連絡先", null, null, null, 3],
    ], "someone else's contact is never shown");
    const action = detail.items.find((item) => item.kind === "action")!;
    assert.equal(action.phaseNumber, 1);
    assert.equal("organization" in action, false, "only need rows carry the contact fields");

    await pool.query("update plans set status = 'archived', archived_at = '2026-12-10T00:00:00Z' where id = $1", [created.plan.id]);
    assert.deepEqual((await planService.legacyList()).plans[0]!.phase, { number: 3, title: "拿下试用", total: 3 }, "an archived plan keeps the phase it ended in");
  });
});

test("reopening the background voids the questions, answers, premise and first draft (PostgreSQL)", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const { flow } = flowFor(pool);
    let intake = await flow.createIntake({ goalKind: "fundraising", goalText: "シリーズA を年内に", idempotencyKey: "ro-create", source: "task" }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "ro-me", me: { stance: "owner", wants: intake.background.me.value.wants } }, JA);
    const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
    intake = await flow.confirmBlock(intake.intakeId, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "ro-team", team: { members, mode: intake.background.team.value.mode } }, JA);
    intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "ro-purpose", purpose: { selectedLevel: 2 } }, JA);
    intake = await flow.chooseQuestions(intake.intakeId, "ro-q", JA);
    intake = await flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: "ro-a" }, JA);
    const draft = await flow.makeDraft(intake.intakeId, "ro-d", JA);
    intake = (await flow.getIntake(intake.intakeId, JA))!;

    const candidates = await flow.memberCandidates(intake.intakeId, JA);
    assert.ok(candidates.candidates.length > 0);

    const reopened = await flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: "ro-r" }, JA);
    assert.equal(reopened.status, "background");
    const row = (await pool.query("select status, questions, answers, premise, ai_steps->>'draftId' as draft_id, (ai_steps->>'premiseVersion')::int as pv, background->'me'->>'confirmedAt' as me_at from plan_intakes where id = $1", [intake.intakeId])).rows[0];
    assert.deepEqual(row, { answers: null, draft_id: null, me_at: null, premise: null, pv: 1, questions: null, status: "background" });
    assert.equal((await pool.query("select status from plan_drafts where id = $1", [draft.draftId])).rows[0].status, "discarded");
    assert.equal((await pool.query("select count(*)::int as n from plan_flow_commands where kind = 'intake_reopen'")).rows[0].n, 1, "one receipt");
    const replay = await flow.reopenBackground(intake.intakeId, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: "ro-r" }, JA);
    assert.equal(replay.updatedAt, reopened.updatedAt);
    await assert.rejects(flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: "ro-a2" }, JA), (error: { reason?: string }) => error.reason === "QUESTIONS_NOT_READY");
  });
});
