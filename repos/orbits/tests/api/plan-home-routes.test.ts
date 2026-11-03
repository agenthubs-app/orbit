import assert from "node:assert/strict";
import test from "node:test";

import { createMockPlanPrepAi, createDeepseekPlanPrepAi } from "../../features/plans/prep/ai";
import { createPlanHomeHandlers, schedulePlanHome } from "../../features/plans/prep/handlers";
import { createPlanPrepService, type PlanPrepService } from "../../features/plans/prep/service";
import type { PlanPrepContext } from "../../features/plans/prep/types";
import type { ContactFact, ContactFactStore } from "../../features/contacts/facts/types";
import { createPlanFlowHandlers } from "../../features/plans/v2/flow-handlers";
import { createPlanV2Handlers } from "../../features/plans/v2/handlers";
import { resetPlansV2MockRepositoryForTests } from "../../features/plans/v2/service-factory";
import { contactManualFactResultSchema, planHomeViewSchema, planV2DetailSchema } from "../../shared/api-schema/plan-v2";
import { SCOPE } from "../plans/v2-fixture";
import { flowWorld, JA, key, premiseReady } from "../plans/flow-fixture";

type Handler = (request: Request, context?: { params?: Promise<Record<string, string>> }) => Promise<Response>;
const call = (handler: Handler, params: Record<string, string>, body?: unknown, method = "POST") =>
  handler(new Request("http://localhost/api/x?lang=ja", { method, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }), headers: { "content-type": "application/json" } }), { params: Promise.resolve(params) });
const json = async (response: Response) => (await response.json()) as { data?: unknown; error?: { code: string }; reason?: string; [key: string]: unknown };

const context: PlanPrepContext = {
  async contacts(_actor, ids) { return ids.filter((id) => id.startsWith("contact:")).map((id) => ({ createdAt: null, id, industry: null, lastInteractionAt: null, lastInteractionLabel: null, name: "佐藤", organization: null, role: null, sourceEventTitle: null, sourceLabel: null })); },
  async facts() { return []; },
  async profile() { return { homeMarket: null, industry: null, name: "李", organization: "星橋", role: null, spokenLanguages: [] }; },
};

async function preparedWorld(): Promise<{ planId: string; prep: PlanPrepService }> {
  const world = flowWorld();
  const premise = await premiseReady(world);
  const draft = await world.flow.makeDraft(premise.intakeId, key(), JA);
  const { planId } = await world.flow.confirm(draft.draftId, key(), JA);
  const state = world.repository.dump(SCOPE);
  state.typeItems.find((item) => item.planId === planId)!.contactLinks = [{ contactId: "contact:sato", establishedAt: null, linkedAt: "2026-11-01T00:00:00Z", state: "linked" }];
  state.contacts = [{ id: "contact:sato", isOrbitUser: false, lastInteractionAt: null, name: "佐藤", organization: null, role: null }];
  world.repository.seed(SCOPE, state);
  const prep = createPlanPrepService({ ai: createMockPlanPrepAi(), context, repository: world.repository, scope: SCOPE });
  await prep.ensure(planId, "ja");
  return { planId, prep };
}

const deps = (prep: PlanPrepService, extra: Parameters<typeof createPlanHomeHandlers>[0] = {}) => ({ resolveActor: async () => ({ id: SCOPE.actorId }) as never, resolveMode: () => "live" as const, resolveService: () => ({ mode: "live" as const, service: prep, success: true as const }), ...extra });

test("done: strict body, persists, idempotent, unknown action → 404", async () => {
  const { planId, prep } = await preparedWorld();
  const h = createPlanHomeHandlers(deps(prep));
  const params = { actionKey: "c:contact:sato", planId };
  assert.equal((await call(h.done, params, { done: true, idempotencyKey: "d1", extra: 1 })).status, 400);
  const response = await call(h.done, params, { done: true, idempotencyKey: "d1" });
  assert.equal(response.status, 200);
  const view = planHomeViewSchema.parse((await json(response)).data);
  assert.equal(view.actions[0]!.done, true);
  assert.equal((await call(h.done, params, { done: true, idempotencyKey: "d2" })).status, 200);
  assert.equal((await call(h.done, { actionKey: "c:none", planId }, { done: true, idempotencyKey: "d3" })).status, 404);
});

test("regenerate: 200 with the new card; LIMIT → 409 reason LIMIT", async () => {
  const { planId, prep } = await preparedWorld();
  const ok = createPlanHomeHandlers(deps(prep));
  const response = await call(ok.regenerate, { actionKey: "c:contact:sato", planId }, { idempotencyKey: "r1" });
  assert.equal(response.status, 200);
  planHomeViewSchema.parse((await json(response)).data);
  const limited: PlanPrepService = { ...prep, regenerate: async () => { throw new (await import("../../features/plans/prep/service")).PlanPrepError("LIMIT", "limit"); } };
  const refused = await call(createPlanHomeHandlers(deps(limited)).regenerate, { actionKey: "c:contact:sato", planId }, { idempotencyKey: "r2" });
  assert.equal(refused.status, 409);
  assert.equal(((await json(refused)).error as { context?: { reason?: string } }).context?.reason, "LIMIT");
});

