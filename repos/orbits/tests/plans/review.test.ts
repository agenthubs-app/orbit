/**
 * R25 見直し（DESIGN §2.8、SC-R25-01 / 02）：打开不扣、发送扣、失败不扣、不改也扣、每人每月合计 3 次、东京月初恢复、
 * 并发只扣到上限、已得分 / 跳过 / 有分类型的保护、逐条 ✕ 后仍 100、base_revision 过期、见直后重新给手动编辑、预标每天最多一次 AI。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createMockPlanFlowAi } from "../../features/plans/v2/ai/mock";
import type { PlanFlowAi } from "../../features/plans/v2/ai/types";
import { PlanFlowError } from "../../features/plans/v2/flow-service";
import { countingAi, flowWorld, JA, key, premiseReady } from "./flow-fixture";
import { SCOPE } from "./v2-fixture";

const rejects = (reason: string) => (error: unknown) => error instanceof PlanFlowError && error.reason === reason;

/** 可拨的时钟：每次调用前进 1 秒，`jump` 直接跳到某一刻。 */
function dialClock(start = "2026-10-07T01:00:00.000Z") {
  let time = Date.parse(start);
  const now = () => new Date((time += 1000));
  return Object.assign(now, { jump: (iso: string) => { time = Date.parse(iso); } });
}

/** 把配点从第 2 个类型挪 5 点给第 1 个类型（同时改 Step 1 的目安）的見直し AI。 */
function shiftingAi(): PlanFlowAi {
  const base = createMockPlanFlowAi();
  return {
    ...base,
    async reviewFix(input) {
      const types = input.current.personTypes.map((type, index) => ({ ...type, allocation: index === 0 ? type.allocation + 5 : index === 1 ? type.allocation - 5 : type.allocation }));
      const steps = input.current.steps.map((step, index) => (index === 0 ? { ...step, doneCriteria: `${step.doneCriteria}（見直し）` } : step));
      return { ok: true, operationId: "op-shift", value: { noChangeReason: null, reasons: [], revised: { ...input.current, personTypes: types, steps }, unchanged: [] } };
    },
  };
}

async function confirmedPlan(world: ReturnType<typeof flowWorld>) {
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  const detail = (await world.planService.detail(confirmed.planId))!;
  return { detail, planId: confirmed.planId };
}

test("opening a review costs nothing; sending costs 1, a failure costs nothing, no change still costs 1", async () => {
  const world = flowWorld();
  const { planId } = await confirmedPlan(world);
  const opened = await world.flow.startReview(planId, key(), JA);
  assert.equal(opened.reviewLeftThisMonth, 3, "opening is free");
  assert.equal(opened.draft.kind, "review");
  const again = await world.flow.startReview(planId, key(), JA);
  assert.equal(again.draft.draftId, opened.draft.draftId, "re-opening resumes the same draft");

  world.ai.next.reviewFix = { ok: false, operationId: "op-x", reason: "failed" } as never;
  await assert.rejects(world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "もっと投資家に寄せたい" }, JA));
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 3, "a failed review is not charged");

  const fixed = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "もっと投資家に寄せたい" }, JA);
  assert.equal(fixed.reviewLeftThisMonth, 2);
  assert.ok(fixed.draft.turns.at(-1)!.changes.length > 0);
  assert.ok(fixed.draft.turns.at(-1)!.changes.every((change) => change.accepted === true && /^t\d+-\d+$/.test(change.id ?? "")), "every change has an id and starts accepted");

  const unchanged = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA);
  assert.equal(unchanged.reviewLeftThisMonth, 1, "no change still counts");
  assert.equal(unchanged.draft.turns.at(-1)!.changes.length, 0);
});

