/**
 * R23 SC-R23-06（真实 PostgreSQL，本机回环库）：生成流程写 plan_intakes / plan_drafts / plan_flow_commands，
 * 确定后 plans 多一份 v2 生效计划，intake 与草稿标为已确定；改前提作废旧草稿。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPostgresAiUsageLedger } from "../../features/ai-quota/ledger";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPostgresPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { createDeepseekPlanFlowAi } from "../../features/plans/v2/ai/deepseek";
import type { PlanFlowAi } from "../../features/plans/v2/ai/types";
import { createLivePlanFlowContext, createMockPlanFlowContext } from "../../features/plans/v2/flow-context";
import { createPlanFlowService, type PlanFlowService } from "../../features/plans/v2/flow-service";
import { createPostgresPlanV2Repository } from "../../features/plans/v2/repository";
import { createPlanV2Service, ledgerReviewBudget, type PlanReviewBudgetReader } from "../../features/plans/v2/service";
import { databaseTest, withNetworkDatabase, WORKSPACE } from "../support/network-analysis-harness";
import { planInput } from "../support/plan-fixture";
import { countingAi, JA } from "../plans/flow-fixture";
import { ANY_REFERENCES, steppingClock } from "../plans/v2-fixture";

const ACTOR = "actor:alice";

function flowFor(pool: import("pg").Pool, actor = ACTOR, options: { ai?: PlanFlowAi; reviewBudget?: PlanReviewBudgetReader } = {}) {
  const scope = { actorId: actor, workspaceId: WORKSPACE };
  const repository = createPostgresPlanV2Repository({ pool });
  const now = steppingClock();
  let n = 0;
  const tag = actor.replace(/\W/g, "");
  const planService = createPlanV2Service({ newId: () => `${tag}pg${(n += 1)}`, now, references: ANY_REFERENCES, repository, reviewBudget: options.reviewBudget, scope });
  const ai = countingAi(options.ai);
  return { ai, flow: createPlanFlowService({ ai, context: createMockPlanFlowContext(), newId: () => `${tag}pf${(n += 1)}`, now, planService, repository, reviewBudget: options.reviewBudget, scope }), planService };
}

/** 走完生成流程并确定一份计划（mock AI）。 */
async function makePlan(flow: PlanFlowService, label: string, goalText = "シリーズA を年内に"): Promise<string> {
  let intake = await flow.createIntake({ goalKind: "fundraising", goalText, idempotencyKey: `${label}-create`, source: "task" }, JA);
  intake = await flow.confirmBlock(intake.intakeId, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: `${label}-me`, me: { stance: "owner", wants: intake.background.me.value.wants } }, JA);
  const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
  intake = await flow.confirmBlock(intake.intakeId, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: `${label}-team`, team: { members, mode: intake.background.team.value.mode } }, JA);
  intake = await flow.confirmBlock(intake.intakeId, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: `${label}-purpose`, purpose: { selectedLevel: 2 } }, JA);
  intake = await flow.chooseQuestions(intake.intakeId, `${label}-q`, JA);
  intake = await flow.submitAnswers(intake.intakeId, { answers: [], idempotencyKey: `${label}-a` }, JA);
  const draft = await flow.makeDraft(intake.intakeId, `${label}-d`, JA);
  return (await flow.confirm(draft.draftId, `${label}-ok`, JA)).planId;
}

const reasonOf = async (promise: Promise<unknown>) => promise.then(() => "ok", (error: { reason?: string; code?: string }) => error?.reason ?? error?.code ?? String(error));

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