test("manual fact: own contact only, ≤80 chars, writes a manual fact and marks cards stale", async () => {
  const { planId, prep } = await preparedWorld();
  const saved: ContactFact[] = [];
  const store: ContactFactStore = {
    async get({ id }) { return saved.find((fact) => fact.id === id) ?? null; },
    async list() { return saved; },
    async save(fact) { const at = saved.findIndex((item) => item.id === fact.id); if (at >= 0) saved[at] = fact; else saved.push(fact); },
  };
  const stale: string[] = [];
  const h = createPlanHomeHandlers(deps(prep, { factStore: () => store, markStale: async ({ contactId }) => { stale.push(contactId); return prep.markStale(contactId); } }));
  assert.equal((await call(h.manualFact, { id: "someone-else" }, { idempotencyKey: "m0", text: "x" })).status, 404, "not my contact");
  assert.equal((await call(h.manualFact, { id: "contact:sato" }, { idempotencyKey: "m1", text: "あ".repeat(81) })).status, 400);
  const response = await call(h.manualFact, { id: "contact:sato" }, { idempotencyKey: "m2", text: "上海で3年働いていた" });
  assert.equal(response.status, 201);
  const result = contactManualFactResultSchema.parse((await json(response)).data);
  assert.equal(result.staleCards, 1);
  assert.equal(saved[0]!.field, "manual");
  assert.deepEqual(stale, ["contact:sato"]);
  void planId;
});

test("routes schedule prep: GET detail of a v3 plan still pending, and a new confirm (not a replay)", async () => {
  resetPlansV2MockRepositoryForTests();
  const scheduled: string[] = [];
  const schedule = (input: { planId: string }) => { scheduled.push(input.planId); };
  const flow = createPlanFlowHandlers({ resolveActor: async () => null, resolveMode: () => "mock", schedulePlanHome: schedule });
  const plans = createPlanV2Handlers({ resolveActor: async () => null, resolveMode: () => "mock", schedulePlanHome: schedule });
  const go = (handler: Handler, params: Record<string, string>, body?: unknown, method = "POST") => call(handler, params, body, method).then(json);
  let intake = (await go(flow.createIntake, {}, { goalKind: "fundraising", goalText: "シード資金を集めたい", idempotencyKey: "c1", source: "task" })).data as { intakeId: string; updatedAt: string; background: { me: { value: { wants: string[] } }; team: { value: { members: Array<{ capabilities: string[]; memberId: string; relation: string }>; mode: string } } } };
  const p = { intakeId: intake.intakeId };
  intake = (await go(flow.confirmBlock, p, { block: "me", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "b1", me: { stance: "owner", wants: intake.background.me.value.wants } }, "PATCH")).data as typeof intake;
  intake = (await go(flow.confirmBlock, p, { block: "team", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "b2", team: { members: intake.background.team.value.members.map((m) => ({ capabilities: [...m.capabilities], memberId: m.memberId, otherCapabilities: [], relation: m.relation })), mode: intake.background.team.value.mode } }, "PATCH")).data as typeof intake;
  intake = (await go(flow.confirmBlock, p, { block: "purpose", expectedUpdatedAt: intake.updatedAt, idempotencyKey: "b3", purpose: { selectedLevel: 2 } }, "PATCH")).data as typeof intake;
  await go(flow.questions, p, { idempotencyKey: "q1" });
  await go(flow.answers, p, { answers: [], idempotencyKey: "a1" });
  const draft = (await go(flow.draft, p, { idempotencyKey: "d1" })).data as { draftId: string };
  const confirmed = (await go(flow.confirm, { draftId: draft.draftId }, { idempotencyKey: "ok" })).data as { planId: string };
  assert.deepEqual(scheduled, [confirmed.planId]);
  await go(flow.confirm, { draftId: draft.draftId }, { idempotencyKey: "ok" });
  assert.equal(scheduled.length, 1, "a replayed confirm does not schedule again");
  const detail = planV2DetailSchema.parse((await go(plans.detail, { planId: confirmed.planId }, undefined, "GET")).data);
  assert.equal(detail.home!.state, "pending");
  assert.deepEqual(scheduled, [confirmed.planId, confirmed.planId]);
  // 默认调度不在请求作用域也不抛（测试 / 脚本直接调路由）。
  schedulePlanHome({ actorId: "a", language: "ja", mode: "mock", planId: "x" }, () => { throw new Error("outside request scope"); });
});

test("deepseek prep AI reserves plan_prep with trigger plan for initial and manual for regeneration", async () => {
  const reserved: Array<{ purpose: string; trigger: string; pool: string }> = [];
  const ledger = {
    async reserve(input: { purpose: string; trigger: string; pool: string }) { reserved.push({ pool: input.pool, purpose: input.purpose, trigger: input.trigger }); return { ok: true, operationId: `op${reserved.length}`, owner: true, status: "reserved" }; },
    async beginCall() { return { callId: "c" }; },
    async endCall() {},
    async finish() {},
  };
  const ai = createDeepseekPlanPrepAi({
    chat: async () => ({ content: JSON.stringify({ hook: { label: "a", reason: "b" }, planFit: null, sentences: [{ text: "x", underlines: [] }], usedAnswers: [], usedFacts: [] }), usage: { inputTokens: 1, outputTokens: 1 } }),
    ledger: ledger as never,
    log: () => undefined,
    model: "m",
  });
  const input = { answers: [], facts: [], fields: [], goal: "g", kind: "contact" as const, language: "ja" as const, outcome: null, questions: [], typeLabel: null };
  assert.equal((await ai.card(input, { actorId: "a", language: "ja", ledgerKey: "k1", now: new Date(), trigger: "plan" })).ok, true);
  await ai.card(input, { actorId: "a", language: "ja", ledgerKey: "k2", now: new Date(), trigger: "manual" });
  assert.deepEqual(reserved, [{ pool: "user", purpose: "plan_prep", trigger: "plan" }, { pool: "user", purpose: "plan_prep", trigger: "manual" }]);
});