test("the monthly 3 is shared by every goal, resets on the Tokyo 1st, and a replayed send is charged once", async () => {
  const clock = dialClock("2026-10-30T14:00:00.000Z");
  const world = flowWorld({ now: clock });
  const first = await confirmedPlan(world);
  const second = await confirmedPlan(world);
  const a = await world.flow.startReview(first.planId, key(), JA);
  const b = await world.flow.startReview(second.planId, key(), JA);
  const sameKey = key("send");
  await world.flow.reviewFix(a.draft.draftId, { idempotencyKey: sameKey, premise: [], text: "そのままでいい" }, JA);
  await world.flow.reviewFix(a.draft.draftId, { idempotencyKey: sameKey, premise: [], text: "そのままでいい" }, JA);
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 2, "the same key is charged once");
  await world.flow.reviewFix(b.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA);
  await world.flow.reviewFix(a.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA);
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 0, "two goals share the 3");
  const calls = world.ai.calls.reviewFix;
  await assert.rejects(world.flow.reviewFix(b.draft.draftId, { idempotencyKey: key(), premise: [], text: "もう一度" }, JA), rejects("REVIEW_LIMIT"));
  assert.equal(world.ai.calls.reviewFix, calls, "no AI call once the month is used up");
  const quota = await world.flow.quota();
  assert.equal(quota.resetsAt, "2026-10-31T15:00:00.000Z", "resets at 0:00 Tokyo on the 1st");

  clock.jump("2026-10-31T15:00:01.000Z");
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 3, "a new Tokyo month restores the 3");
});

test("concurrent sends stop at the limit", async () => {
  const world = flowWorld();
  const { planId } = await confirmedPlan(world);
  const opened = await world.flow.startReview(planId, key(), JA);
  await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA);
  await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA);
  const results = await Promise.allSettled([
    world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA),
    world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "そのままでいい" }, JA),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 0);
  const used = world.repository.dump(SCOPE).log.filter((entry) => entry.event === "review_used");
  assert.equal(used.length, 3);
});

test("toggling a change off rebuilds the plan from the base and keeps the total at 100", async () => {
  const world = flowWorld({ ai: countingAi(shiftingAi()) });
  const { planId } = await confirmedPlan(world);
  const opened = await world.flow.startReview(planId, key(), JA);
  const fixed = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "最初のタイプを厚く" }, JA);
  const total = (view: typeof fixed) => view.draft.content.personTypes.reduce((sum, type) => sum + type.allocation, 0) + view.draft.content.event.allocation;
  assert.equal(total(fixed), 100);
  const changes = fixed.draft.turns.at(-1)!.changes;
  const allocation = changes.find((change) => /^personTypes\.[^.]+$/.test(change.path));
  assert.ok(allocation, "the allocation change is listed");
  const off = await world.flow.toggleChange(opened.draft.draftId, allocation!.id!, { accepted: false, idempotencyKey: key() }, JA);
  assert.equal(total(off), 100, "still 100 after ✕");
  assert.equal(off.draft.turns.at(-1)!.changes.find((change) => change.id === allocation!.id)!.accepted, false);
  const on = await world.flow.toggleChange(opened.draft.draftId, allocation!.id!, { accepted: true, idempotencyKey: key() }, JA);
  assert.equal(on.draft.content.personTypes[0]!.allocation, fixed.draft.content.personTypes[0]!.allocation);
});

test("confirming a review updates the plan in place, re-checks earned points, and gives the manual edit back", async () => {
  const world = flowWorld({ ai: countingAi(shiftingAi()) });
  const { detail, planId } = await confirmedPlan(world);
  const second = detail.content.personTypes[1]!;
  // 第 2 个类型已经得了分，見直し把它挪低到已得之下 → 确定被拒。
  await world.planService.skip({ idempotencyKey: key(), itemId: second.itemId, planId });
  const opened = await world.flow.startReview(planId, key(), JA);
  const fixed = await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "最初のタイプを厚く" }, JA);
  await assert.rejects(world.flow.confirm(fixed.draft.draftId, key(), JA), rejects("INVALID_INPUT"), "a skipped type keeps its points");
  for (const change of fixed.draft.turns.at(-1)!.changes.filter((item) => /^personTypes\.[^.]+$/.test(item.path))) {
    await world.flow.toggleChange(fixed.draft.draftId, change.id!, { accepted: false, idempotencyKey: key() }, JA);
  }
  const result = await world.flow.confirm(fixed.draft.draftId, key(), JA);
  assert.equal(result.planId, planId);
  const after = (await world.planService.detail(planId))!;
  assert.equal(after.revision, detail.revision + 1);
  assert.match(after.content.steps[0]!.doneCriteria, /見直し/);
  assert.equal(after.content.personTypes.find((type) => type.itemId === second.itemId)!.allocation, second.allocation, "the skipped type is untouched");
  assert.equal(after.quota.manualEditAvailable, true);
  const revisions = world.repository.dump(SCOPE).revisions;
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0]!.source, "review");
});

