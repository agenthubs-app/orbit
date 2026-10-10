import assert from "node:assert/strict";
import test from "node:test";

import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { planAwardResultSchema, planV2DetailSchema, planV2SummaryResponseSchema } from "../../shared/api-schema/plan-v2";
import { DEMO_PLAN } from "../../shared/mock/demo-world";
import { demoPlanDetail } from "../../shared/mock/demo-world/fixtures";
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import { draftInput, serviceFor } from "../plans/v2-fixture";

// R22 SC-R22-04 / 05：计划 v2 路由。mock 读写演示世界的示例计划；live 要登录、只看本人；后端未配置时 503 NOT_IMPLEMENTED。
type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api/agent/plans/v2", { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
const call = (handler: Handler, method: string, params: Record<string, string> = {}, body?: unknown) => handler(request(method, body), { params: Promise.resolve(params) });

test("mock: the demo plan is served and scored without login, every answer passes its contract schema", async () => {
  resetPlansV2MockRepositoryForTests();
  const handlers = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const summary = await call(handlers.summary, "GET");
  assert.equal(summary.status, 200);
  assert.equal(summary.headers.get("X-Orbit-Feature-Mode"), "mock");
  const summaryBody = planV2SummaryResponseSchema.parse((await summary.json()).data);
  assert.equal(summaryBody.current!.planId, DEMO_PLAN.id);
  assert.equal(summaryBody.current!.sample, true);
  assert.equal(summaryBody.current!.score.total, demoPlanDetail.score.total);

  const detail = await call(handlers.detail, "GET", { planId: DEMO_PLAN.id });
  assert.equal(detail.status, 200);
  const detailBody = planV2DetailSchema.parse((await detail.json()).data);
  const cfo = detailBody.content.personTypes.find((type) => type.key === "cfo")!;
  const awarded = await call(handlers.award, "POST", { itemId: cfo.itemId, planId: DEMO_PLAN.id }, { basis: "talked", contactId: "demo-person-ito", idempotencyKey: "k-1" });
  assert.equal(awarded.status, 201);
  const result = planAwardResultSchema.parse((await awarded.json()).data);
  assert.equal(result.points, 10);
  assert.equal(result.score.total, demoPlanDetail.score.total + 10);
  const replay = await call(handlers.award, "POST", { itemId: cfo.itemId, planId: DEMO_PLAN.id }, { basis: "talked", contactId: "demo-person-ito", idempotencyKey: "k-1" });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).data.replayed, true);
  resetPlansV2MockRepositoryForTests();
});

test("requests are strict: an unknown field or both a contact and anonymous is a 400", async () => {
  resetPlansV2MockRepositoryForTests();
  const handlers = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const params = { itemId: demoPlanDetail.content.personTypes[0]!.itemId, planId: DEMO_PLAN.id };
  for (const body of [
    { basis: "talked", contactId: "c", extra: 1, idempotencyKey: "k" },
    { anonymous: true, basis: "talked", contactId: "c", idempotencyKey: "k" },
    { basis: "talked", idempotencyKey: "k" },
  ]) {
    const response = await call(handlers.award, "POST", params, body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await response.json()).error.context.reason, "INVALID_INPUT");
  }
  const unknown = await call(handlers.detail, "GET", { planId: "nope" });
  assert.equal(unknown.status, 404);
  resetPlansV2MockRepositoryForTests();
});

test("live: login is required; a person only sees their own plans; a missing backend is NOT_IMPLEMENTED", async () => {
  const repository = createMemoryPlanV2Repository();
  const alice = serviceFor(repository, { actorId: "actor:alice", workspaceId: "w" });
  const { plan } = await alice.createPlanFromDraft(draftInput());
  const live = (actorId: string | null) => createPlanV2Handlers({
    resolveActor: async () => (actorId ? { id: actorId } : null),
    resolveMode: () => "live",
    resolveService: ({ actorId: id }) => ({ mode: "live", service: serviceFor(repository, { actorId: id, workspaceId: "w" }), success: true }),
  });

  assert.equal((await call(live(null).summary, "GET")).status, 401);
  const own = await call(live("actor:alice").detail, "GET", { planId: plan.planId });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("X-Orbit-Feature-Mode"), "live");
  const other = await call(live("actor:bob").detail, "GET", { planId: plan.planId });
  assert.equal(other.status, 404);
  const bobSummary = planV2SummaryResponseSchema.parse((await (await call(live("actor:bob").summary, "GET")).json()).data);
  assert.deepEqual(bobSummary, { current: null, goals: [] });
  const text = await (await call(live("actor:bob").summary, "GET")).text();
  assert.doesNotMatch(text, /demo-|sample|シリーズ/u, "live never answers with the demo world");

  const missing = createPlanV2Handlers({
    resolveActor: async () => ({ id: "actor:alice" }),
    resolveMode: () => "live",
    resolveService: () => createNotImplementedFailure("plans", "live", ["mock"]),
  });
  const response = await call(missing.summary, "GET");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.context.reason, "NOT_IMPLEMENTED");
});

