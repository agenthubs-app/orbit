import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { PlanV2Error } from "../../features/plans/v2/service";
import { draftInput, SCOPE, serviceFor } from "./v2-fixture";

// R22 SC-R22-05 / SC-R22-09（内存仓储；Postgres 版的并发与唯一键见 tests/capabilities/plans-v2-service-postgres.test.ts）。
async function setup() {
  const repository = createMemoryPlanV2Repository();
  const service = serviceFor(repository);
  const created = await service.createPlanFromDraft(draftInput());
  const plan = created.plan;
  const typeId = (key: string) => plan.content.personTypes.find((type) => type.key === key)!.itemId;
  return { plan, repository, service, typeId };
}

test("createPlanFromDraft: one plan per draft, archives the v1 plan, a goal limit of 2", async () => {
  const repository = createMemoryPlanV2Repository();
  repository.seed(SCOPE, { activeV1PlanId: "v1-plan", maxVersion: 4 });
  const service = serviceFor(repository);
  const first = await service.createPlanFromDraft(draftInput());
  assert.equal(first.created, true);
  assert.equal(first.archivedV1PlanId, "v1-plan");
  assert.equal(first.plan.revision, 1);
  assert.equal(first.plan.score.total, 0);
  assert.equal(first.plan.quota.manualEditAvailable, true);
  assert.equal(repository.dump(SCOPE).plans[0]!.version, 5);
  const again = await service.createPlanFromDraft(draftInput());
  assert.equal(again.created, false);
  assert.equal(again.plan.planId, first.plan.planId);
  await assert.rejects(service.createPlanFromDraft(draftInput({ creationKey: "draft-x" })), (error: unknown) => error instanceof PlanV2Error && error.reason === "PLAN_GOAL_LIMIT");
  await service.createPlanFromDraft(draftInput({ creationKey: "draft-2", goalId: "intake-2" }));
  await assert.rejects(service.createPlanFromDraft(draftInput({ creationKey: "draft-3", goalId: "intake-3" })), (error: unknown) => error instanceof PlanV2Error && error.reason === "PLAN_GOAL_LIMIT");
});

test("createPlanFromDraft rejects an allocation that is not 100 or not in steps of 5, and unknown step types", async () => {
  const service = serviceFor(createMemoryPlanV2Repository());
  const base = draftInput();
  await assert.rejects(service.createPlanFromDraft({ ...base, content: { ...base.content, event: { allocation: 5, targetCount: 2 } } }), /allocation/);
  await assert.rejects(service.createPlanFromDraft({ ...base, content: { ...base.content, steps: [{ doneCriteria: "x", key: "s", personTypeKeys: ["nobody"], title: "x", why: null }] } }), /unknown person type/);
});

test("award: a named person counts once per type; a second time is a no-op; a retry with the same key replays", async () => {
  const { plan, service, typeId } = await setup();
  const first = await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:takahashi", idempotencyKey: "k1" } });
  assert.deepEqual([first.part, first.points, first.replayed, first.score.total], ["base", 10, false, 10]);
  const replay = await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:takahashi", idempotencyKey: "k1" } });
  assert.deepEqual([replay.points, replay.replayed, replay.awardLogId], [10, true, first.awardLogId]);
  const again = await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:takahashi", idempotencyKey: "k2" } });
  assert.deepEqual([again.part, again.reason, again.score.total], ["none", "already_counted", 10]);
  await assert.rejects(service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:other", idempotencyKey: "k1" } }), (error: unknown) => error instanceof PlanV2Error && error.reason === "IDEMPOTENCY_KEY_REUSED");
  const detail = await service.detail(plan.planId);
  assert.equal(detail!.revision, 1, "scoring does not bump the plan revision");
});

test("award: the remainder goes to the last person, then half points beyond the target; anonymous stops at the target", async () => {
  const { plan, service, typeId } = await setup();
  const award = (contactId: string | null, key: string) =>
    service.award({ itemId: typeId("funded_founder"), planId: plan.planId, request: contactId ? { basis: "talked", contactId, idempotencyKey: key } : { anonymous: true, basis: "self_report", idempotencyKey: key } });
  assert.equal((await award("contact:a", "a")).points, 7);
  assert.equal((await award(null, "anon-1")).points, 8);
  const anonOver = await award(null, "anon-2");
  assert.deepEqual([anonOver.part, anonOver.reason], ["none", "anonymous_over_target"]);
  const over = await award("contact:b", "b");
  assert.deepEqual([over.part, over.points], ["overflow", 3]);
  assert.equal(over.score.total, 18);
});

test("undo: a reversal takes the points back, and the same person can be recorded again", async () => {
  const { plan, service, typeId } = await setup();
  const first = await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "k1" } });
  const undone = await service.undo({ idempotencyKey: "u1", logId: first.awardLogId!, planId: plan.planId });
  assert.equal(undone.score.total, 0);
  const replay = await service.undo({ idempotencyKey: "u1", logId: first.awardLogId!, planId: plan.planId });
  assert.equal(replay.replayed, true);
  const noop = await service.undo({ idempotencyKey: "u2", logId: first.awardLogId!, planId: plan.planId });
  assert.equal(noop.score.total, 0);
  const again = await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "k3" } });
  assert.deepEqual([again.part, again.points, again.score.total], ["base", 10, 10]);
});

