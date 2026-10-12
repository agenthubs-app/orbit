/**
 * 计划页像素返工的服务端可选字段（内存仓储 + mock AI）：
 * 見直し lastConfirmedAt / turn.userText、目標を編集 goalBackground / goalNote、C10 subtitle（v7）、
 * 以前のプラン phase / phaseNumber / 会いたい人的 detail · contactName · organization、PlanAchievementView.startsOn。
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import { PLAN_V2_PROMPT_VERSION, TASKS } from "../../features/plans/v2/ai/prompts";
import { checkNextGoals, NEXT_GOAL_SUBTITLE_MAX } from "../../features/plans/v2/ai/schemas";
import type { PlanV2LegacyRow } from "../../features/plans/v2/types";
import { planNextGoalsResponseSchema, planReviewViewSchema, planV2DetailSchema, planLegacyDetailSchema, planAchievementViewSchema, planGoalEditRequestSchema } from "../../shared/api-schema/plan-v2";
import { flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { SCOPE } from "./v2-fixture";

async function confirmedPlan(world: ReturnType<typeof flowWorld>) {
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  return { detail: (await world.planService.detail(confirmed.planId))!, planId: confirmed.planId };
}

describe("見直し: lastConfirmedAt and turn.userText", () => {
  test("lastConfirmedAt is the plan's confirm time until a review is confirmed, then that review; a goal edit does not count", async () => {
    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    const created = world.repository.dump(SCOPE).plans.find((plan) => plan.id === planId)!.createdAt;
    const opened = await world.flow.startReview(planId, key(), JA);
    assert.equal(opened.lastConfirmedAt, created, "never reviewed: the plan's own confirm time");
    assert.ok(planReviewViewSchema.parse(opened).lastConfirmedAt);

    const fixed = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [{ key: "purpose", value: "来年までに 3 億円" }], text: "  もっと投資家に寄せたい  " }, JA);
    const turn = fixed.draft.turns.at(-1)!;
    assert.equal(turn.userText, "もっと投資家に寄せたい", "only the user's own words");
    assert.match(turn.input, /来年までに 3 億円/u, "input keeps the premise summary");
    assert.match(turn.input, /もっと投資家に寄せたい/u);

    await world.flow.confirm(opened.draft.draftId, key(), JA);
    const revision = world.repository.dump(SCOPE).revisions.filter((row) => row.planId === planId && row.source === "review").at(-1)!;
    await world.flow.editGoal(planId, { expectedRevision: detail.revision + 1, goalText: "別の言い方", idempotencyKey: key(), mode: "save_only" }, JA);
    const again = await world.flow.startReview(planId, key(), JA);
    assert.equal(again.lastConfirmedAt, revision.createdAt, "the latest confirmed review, not the later goal edit");
    assert.ok(again.lastConfirmedAt! > created);
  });

  test("a premise-only turn has userText null; a turn stored before the field reads as null", async () => {
    const world = flowWorld();
    const { planId } = await confirmedPlan(world);
    const opened = await world.flow.startReview(planId, key(), JA);
    const fixed = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [{ key: "purpose", value: "来年までに 3 億円" }], text: null }, JA);
    assert.equal(fixed.draft.turns.at(-1)!.userText, null);

    // 旧数据：没有 userText 的轮次。
    const state = world.repository.dump(SCOPE);
    const draft = state.drafts.find((row) => row.id === opened.draft.draftId)!;
    draft.turns = draft.turns.map(({ userText: _userText, ...turn }) => turn);
    world.repository.seed(SCOPE, state);
    const read = (await world.flow.getReview(opened.draft.draftId, JA))!;
    assert.equal(read.draft.turns.at(-1)!.userText, null);
    assert.equal(Object.hasOwn(read.draft.turns.at(-1)!, "userText"), true);
  });
});

describe("目標を編集: goalBackground / goalNote", () => {
  test("save_only with only the two notes saves them; detail reads them; null clears; an old plan has neither", async () => {
    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    assert.equal(detail.goalBackground ?? null, null, "an old plan has no background");
    assert.equal(detail.goalNote ?? null, null);

    const saved = await world.flow.editGoal(planId, { expectedRevision: detail.revision, goalBackground: "  ARR 8,000万円。リード候補がまだいない。 ", goalNote: "CFO 経験者を最優先", idempotencyKey: key(), mode: "save_only" }, JA);
    assert.equal(saved.reviewDraftId, null, "notes alone need no rebuild");
    const after = planV2DetailSchema.parse(await world.planService.detail(planId));
    assert.equal(after.goalBackground, "ARR 8,000万円。リード候補がまだいない。");
    assert.equal(after.goalNote, "CFO 経験者を最優先");
    assert.equal(after.goal, detail.goal, "the goal text is unchanged");
    assert.deepEqual(after.content.personTypes.map((type) => type.allocation), detail.content.personTypes.map((type) => type.allocation));
    const row = world.repository.dump(SCOPE).plans.find((plan) => plan.id === planId)!;
    assert.equal(row.analysis.goalNote, "CFO 経験者を最優先", "stored in plans.analysis");
    const revision = world.repository.dump(SCOPE).revisions.at(-1)!;
    assert.deepEqual(revision.after, { goalBackground: "ARR 8,000万円。リード候補がまだいない。", goalKind: detail.goalKind, goalNote: "CFO 経験者を最優先", goalText: detail.goal });

    // 不传 = 不改；只改目标文时说明保留。
    await world.flow.editGoal(planId, { expectedRevision: saved.revision, goalText: "年内にシリーズA", idempotencyKey: key(), mode: "save_only" }, JA);
    const kept = (await world.planService.detail(planId))!;
    assert.equal(kept.goalNote, "CFO 経験者を最優先");
    // null / 空串 = 清空。
    await world.flow.editGoal(planId, { expectedRevision: kept.revision, goalBackground: null, goalNote: "  ", idempotencyKey: key(), mode: "save_only" }, JA);
    const cleared = (await world.planService.detail(planId))!;
    assert.equal(cleared.goalBackground ?? null, null);
    assert.equal(cleared.goalNote ?? null, null);
    assert.equal(cleared.goal, "年内にシリーズA");
  });

  test("the request schema bounds the two notes", () => {
    const base = { expectedRevision: 1, idempotencyKey: "k", mode: "save_only" };
    assert.equal(planGoalEditRequestSchema.safeParse({ ...base, goalBackground: "x".repeat(1000), goalNote: "y".repeat(200) }).success, true);
    assert.equal(planGoalEditRequestSchema.safeParse({ ...base, goalBackground: "x".repeat(1001) }).success, false);
    assert.equal(planGoalEditRequestSchema.safeParse({ ...base, goalNote: "y".repeat(201) }).success, false);
    assert.equal(planGoalEditRequestSchema.safeParse({ ...base, goalNote: null }).success, true);
  });
});

describe("C10 subtitle (prompt v7)", () => {
  test("the prompt asks for a subtitle and the version is v7", () => {
    assert.equal(PLAN_V2_PROMPT_VERSION, "plan-v2-flow-2026-10-v7");
    assert.match(TASKS.nextGoals, /subtitle/u);
  });

  test("the validator keeps one short line and turns anything else into null without dropping the candidate", () => {
    const input = { goalKind: "fundraising" as const, goalText: "調達", records: [{ alias: "R1", contact: null, id: "R1", kind: "talked", text: "CFO と話した" }], summary: "s" } as never;
    const candidate = (subtitle: unknown) => ({ evidenceIds: ["R1", "R9"], goalKind: "hiring", goalText: "採用", ...(subtitle === undefined ? {} : { subtitle }) });
    const checked = checkNextGoals({ candidates: [candidate(" 会った CFO から紹介が見込めます "), candidate("x".repeat(NEXT_GOAL_SUBTITLE_MAX + 1)), candidate("一行目\n二行目"), candidate(undefined)] }, input);
    assert.equal(checked.ok, true);
    const value = (checked as { value: { candidates: Array<{ subtitle?: string | null; evidenceIds: string[] }> } }).value;
    assert.equal(value.candidates.length, 2, "still at most 2");
    assert.equal(value.candidates[0]!.subtitle, "会った CFO から紹介が見込めます");
    assert.equal(value.candidates[1]!.subtitle, null, "too long → null");
    const rest = checkNextGoals({ candidates: [candidate("一行目\n二行目"), candidate(42)] }, input);
    assert.deepEqual((rest as typeof checked & { ok: true }).value.candidates.map((item: { subtitle?: string | null }) => item.subtitle), [null, null], "multi-line / not a string → null");
    assert.equal(checkNextGoals({ candidates: [candidate(undefined)] }, input).ok, true, "a missing subtitle is fine");
  });

  test("the mock gives a subtitle; the response carries it; an older cached response reads null", async () => {
    const mock = await createMockPlanFlowAi().nextGoals({ goalKind: "fundraising", goalText: "調達", records: [], summary: "s" }, { actorId: "a", language: "ja", ledgerKey: "k", now: new Date() });
    assert.ok(mock.ok && mock.value.candidates.every((candidate) => typeof candidate.subtitle === "string" && candidate.subtitle.length <= NEXT_GOAL_SUBTITLE_MAX));

    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    await world.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: key() });
    const next = planNextGoalsResponseSchema.parse(await world.flow.nextGoals(planId, JA));
    assert.equal(next.candidates.length, 2);
    assert.ok(next.candidates.every((candidate) => typeof candidate.subtitle === "string" && candidate.subtitle.length > 0));

    // 旧缓存（v7 之前，没有 subtitle）：读成 null，不再调 AI。
    const state = world.repository.dump(SCOPE);
    const receipt = state.receipts.find((row) => row.idempotencyKey === `next-goal:${planId}`)!;
    receipt.response = { ...receipt.response, candidates: (receipt.response.candidates as Array<Record<string, unknown>>).map(({ subtitle: _subtitle, ...candidate }) => candidate) };
    world.repository.seed(SCOPE, state);
    const cached = await world.flow.nextGoals(planId, JA);
    assert.deepEqual(cached.candidates.map((candidate) => candidate.subtitle), [null, null]);
    assert.equal(world.ai.calls.nextGoals, 1);
  });
});

describe("以前のプラン: phase, phaseNumber, need detail / contact", () => {
  const spans = [
    { endWeek: 4, key: "p1", startWeek: 1, title: "数字と資料を固める" },
    { endWeek: 8, key: "p2", startWeek: 5, title: "VC を絞る" },
    { endWeek: 12, key: "p3", startWeek: 9, title: null },
  ];
  const row = (overrides: Partial<PlanV2LegacyRow>): PlanV2LegacyRow => ({
    actionsDone: 1,
    actionsTotal: 2,
    analysisSummary: "まとめ",
    archivedAt: null,
    goal: "シリーズA",
    items: [
      { kind: "action", phase: "p1", status: "done", title: "事業計画" },
      { kind: "action", phase: "p9", status: "not_started", title: "どこにも属さない" },
      { contactName: "伊藤", detail: "資本政策の壁打ち", kind: "network_need", organization: "Acme", phase: "p2", status: "linked", title: "CFO 経験者" },
      { contactName: null, detail: null, kind: "network_need", organization: null, phase: null, status: "open", title: "CVC 担当者" },
    ],
    needs: 2,
    phaseSpans: spans,
    planId: "v1-active",
    startsOn: "2026-09-01",
    status: "active",
    ...overrides,
  });

  test("an active plan takes today's phase, an archived one the phase it was archived in; items get their phase number", async () => {
    const world = flowWorld(); // 时钟 2026-10-07（第 6 周 → フェーズ 2）
    world.repository.seed(SCOPE, {
      legacy: [
        row({}),
        row({ archivedAt: "2026-09-10T03:00:00.000Z", planId: "v1-archived", status: "archived" }), // 第 2 周 → フェーズ 1
        row({ planId: "v1-nophases", phaseSpans: [] }),
        row({ planId: "v1-ended", startsOn: "2025-01-01" }), // 超出最后一周 → 最后一段
      ],
    });
    const list = await world.planService.legacyList();
    const phaseOf = (id: string) => list.plans.find((plan) => plan.planId === id)!.phase;
    assert.deepEqual(phaseOf("v1-active"), { number: 2, title: "VC を絞る", total: 3 });
    assert.deepEqual(phaseOf("v1-archived"), { number: 1, title: "数字と資料を固める", total: 3 });
    assert.equal(phaseOf("v1-nophases"), null);
    assert.deepEqual(phaseOf("v1-ended"), { number: 3, title: null, total: 3 });
    assert.equal(list.plans.some((plan) => "phaseSpans" in plan), false, "the internal spans never leave the service");

    const detail = planLegacyDetailSchema.parse(await world.planService.legacyDetail("v1-active"));
    assert.deepEqual(detail.items.map((item) => item.phaseNumber), [1, null, 2, null]);
    const [linked, open] = detail.items.filter((item) => item.kind === "network_need");
    assert.deepEqual({ contactName: linked!.contactName, detail: linked!.detail, organization: linked!.organization }, { contactName: "伊藤", detail: "資本政策の壁打ち", organization: "Acme" });
    assert.deepEqual({ contactName: open!.contactName, detail: open!.detail, organization: open!.organization }, { contactName: null, detail: null, organization: null });
  });

  test("a seed without phase spans keeps what it has (design fixtures)", async () => {
    const world = flowWorld();
    const { phaseSpans: _spans, ...seeded } = row({ planId: "v1-seed", phase: { number: 1, title: null, total: 2 } });
    world.repository.seed(SCOPE, { legacy: [seeded] });
    assert.deepEqual((await world.planService.legacyDetail("v1-seed"))!.phase, { number: 1, title: null, total: 2 });
  });
});

describe("PlanAchievementView.startsOn", () => {
  test("the done page has the plan's start date", async () => {
    const world = flowWorld();
    const { detail, planId } = await confirmedPlan(world);
    await world.flow.achieve(planId, { expectedRevision: detail.revision, idempotencyKey: key() });
    const view = planAchievementViewSchema.parse(await world.planService.achievement(planId, "ja"));
    assert.equal(view.startsOn, detail.startsOn);
    assert.match(view.startsOn!, /^\d{4}-\d{2}-\d{2}$/u);
  });
});