test("a stale base revision is refused at confirm", async () => {
  const world = flowWorld();
  const { planId } = await confirmedPlan(world);
  const opened = await world.flow.startReview(planId, key(), JA);
  await world.flow.reviewFix(opened.draft.draftId, { idempotencyKey: key(), premise: [], text: "もっと投資家に寄せたい" }, JA);
  const detail = (await world.planService.detail(planId))!;
  await world.flow.editGoal(planId, { expectedRevision: detail.revision, goalText: "シリーズA を年内に", idempotencyKey: key(), mode: "save_only" }, JA);
  await assert.rejects(world.flow.confirm(opened.draft.draftId, key(), JA), rejects("STALE"));
});

test("the post-confirm manual edit opens a review draft without AI or quota, and is used up once", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const calls = { ...world.ai.calls };
  const draft = await world.flow.openManualEdit(planId, key(), JA);
  assert.equal(draft.kind, "review");
  const types = draft.content.personTypes;
  const result = await world.flow.manualEdit(draft.draftId, {
    event: { ...draft.content.event },
    expectedRevision: draft.revision,
    idempotencyKey: key(),
    personTypes: types.map((type, index) => ({ allocation: type.allocation + (index === 0 ? 5 : index === 1 ? -5 : 0), key: type.key, targetCount: type.targetCount })),
    steps: draft.content.steps.map((step) => ({ doneCriteria: step.doneCriteria, key: step.key, personTypeKeys: [...step.personTypeKeys], title: step.title })),
  }, JA);
  assert.equal(result.planId, planId);
  assert.deepEqual(world.ai.calls, calls, "no AI call");
  assert.equal((await world.flow.quota()).reviewLeftThisMonth, 3, "no quota used");
  const after = (await world.planService.detail(planId))!;
  assert.equal(after.content.personTypes[0]!.allocation, detail.content.personTypes[0]!.allocation + 5);
  assert.equal(after.quota.manualEditAvailable, false);
  await assert.rejects(world.flow.openManualEdit(planId, key(), JA), rejects("MANUAL_EDIT_USED"));
  assert.equal(world.repository.dump(SCOPE).revisions.at(-1)!.source, "manual_edit");
});

test("premise marks call the AI at most once a day per plan", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  await world.planService.award({ itemId: detail.content.personTypes[0]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
  const first = await world.flow.startReview(planId, key(), JA);
  await world.flow.startReview(planId, key(), JA);
  assert.equal(world.ai.calls.reviewMarks, 1);
  assert.equal(first.premiseMarks.length, 1);
  assert.equal(first.sinceConfirmed.talked, 1);
});

test("records made right after a Tokyo-early-morning confirm still count as 'since confirmed'", async () => {
  // 东京 10/11 00:10（UTC 10/10 15:10）确定：startsOn 是 10-11，记录的 UTC 时间戳以 2026-10-10 开头。
  const world = flowWorld({ now: dialClock("2026-10-10T15:10:00.000Z") });
  const { detail, planId } = await confirmedPlan(world);
  await world.planService.award({ itemId: detail.content.personTypes[0]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
  const review = await world.flow.startReview(planId, key(), JA);
  assert.equal(review.sinceConfirmed.talked, 1);
  assert.equal(world.ai.calls.reviewMarks, 1, "the record reaches the premise marks");
});