// R25 复核 m6（原探针 P2）：bob 用 alice 的 planId / draftId / changeId 调 R25 的新接口 → 一律 404 / null，AI 0 次，配额互不影响。
test("R25 review m6: another person's plan, draft and change ids are invisible to every R25 call (PostgreSQL)", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const alice = flowFor(pool, "actor:alice");
    const bob = flowFor(pool, "actor:bob");
    const planId = await makePlan(alice.flow, "al");
    const detail = (await alice.planService.detail(planId))!;
    await alice.planService.award({ itemId: detail.content.personTypes[0]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: "al-aw" } });
    const review = await alice.flow.startReview(planId, "al-r", JA);
    const fixed = await alice.flow.reviewFix(review.draft.draftId, { idempotencyKey: "al-f", premise: [], text: "投資家に寄せたい" }, JA);
    const changeId = fixed.draft.turns.at(-1)!.changes[0]?.id ?? "t1-1";
    const draftId = review.draft.draftId;
    const notFound = {
      achieve: await reasonOf(bob.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: "b7" })),
      confirm: await reasonOf(bob.flow.confirm(draftId, "b4", JA)),
      editGoal: await reasonOf(bob.flow.editGoal(planId, { expectedRevision: detail.revision, goalText: "乗っ取り", idempotencyKey: "b8", mode: "save_only" }, JA)),
      manualEdit: await reasonOf(bob.flow.manualEdit(draftId, { event: { allocation: 10, targetCount: 1 }, expectedRevision: "x", idempotencyKey: "b5", personTypes: [], steps: [] }, JA)),
      nextGoals: await reasonOf(bob.flow.nextGoals(planId, JA)),
      openManualEdit: await reasonOf(bob.flow.openManualEdit(planId, "b6", JA)),
      reviewFix: await reasonOf(bob.flow.reviewFix(draftId, { idempotencyKey: "b2", premise: [], text: "x" }, JA)),
      startReview: await reasonOf(bob.flow.startReview(planId, "b1", JA)),
      toggle: await reasonOf(bob.flow.toggleChange(draftId, changeId, { accepted: false, idempotencyKey: "b3" }, JA)),
    };
    assert.deepEqual(notFound, {
      achieve: "PLAN_NOT_FOUND", confirm: "DRAFT_NOT_FOUND", editGoal: "PLAN_NOT_FOUND", manualEdit: "DRAFT_NOT_FOUND", nextGoals: "PLAN_NOT_FOUND",
      openManualEdit: "PLAN_NOT_FOUND", reviewFix: "DRAFT_NOT_FOUND", startReview: "PLAN_NOT_FOUND", toggle: "DRAFT_NOT_FOUND",
    });
    assert.equal(await bob.flow.getReview(draftId, JA), null);
    assert.equal(await bob.flow.getDraft(draftId, JA), null);
    assert.equal(await bob.flow.currentReview(planId, JA), null);
    assert.equal(await bob.planService.achievement(planId, "ja"), null);
    assert.equal(await bob.planService.legacyDetail(planId), null);
    assert.equal((await bob.flow.quota()).reviewLeftThisMonth, 3);
    assert.equal((await alice.flow.quota()).reviewLeftThisMonth, 2);
    await alice.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: "al-ach" });
    assert.equal(await bob.planService.achievement(planId, "ja"), null);
    assert.equal(await reasonOf(bob.flow.nextGoals(planId, JA)), "PLAN_NOT_FOUND");
    assert.ok(await alice.planService.achievement(planId, "ja"));
    assert.deepEqual(Object.values(bob.ai.calls).reduce((sum, count) => sum + count, 0), 0, "bob's calls never reach AI");
    const row = (await pool.query("select goal_snapshot, status from plans where id = $1", [planId])).rows[0];
    assert.deepEqual(row, { goal_snapshot: "シリーズA を年内に", status: "archived" });
  });
});

// R25 复核 M1：真实账本 + DeepSeek 适配器（假模型回复）：2 次失败（有响应）+ 1 次成功 → 账本 3 行，界面显示 0（ai_budget），再送不调模型。
test("R25 review M1: two failed and one successful send use up the ledger's 3; the quota shows 0 with ai_budget (PostgreSQL ledger)", databaseTest, async () => {
  await withNetworkDatabase(async ({ client, pool }) => {
    const ledger = createPostgresAiUsageLedger({ client, workspaceId: WORKSPACE });
    let fail = true;
    let requests = 0;
    const chat = async ({ user }: { system: string; user: string }) => {
      requests += 1;
      if (fail) return { content: "not json", usage: { inputTokens: 10, outputTokens: 2 } };
      const input = JSON.parse(user) as { current: unknown };
      return { content: JSON.stringify({ noChangeReason: "そのままで十分です。", reasons: [], revised: input.current, unchanged: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    };
    const deepseek = createDeepseekPlanFlowAi({ chat, ledger, log: () => undefined, model: "fake" });
    const mockSetup = flowFor(pool);
    const planId = await makePlan(mockSetup.flow, "m1");
    const reviewBudget = ledgerReviewBudget(ledger);
    const { flow, planService } = flowFor(pool, ACTOR, { ai: { ...countingAi(), reviewFix: deepseek.reviewFix }, reviewBudget });
    const review = await flow.startReview(planId, "m1-r", JA);
    for (const label of ["f1", "f2"]) await assert.rejects(flow.reviewFix(review.draft.draftId, { idempotencyKey: `m1-${label}`, premise: [], text: "投資家に寄せたい" }, JA), (error: { reason?: string }) => error.reason === "AI_FAILED");
    assert.equal((await flow.quota()).reviewLeftThisMonth, 1, "user 3 left, ledger 1 left");
    fail = false;
    const sent = await flow.reviewFix(review.draft.draftId, { idempotencyKey: "m1-ok", premise: [], text: "投資家に寄せたい" }, JA);
    assert.equal(sent.reviewLeftThisMonth, 0);
    assert.equal(sent.reviewLimitReason, "ai_budget");
    const rows = (await pool.query("select status from ai_usage_ledger where purpose = 'plan_review' order by created_at")).rows.map((row) => row.status);
    assert.deepEqual(rows, ["failed", "failed", "succeeded"]);
    assert.equal((await pool.query("select count(*)::int as n from plan_log where event = 'review_used'")).rows[0].n, 1, "the user count only charged the success");
    const quota = await flow.quota();
    assert.deepEqual([quota.reviewLeftThisMonth, quota.reviewLimitReason], [0, "ai_budget"]);
    assert.deepEqual([(await planService.detail(planId))!.quota.reviewLeftThisMonth, (await planService.detail(planId))!.quota.reviewLimitReason], [0, "ai_budget"]);
    const before = requests;
    await assert.rejects(flow.reviewFix(review.draft.draftId, { idempotencyKey: "m1-4", premise: [], text: "もう一度" }, JA), (error: { reason?: string }) => error.reason === "REVIEW_LIMIT");
    assert.equal(requests, before, "no request once the ledger is used up");
  });
});

// R25 复核 m8：以前のプラン 每条 v1 系列只列最新一版（同目标的重新分析接替旧版；换目标的下一份计划另算一条）。
test("R25 review m8: legacy plans list only the latest version of each v1 series (PostgreSQL)", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const scope = { actorId: ACTOR, workspaceId: WORKSPACE };
    const v1 = createPlanService({
      references: createAllowListPlanReferenceValidator({ actorId: ACTOR, allowList: { contactsByActor: "any", eventIds: "any" } }),
      repository: createPostgresPlanRepository({ pool }),
      scope,
    });
    const first = await v1.createVersion(planInput({ basePlanId: null, creationKey: "s1" }));
    const second = await v1.createVersion(planInput({ basePlanId: first.plan.id, creationKey: "s2" }));
    const third = await v1.createVersion(planInput({ basePlanId: second.plan.id, creationKey: "s3" }));
    const nextGoal = await v1.createVersion(planInput({ basePlanId: third.plan.id, creationKey: "s4", goalSnapshot: "半年で採用 3 名" }));
    const { planService } = flowFor(pool);
    const listed = (await planService.legacyList()).plans.map((plan) => plan.planId);
    assert.deepEqual(listed, [nextGoal.plan.id, third.plan.id], "re-analysed versions of the same goal collapse to the latest");
    assert.equal(await planService.legacyDetail(first.plan.id), null);
    assert.ok(await planService.legacyDetail(third.plan.id));
  });
});