test("live commands: skip, undo and steps answer with the new score; an achieved plan is a 409", async () => {
  const repository = createMemoryPlanV2Repository();
  const scope = { actorId: "actor:alice", workspaceId: "w" };
  const service = serviceFor(repository, scope);
  const { plan } = await service.createPlanFromDraft(draftInput());
  const handlers = createPlanV2Handlers({ resolveActor: async () => ({ id: scope.actorId }), resolveMode: () => "live", resolveService: () => ({ mode: "live", service, success: true }) });
  const lawyer = plan.content.personTypes.find((type) => type.key === "lawyer")!.itemId;
  const skipped = await call(handlers.skip, "POST", { itemId: lawyer, planId: plan.planId }, { idempotencyKey: "s" });
  assert.equal((await skipped.json()).data.score.total, 10);
  const back = await call(handlers.unskip, "DELETE", { itemId: lawyer, planId: plan.planId }, { idempotencyKey: "s2" });
  assert.equal((await back.json()).data.score.total, 0);
  const step = await call(handlers.completeStep, "POST", { planId: plan.planId, stepKey: "s1" }, { idempotencyKey: "c" });
  assert.ok((await step.json()).data.completedAt);
  const state = repository.dump(scope);
  repository.seed(scope, { ...state, plans: state.plans.map((row) => ({ ...row, achievedAt: "2026-10-07T00:00:00.000Z", archivedAt: "2026-10-07T00:00:00.000Z", status: "archived" as const })) });
  const late = await call(handlers.award, "POST", { itemId: lawyer, planId: plan.planId }, { anonymous: true, basis: "self_report", idempotencyKey: "late" });
  assert.equal(late.status, 409);
  assert.equal((await late.json()).error.context.reason, "PLAN_ACHIEVED");
});

test("R24 mock routes: overview extras, type detail, candidate decision, offline talk, drafts, pending, fit — all pass their schemas", async () => {
  resetPlansV2MockRepositoryForTests();
  const handlers = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock" });
  const { planContactFitSchema, planPendingListResponseSchema, planPersonTypeDetailSchema, planTalkedOfflineResultSchema, planCandidateDecisionResultSchema, planIntroDraftResultSchema, planProposalResultSchema } = await import("../../shared/api-schema/plan-v2");
  const detail = planV2DetailSchema.parse((await (await call(handlers.detail, "GET", { planId: DEMO_PLAN.id })).json()).data);
  assert.ok(detail.typeStats && detail.stepProgress && detail.recentAwards);
  const cvc = detail.content.personTypes.find((type) => type.key === "cvc")!;
  const type = planPersonTypeDetailSchema.parse((await (await call(handlers.typeDetail, "GET", { itemId: cvc.itemId, planId: DEMO_PLAN.id })).json()).data);
  assert.equal(type.candidates[0]!.contactId, "demo-person-sasaki");
  assert.ok(type.events.length > 0);
  const decided = await call(handlers.candidateDecision, "POST", { contactId: "demo-person-sasaki", itemId: cvc.itemId, planId: DEMO_PLAN.id }, { decision: "accept", idempotencyKey: "d1" });
  assert.equal(planCandidateDecisionResultSchema.parse((await decided.json()).data).status, "accepted");
  const offline = await call(handlers.talkedOffline, "POST", { itemId: cvc.itemId, planId: DEMO_PLAN.id }, { idempotencyKey: "o1", name: "佐々木" });
  assert.deepEqual(planTalkedOfflineResultSchema.parse((await offline.json()).data).matches?.map((match) => match.contactId), ["demo-person-sasaki"]);
  const proposal = await call(handlers.proposal, "POST", { itemId: cvc.itemId, planId: DEMO_PLAN.id }, { contactId: "demo-person-sasaki", idempotencyKey: "p1", slots: ["2026-10-09T10:00:00+09:00", "2026-10-10T10:00:00+09:00", "2026-10-11T10:00:00+09:00"] });
  assert.equal(planProposalResultSchema.parse((await proposal.json()).data).kind, "draft");
  const angel = detail.content.personTypes.find((item) => item.key === "angel")!;
  const intro = await call(handlers.introDraft, "POST", { itemId: angel.itemId, planId: DEMO_PLAN.id }, { idempotencyKey: "i1", viaContactId: "nobody" });
  assert.equal(intro.status, 404);
  void planIntroDraftResultSchema;
  planPendingListResponseSchema.parse((await (await call(handlers.pending, "GET")).json()).data);
  const fit = planContactFitSchema.parse((await (await call(handlers.contactFit, "GET", { contactId: "demo-person-takahashi" })).json()).data);
  assert.equal(fit.fits[0]!.status, "talked");
  resetPlansV2MockRepositoryForTests();
});

test("R24 live routes require login", async () => {
  const handlers = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "live" });
  for (const [handler, params] of [[handlers.typeDetail, { itemId: "i", planId: "p" }], [handlers.pending, {}], [handlers.contactFit, { contactId: "c" }]] as const) {
    assert.equal((await call(handler as Handler, "GET", params)).status, 401);
  }
});
