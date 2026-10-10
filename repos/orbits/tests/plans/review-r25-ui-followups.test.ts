/**
 * R25 App 界面任务发现的服务端问题：
 * 1. 見直し草稿（kind review，没有 intake）的 `GET drafts/[draftId]` 原来 `goal: ""` → 过不了 schema → 500；现在用计划本身的目标文。
 * 2. 概要详情带 `sinceConfirmed`（見直し入口弹层「話した N 人 · イベント N 回 · Step 完了 N」），与 reviewView 同一口径。
 * 3. `premiseMarks[].evidence`：按 evidenceIds 给记录摘要（文字 + 时间），读不到的 id 跳过。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { planDraftViewSchema, planReviewViewSchema, planV2DetailSchema } from "../../shared/api-schema/plan-v2";
import { flowWorld, JA, key, premiseReady } from "./flow-fixture";

async function confirmedPlan(world: ReturnType<typeof flowWorld>) {
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const confirmed = await world.flow.confirm(draft.draftId, key(), JA);
  return { detail: (await world.planService.detail(confirmed.planId))!, planId: confirmed.planId };
}

test("1: a review draft read by id carries the plan's goal (no intake) and passes its own schema", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const review = await world.flow.startReview(planId, key(), JA);
  const read = await world.flow.getDraft(review.draft.draftId, JA);
  assert.ok(read);
  assert.equal(read.kind, "review");
  assert.equal(read.goal, detail.goal);
  assert.equal(read.goalKind, detail.goalKind);
  assert.doesNotThrow(() => planDraftViewSchema.parse(read));
});

test("2: the plan detail carries sinceConfirmed with the same counts as the review view", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const itemId = detail.content.personTypes[0]!.itemId;
  await world.planService.award({ itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
  await world.planService.award({ itemId: detail.content.personTypes[1]!.itemId, planId, request: { anonymous: true, basis: "self_report", idempotencyKey: key() } });
  const undone = await world.planService.award({ itemId: detail.content.personTypes[2]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-aoki", idempotencyKey: key() } });
  await world.planService.undo({ idempotencyKey: key(), logId: undone.awardLogId!, planId });
  await world.planService.recordEventAttendanceForPlans({ eventId: "event:x" });
  await world.planService.setStepCompleted({ completed: true, idempotencyKey: key(), planId, stepKey: detail.content.steps[0]!.key });
  const after = planV2DetailSchema.parse(await world.planService.detail(planId));
  const review = await world.flow.startReview(planId, key(), JA);
  assert.deepEqual(after.sinceConfirmed, { events: review.sinceConfirmed.events, stepsDone: review.sinceConfirmed.stepsCompleted, talkedPeople: review.sinceConfirmed.talked });
  assert.deepEqual(after.sinceConfirmed, { events: after.content.event.allocation > 0 ? 1 : 0, stepsDone: 1, talkedPeople: 2 }, "an undone score does not count");
  const overview = await world.planService.overview(planId);
  assert.deepEqual(overview!.sinceConfirmed, after.sinceConfirmed);
});

test("3: premise marks carry an evidence summary (record text + time) for their evidence ids", async () => {
  const world = flowWorld();
  const { detail, planId } = await confirmedPlan(world);
  const award = await world.planService.award({ itemId: detail.content.personTypes[0]!.itemId, planId, request: { basis: "talked", contactId: "demo-person-ito", idempotencyKey: key() } });
  const review = planReviewViewSchema.parse(await world.flow.startReview(planId, key(), JA));
  const mark = review.premiseMarks[0]!;
  assert.deepEqual(mark.evidenceIds, [award.awardLogId]);
  assert.equal(mark.evidence!.length, 1);
  const evidence = mark.evidence![0]!;
  assert.equal(evidence.id, award.awardLogId);
  assert.match(evidence.text, new RegExp(detail.content.personTypes[0]!.shortLabel));
  assert.ok(Number.isFinite(Date.parse(evidence.at)));
  assert.ok(!evidence.text.includes("demo-person-ito"), "no contact id in the summary");
});
