import assert from "node:assert/strict";
import test from "node:test";

import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import {
  planConfirmResultSchema,
  planDraftViewSchema,
  planGoalKindResultSchema,
  planIntakeListResponseSchema,
  planIntakeViewSchema,
} from "../../shared/api-schema/plan-v2";
import { createNotImplementedFailure } from "../../shared/services/module-mode";

// R23 SC-R23-06 端到端（mock）：路由从空态走到「确定了一份 v2 计划」，每个响应都过契约 schema。
type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
const call = (handler: Handler, method: string, params: Record<string, string> = {}, body?: unknown, headers: Record<string, string> = {}) =>
  handler(new Request("http://localhost/api/agent/plans/intakes", { method, ...(body ? { body: JSON.stringify(body) } : {}), headers: { "content-type": "application/json", ...headers } }), { params: Promise.resolve(params) });
const data = async (response: Response) => (await response.json()).data;

test("mock: goal input → background → questions → premise → draft → AI fix → confirm, all through the routes", async () => {
  resetPlansV2MockRepositoryForTests();
  const h = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const kind = planGoalKindResultSchema.parse(await data(await call(h.goalKind, "POST", {}, { text: "シリーズA の資金調達をしたい" })));
  assert.equal(kind.goalKind, "fundraising");

  const created = await call(h.createIntake, "POST", {}, { goalKind: kind.goalKind, goalText: "シリーズA の資金調達をしたい", idempotencyKey: "c1", source: "task" });
  assert.equal(created.status, 201);
  let intake = planIntakeViewSchema.parse(await data(created));
  const params = { intakeId: intake.intakeId };
  const list = planIntakeListResponseSchema.parse(await data(await call(h.listIntakes, "GET")));
  assert.ok(list.intakes.some((item) => item.intakeId === intake.intakeId));
  assert.equal(list.activeGoals, 1, "the demo world already has one sample goal");

  intake = planIntakeViewSchema.parse(await data(await call(h.confirmBlock, "PATCH", params, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "b1", me: { stance: "owner", wants: intake.background.me.value.wants } })));
  const members = intake.background.team.value.members.map((member) => ({ capabilities: [...member.capabilities], memberId: member.memberId, otherCapabilities: [], relation: member.relation }));
  intake = planIntakeViewSchema.parse(await data(await call(h.confirmBlock, "PATCH", params, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "b2", team: { members, mode: intake.background.team.value.mode } })));
  intake = planIntakeViewSchema.parse(await data(await call(h.confirmBlock, "PATCH", params, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "b3", purpose: { selectedLevel: 3 } })));
  intake = planIntakeViewSchema.parse(await data(await call(h.questions, "POST", params, { idempotencyKey: "q1" })));
  assert.equal(intake.status, "questions");
  intake = planIntakeViewSchema.parse(await data(await call(h.answers, "POST", params, { answers: [], idempotencyKey: "a1" })));
  assert.equal(intake.status, "premise");

  const drafted = await call(h.draft, "POST", params, { idempotencyKey: "d1" });
  assert.equal(drafted.status, 201);
  let draft = planDraftViewSchema.parse(await data(drafted));
  draft = planDraftViewSchema.parse(await data(await call(h.fix, "POST", { draftId: draft.draftId }, { idempotencyKey: "f1", text: "営業は 2 人でやる" })));
  assert.equal(draft.aiFixUsed, 1);
  const confirmed = await call(h.confirm, "POST", { draftId: draft.draftId }, { idempotencyKey: "ok1" });
  assert.equal(confirmed.status, 201);
  const result = planConfirmResultSchema.parse(await data(confirmed));
  assert.match(result.href, /^\/app\/tasks\?tab=plan&plan=/);
  const again = await call(h.confirm, "POST", { draftId: draft.draftId }, { idempotencyKey: "ok2" });
  assert.equal(again.status, 200);
  resetPlansV2MockRepositoryForTests();
});

test("the App asks for App deep links with x-orbit-platform: app", async () => {
  resetPlansV2MockRepositoryForTests();
  const h = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const intake = planIntakeViewSchema.parse(await data(await call(h.createIntake, "POST", {}, { goalKind: "career", goalText: "転職したい", idempotencyKey: "app-1", source: "task" }, { "x-orbit-lang": "en", "x-orbit-platform": "app" })));
  assert.equal(intake.href, `/plans/flow/${intake.intakeId}`);
  resetPlansV2MockRepositoryForTests();
});

test("requests are strict; unknown flows are 404; errors carry a reason", async () => {
  resetPlansV2MockRepositoryForTests();
  const h = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const bad = await call(h.createIntake, "POST", {}, { goalKind: "fundraising", goalText: "x", idempotencyKey: "k", source: "task", extra: 1 });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.context.reason, "INVALID_INPUT");
  const missing = await call(h.getIntake, "GET", { intakeId: "nope" });
  assert.equal(missing.status, 404);
  const draftMissing = await call(h.getDraft, "GET", { draftId: "nope" });
  assert.equal(draftMissing.status, 404);
  const order = await call(h.questions, "POST", { intakeId: "nope" }, { idempotencyKey: "q" });
  assert.equal(order.status, 404);
  resetPlansV2MockRepositoryForTests();
});

test("live: login is required; a missing backend is 503", async () => {
  const anonymous = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "live" });
  assert.equal((await call(anonymous.listIntakes, "GET")).status, 401);
  const noBackend = createPlanFlowHandlers({
    resolveActor: async () => ({ id: "actor:alice" }) as never,
    resolveMode: () => "live",
    resolveService: () => createNotImplementedFailure("plans", "live", ["mock"]),
  });
  assert.equal((await call(noBackend.listIntakes, "GET")).status, 503);
});
