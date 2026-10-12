import assert from "node:assert/strict";
import test from "node:test";

import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { planIntakeViewSchema, planMemberCandidatesResponseSchema } from "../../shared/api-schema/plan-v2";

// 计划页像素返工（mock）：GET …/intakes/[intakeId]/member-candidates 与 POST …/intakes/[intakeId]/background/reopen 走路由、过契约 schema。
type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
const call = (handler: Handler, method: string, params: Record<string, string> = {}, body?: unknown) =>
  handler(new Request("http://localhost/api/agent/plans/intakes", { method, ...(body ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json" } }), { params: Promise.resolve(params) });
const json = async (response: Response) => (await response.json()) as { data?: unknown; error?: { context?: { reason?: string } } };

test("mock: member candidates, then reopening the background after the questions", async () => {
  resetPlansV2MockRepositoryForTests();
  const h = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  let intake = planIntakeViewSchema.parse((await json(await call(h.createIntake, "POST", {}, { goalKind: "fundraising", goalText: "シリーズA の資金調達をしたい", idempotencyKey: "mc-c1", source: "task" }))).data);
  const params = { intakeId: intake.intakeId };

  const listedResponse = await call(h.memberCandidates, "GET", params);
  assert.equal(listedResponse.status, 200);
  const listed = planMemberCandidatesResponseSchema.parse((await json(listedResponse)).data);
  assert.ok(listed.candidates.length > 0, "the mock world has people to pick");
  const inTeam = new Set(intake.background.team.value.members.map((member) => member.contactId));
  assert.equal(listed.candidates.some((candidate) => inTeam.has(candidate.contactId)), false);
  assert.equal((await call(h.memberCandidates, "GET", { intakeId: "nope" })).status, 404);

  // 背景还开着时重开 = 什么都不做。
  const noop = planIntakeViewSchema.parse((await json(await call(h.reopenBackground, "POST", params, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: "mc-r0" }))).data);
  assert.equal(noop.updatedAt, intake.updatedAt);

  intake = planIntakeViewSchema.parse((await json(await call(h.confirmBlock, "PATCH", params, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "mc-b1", me: { stance: "owner", wants: intake.background.me.value.wants } }))).data);
  const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
  intake = planIntakeViewSchema.parse((await json(await call(h.confirmBlock, "PATCH", params, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "mc-b2", team: { members, mode: intake.background.team.value.mode } }))).data);
  intake = planIntakeViewSchema.parse((await json(await call(h.confirmBlock, "PATCH", params, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "mc-b3", purpose: { selectedLevel: 3 } }))).data);
  intake = planIntakeViewSchema.parse((await json(await call(h.questions, "POST", params, { idempotencyKey: "mc-q1" }))).data);
  assert.equal(intake.status, "questions");

  const locked = await call(h.confirmBlock, "PATCH", params, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "mc-b4", purpose: { selectedLevel: 2 } });
  assert.equal((await json(locked)).error?.context?.reason, "BACKGROUND_LOCKED", "after the questions the background is locked…");
  const bad = await call(h.reopenBackground, "POST", params, { idempotencyKey: "mc-r1" });
  assert.equal(bad.status, 400, "expectedUpdatedAt is required");
  const stale = await call(h.reopenBackground, "POST", params, { expectedUpdatedAt: "2000-01-01T00:00:00.000Z", idempotencyKey: "mc-r2" });
  assert.equal(stale.status, 409);
  assert.equal((await json(stale)).error?.context?.reason, "STALE");
  const reopened = planIntakeViewSchema.parse((await json(await call(h.reopenBackground, "POST", params, { expectedUpdatedAt: intake.updatedAt, idempotencyKey: "mc-r3" }))).data);
  assert.equal(reopened.status, "background", "…until it is reopened explicitly");
  assert.equal(reopened.questions, null);
  const old = await call(h.answers, "POST", params, { answers: [], idempotencyKey: "mc-a1" });
  assert.equal((await json(old)).error?.context?.reason, "QUESTIONS_NOT_READY");
  resetPlansV2MockRepositoryForTests();
});