// R25 复核 M4：live 的面谈メモ摘要读取（memo 提取结果，只取本人、给定联系人、确定以来、memo 未删、每条 memo 最新一份）。
test("R25 review M4: the live context reads memo summaries for the given contacts since a time (PostgreSQL)", databaseTest, async () => {
  await withNetworkDatabase(async ({ pool }) => {
    const insert = (collection: string, id: string, user: string, input: { sourceId: string; targetId?: string | null; payload: Record<string, unknown>; at: string; state?: string }) => pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, target_id, lifecycle_state, payload, created_at, updated_at)
       values ($1, $2, $3, $4, 'system', $5, $6, $7, $8::jsonb, $9, $9)`,
      [WORKSPACE, collection, id, user, input.sourceId, input.targetId ?? null, input.state ?? "active", JSON.stringify(input.payload), input.at],
    );
    const note = (id: string, at: string, user = ACTOR, state = "active") => insert("notes", id, user, { at, payload: { id }, sourceId: id, state });
    const extraction = (id: string, noteId: string, contactId: string, at: string, topics: string[], user = ACTOR, status = "succeeded") =>
      insert("memo_extractions", id, user, { at, payload: { output: { offering: [], seeking: [], topics }, status }, sourceId: noteId, targetId: contactId });
    await note("note-1", "2026-10-08T00:00:00Z");
    await extraction("x1-old", "note-1", "c-1", "2026-10-08T00:01:00Z", ["古い要約"]);
    await extraction("x1-new", "note-1", "c-1", "2026-10-08T00:02:00Z", ["ARR 1億円の見込み"]);
    await note("note-2", "2026-10-01T00:00:00Z");
    await extraction("x2", "note-2", "c-1", "2026-10-01T00:01:00Z", ["確定前のメモ"]);
    await note("note-3", "2026-10-09T00:00:00Z");
    await extraction("x3", "note-3", "c-other", "2026-10-09T00:01:00Z", ["関係ない人"]);
    await note("note-4", "2026-10-09T00:00:00Z", ACTOR, "deleted");
    await extraction("x4", "note-4", "c-1", "2026-10-09T00:01:00Z", ["削除済み"]);
    await note("note-5", "2026-10-09T00:00:00Z", "actor:bob");
    await extraction("x5", "note-5", "c-1", "2026-10-09T00:01:00Z", ["他人のメモ"], "actor:bob");
    await note("note-6", "2026-10-10T00:00:00Z");
    await extraction("x6", "note-6", "c-1", "2026-10-10T00:01:00Z", ["失敗"], ACTOR, "failed");
    const context = createLivePlanFlowContext({ mode: "live", pool: pool as never, workspaceId: WORKSPACE });
    const memos = await context.planMemos!(ACTOR, { contactIds: ["c-1"], limit: 20, since: "2026-10-05T00:00:00Z" });
    assert.deepEqual(memos, [{ at: "2026-10-08T00:00:00.000Z", contactId: "c-1", id: "note-1", text: "topics: ARR 1億円の見込み" }]);
  });
});