test("skip: the full allocation minus what was earned, no points while skipped, unskip returns to the earned points", async () => {
  const { plan, service, typeId } = await setup();
  await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "k1" } });
  const skipped = await service.skip({ idempotencyKey: "s1", itemId: typeId("vc_partner"), planId: plan.planId });
  assert.equal(skipped.score.total, 30);
  assert.equal(skipped.score.skipped, 20);
  assert.equal(skipped.score.segments.find((segment) => segment.key === "vc_partner")!.skipped, true);
  const blocked = await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:u", idempotencyKey: "k2" } });
  assert.deepEqual([blocked.part, blocked.reason], ["none", "skipped"]);
  const back = await service.unskip({ idempotencyKey: "s2", itemId: typeId("vc_partner"), planId: plan.planId });
  assert.equal(back.score.total, 10);
  assert.equal(back.score.skipped, 0);
});

test("steps: complete, reopen and complete again (the log key carries a counter)", async () => {
  const { plan, service } = await setup();
  const done = await service.setStepCompleted({ completed: true, idempotencyKey: "c1", planId: plan.planId, stepKey: "s1" });
  assert.ok(done.completedAt);
  await service.setStepCompleted({ completed: false, idempotencyKey: "c2", planId: plan.planId, stepKey: "s1" });
  assert.equal((await service.detail(plan.planId))!.content.steps[0]!.completedAt, null);
  await service.setStepCompleted({ completed: true, idempotencyKey: "c3", planId: plan.planId, stepKey: "s1" });
  assert.ok((await service.detail(plan.planId))!.content.steps[0]!.completedAt);
  await assert.rejects(service.setStepCompleted({ completed: true, idempotencyKey: "c4", planId: plan.planId, stepKey: "nope" }), (error: unknown) => error instanceof PlanV2Error && error.reason === "STEP_NOT_FOUND");
});

test("references: an unknown contact is refused; a plan of another person does not exist", async () => {
  const { plan, repository, service, typeId } = await setup();
  await assert.rejects(service.award({ itemId: typeId("cfo"), planId: plan.planId, request: { basis: "talked", contactId: "missing-1", idempotencyKey: "m" } }), (error: unknown) => error instanceof PlanV2Error && error.reason === "REFERENCE_NOT_FOUND");
  const bob = serviceFor(repository, { ...SCOPE, actorId: "actor:bob" });
  assert.equal(await bob.detail(plan.planId), null);
  await assert.rejects(bob.award({ itemId: typeId("cfo"), planId: plan.planId, request: { basis: "talked", contactId: "contact:x", idempotencyKey: "b" } }), (error: unknown) => error instanceof PlanV2Error && error.reason === "PLAN_NOT_FOUND");
});

test("summary and goals: the most recently opened goal is current", async () => {
  const { plan, service } = await setup();
  const second = await service.createPlanFromDraft(draftInput({ creationKey: "draft-2", goalId: "intake-2", goalText: "採用" }));
  let summary = await service.summary();
  assert.equal(summary.current!.planId, second.plan.planId);
  await service.markOpened(plan.planId);
  summary = await service.summary();
  assert.equal(summary.current!.planId, plan.planId);
  assert.equal(summary.goals.length, 2);
  assert.ok(summary.goals.every((goal) => goal.status === "active"));
});

test("events: add to a plan once; attendance scores every active goal with an event block, once each", async () => {
  const { plan, service } = await setup();
  const second = await service.createPlanFromDraft(draftInput({ creationKey: "draft-2", goalId: "intake-2" }));
  const added = await service.addEventToPlan({ eventId: "event:1", planId: plan.planId, title: "CFO Night" });
  assert.equal(added!.created, true);
  assert.equal((await service.addEventToPlan({ eventId: "event:1", planId: plan.planId }))!.created, false);
  await assert.rejects(service.addEventToPlan({ eventId: "missing-event" }), /Event not found/);
  const attended = await service.recordEventAttendanceForPlans({ eventId: "event:1", title: "CFO Night" });
  assert.deepEqual(attended.map((item) => [item.planId, item.points]).sort(), [[plan.planId, 5], [second.plan.planId, 5]].sort());
  assert.deepEqual(await service.recordEventAttendanceForPlans({ eventId: "event:1" }), [], "attending again does not score again");
  const remaining = await service.planRemainingTargets();
  assert.equal(remaining.find((item) => item.planId === plan.planId)!.event.remaining, 1);
});

test("remaining targets and active type needs", async () => {
  const { plan, service, typeId } = await setup();
  await service.award({ itemId: typeId("vc_partner"), planId: plan.planId, request: { basis: "talked", contactId: "contact:t", idempotencyKey: "k1" } });
  await service.skip({ idempotencyKey: "s1", itemId: typeId("lawyer"), planId: plan.planId });
  const remaining = (await service.planRemainingTargets())[0]!;
  assert.equal(remaining.types.find((type) => type.key === "vc_partner")!.remaining, 2);
  assert.equal(remaining.types.find((type) => type.key === "lawyer")!.remaining, 0);
  const { needs, plans } = await service.activeTypeNeeds();
  assert.equal(needs.length, 6);
  assert.deepEqual(plans.map((item) => item.planId), [plan.planId]);
  assert.deepEqual(needs.find((need) => need.itemId === typeId("vc_partner"))!.contactLinks.map((link) => [link.contactId, link.state]), [["contact:t", "established"]]);
});
