/**
 * W0048b SC-01／SC-02：计划生成接 DeepSeek 两阶段（假 fetch、计数快照桩、内存账本桩；0 次真实请求）。
 *
 * - 一次 bootstrap = 用户主动池 1 次操作；先判定快照（fresh 复用、否则同一操作里生成），计划 `analysis.snapshotId` 指向它；
 * - 只细化前 2 个阶段；每次 HTTP 先有子账（fetch 次数 = 子账条数），单份 ≤ 4；阶段数 > 12 在任何阶段 HTTP 前失败；
 * - 编造 id 在解析层丢弃，规则数字与服务端姓名；
 * - 结算：流水线唯一结算者，快照入口不结算；部分失败／重放／无响应各有确定结果；
 * - 用户池总熔断 429、后台池用满不影响；请求体 json_object + thinking 禁用 + 超时；缺密钥 fail closed。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanBootstrapRouteHandlers } from "../../app/api/agent/plans/bootstrap/route-handlers";
import { BACKGROUND_POOL_DAILY_LIMIT, USER_POOL_DAILY_LIMIT } from "../../features/ai-quota/constants";
import { DeepseekJsonChatError } from "../../features/ai/deepseek-json-chat";
import {
  AI_PLAN_GENERATOR_ID,
  bindDeepseekPlanChat,
  createConfiguredAiPlanGenerator,
  createDeepseekPlanGenerator,
  ledgerCallMeter,
  planRuleFigures,
} from "../../features/plans/ai-generator";
import { createPlanBootstrapService, PlanBootstrapError } from "../../features/plans/bootstrap";
import {
  generatePlanDraft,
  PlanGenerationError,
  PlanGenerationLimitError,
  type PlanAnalysisV1,
  type PlanGenerator,
} from "../../features/plans/generator";
import { resolvePlanGenerator } from "../../features/plans/generator-service-factory";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { parseCreatePlanVersionInput, PlanServiceError } from "../../features/plans/validators";
import { aiGenerator, fakeDeepseek, MemoryAiLedger, phaseReply, skeletonReply, snapshotStub, type FakeReply } from "../support/plan-ai-fixture";
import { CONTACTS, EVENTS, ME, NOW, OTHER, contact, generatorInput } from "../support/plan-bootstrap-fixture";
import { steppingClock } from "../support/plan-fixture";

const THEIRS = contact({ displayName: "别人的", id: "contact:theirs", ownerId: OTHER });
const GOAL = { horizon: "quarter" as const, snapshot: "三个月内拿到 10 家企业客户的试用", text: "三个月内拿到 10 家企业客户的试用" };

function harness(options: {
  skeleton?: (request: Parameters<NonNullable<Parameters<typeof fakeDeepseek>[0]["skeleton"]>>[0]) => FakeReply;
  phase?: (request: Parameters<NonNullable<Parameters<typeof fakeDeepseek>[0]["phase"]>>[0]) => FakeReply;
  decision?: "auto" | "fresh" | "insufficient" | "stale";
  snapshotOutcome?: "responded" | "invalid" | "no_response";
  withSnapshots?: boolean;
} = {}) {
  const ledger = new MemoryAiLedger();
  const http = { count: 0 };
  const deepseek = fakeDeepseek({ onRequest: () => (http.count += 1), phase: options.phase, skeleton: options.skeleton });
  const snapshots = snapshotStub({
    decision: options.decision ?? "auto",
    existingId: options.decision === "fresh" ? "snap:existing" : null,
    ledger,
    onHttp: () => (http.count += 1),
    outcome: options.snapshotOutcome,
  });
  const logs: Array<Record<string, unknown>> = [];
  const generator = aiGenerator({
    fetchImplementation: deepseek.fetchImplementation,
    ledger,
    log: (line) => logs.push(line),
    snapshots: options.withSnapshots === false ? null : snapshots.port,
  });
  const references = createAllowListPlanReferenceValidator({
    actorId: ME,
    allowList: { contactsByActor: { [ME]: CONTACTS.map((entry) => entry.id), [OTHER]: [THEIRS.id] }, eventIds: EVENTS.map((entry) => entry.id) },
  });
  const plans = createPlanService({ now: steppingClock(), references, repository: createMemoryPlanRepository(), scope: { actorId: ME, workspaceId: "w" } });
  const service = createPlanBootstrapService({
    actorId: ME,
    generator,
    now: () => NOW,
    plans,
    references,
    source: { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => EVENTS },
  });
  const bootstrap = (key = "plan-ai-1") => service.bootstrap({ goal: GOAL, idempotencyKey: key, locale: "zh", supplement: null });
  return { bootstrap, deepseek, generator, http, ledger, logs, plans, snapshots };
}

const analysisOf = (snapshot: { plan: { analysis: Record<string, unknown> } }) => snapshot.plan.analysis as unknown as PlanAnalysisV1;

/* ---------------- SC-01 ---------------- */

test("SC-01: bootstrap produces a snapshot in the same operation, then generates two phases; one user-pool operation, calls = HTTP", async () => {
  const h = harness();
  const result = await h.bootstrap();
  const analysis = analysisOf(result.snapshot);
  assert.equal(analysis.generator, AI_PLAN_GENERATOR_ID);
  assert.equal(analysis.snapshotId, "snap:1");
  // 快照经同步入口生成：origin plan、trigger plan、planId 就是保存下来的计划 id，且与操作同一 operationId。
  assert.equal(h.snapshots.calls.length, 1);
  assert.equal(h.snapshots.calls[0]!.origin, "plan");
  assert.equal(h.snapshots.calls[0]!.trigger, "plan");
  assert.equal(h.snapshots.calls[0]!.planId, result.snapshot.plan.id);
  assert.equal(h.snapshots.calls[0]!.operationId, h.ledger.operations[0]!.id);

  assert.equal(h.ledger.operations.length, 1);
  const op = h.ledger.operations[0]!;
  assert.deepEqual([op.pool, op.purpose, op.trigger, op.maxCalls, op.status], ["user", "plan", "plan", 4, "succeeded"]);
  assert.equal(op.key, "bootstrap:plan-ai-1");
  // 快照 1 + 骨架 1 + 前 2 个阶段 = 4 次 HTTP，每次都有子账。
  assert.equal(h.http.count, 4);
  assert.equal(op.calls.length, 4);
  assert.ok(op.calls.every((call) => call.status === "responded"));
  assert.deepEqual(h.ledger.finishes, [{ operationId: op.id, outcome: "succeeded" }]);

  // 第 3 段以骨架形态保存：标题与摘要、detailed false、没有条目。
  assert.deepEqual(analysis.phases.map((phase) => phase.detailed), [true, true, false]);
  assert.equal(result.snapshot.plan.phases[2]!.summary, "摘要 3");
  assert.equal(result.snapshot.items.filter((item) => item.phaseKey === "p3").length, 0);
  assert.ok(result.snapshot.items.some((item) => item.phaseKey === "p1" && item.kind === "network_need"));
  // 阶段请求只发给第 1、2 段，提示里带快照依据（别名，不在输入里的联系人不出现）。
  const phaseTitles = h.deepseek.requests.filter((request) => request.kind === "phase").map((request) => (request.payload.phase as { title: string }).title);
  assert.deepEqual(phaseTitles.sort(), ["阶段 1", "阶段 2"]);
  const skeletonPayload = h.deepseek.requests.find((request) => request.kind === "skeleton")!.payload;
  assert.deepEqual(skeletonPayload.analysis, [{ contactIds: ["C1"], kind: "diagnosis", text: "制造业人脉集中。" }]);
  assert.ok(!JSON.stringify(skeletonPayload).includes("contact:"), "real contact ids never leave the server");
});

test("SC-01: a fresh snapshot is reused with 0 snapshot HTTP; fewer than 3 contacts generates without a snapshot", async () => {
  const fresh = harness({ decision: "fresh" });
  const result = await fresh.bootstrap();
  assert.equal(analysisOf(result.snapshot).snapshotId, "snap:existing");
  assert.equal(fresh.snapshots.calls.length, 0);
  assert.equal(fresh.http.count, 3);
  assert.equal(fresh.ledger.operations[0]!.calls.length, 3);

  const insufficient = harness({ decision: "insufficient" });
  const plain = await insufficient.bootstrap();
  assert.equal(analysisOf(plain.snapshot).snapshotId, undefined);
  assert.equal(insufficient.snapshots.calls.length, 0);
  assert.equal(insufficient.http.count, 3);
});

/** 直接对一次操作的生成器跑 generatePlanDraft：模型骨架返回 n 个阶段。 */
async function draftWithPhases(count: number) {
  const ledger = new MemoryAiLedger();
  const reservation = await ledger.reserve({ actorId: ME, idempotencyKey: `k${count}`, now: NOW, pool: "user", purpose: "plan", trigger: "plan" });
  assert.ok(reservation.ok);
  const operationId = (reservation as { operationId: string }).operationId;
  const deepseek = fakeDeepseek({ skeleton: () => skeletonReply({ phases: count }) });
  const generator = createDeepseekPlanGenerator({
    chat: bindDeepseekPlanChat({ apiKey: "k", fetchImplementation: deepseek.fetchImplementation, model: "m" }),
    log: () => undefined,
    meter: ledgerCallMeter(ledger, operationId, "m"),
  });
  const run = generatePlanDraft(generator, generatorInput({ horizon: "year" }), { detailPhases: 2 });
  return { deepseek, ledger, op: ledger.operations[0]!, run };
}

test("SC-01 R-4／D46②: 12 phases → only 2 phase HTTP (≤ 4 in total, all metered); 1 phase → 1; 13 phases → fails before any phase HTTP", async () => {
  const twelve = await draftWithPhases(12);
  const draft = await twelve.run;
  const phaseRequests = twelve.deepseek.requests.filter((request) => request.kind === "phase");
  assert.deepEqual(phaseRequests.map((request) => (request.payload.phase as { title: string }).title).sort(), ["阶段 1", "阶段 2"]);
  assert.equal(twelve.deepseek.requests.length, 3);
  assert.equal(twelve.op.calls.length, twelve.deepseek.requests.length, "no provider request without a sub-ledger row");
  assert.ok(twelve.op.calls.every((call) => call.seq <= 4));
  assert.equal(draft.phases.length, 12);
  assert.deepEqual(draft.analysis.phases.map((phase) => phase.detailed), [true, true, ...Array(10).fill(false)]);
  assert.ok(draft.items.every((item) => item.phaseKey === "p1" || item.phaseKey === "p2"));
  assert.equal(draft.phases[11]!.title, "阶段 12");

  const one = await draftWithPhases(1);
  await one.run;
  assert.equal(one.deepseek.requests.filter((request) => request.kind === "phase").length, 1);
  assert.equal(one.op.calls.length, 2);

  const thirteen = await draftWithPhases(13);
  await assert.rejects(thirteen.run, PlanGenerationError);
  assert.equal(thirteen.deepseek.requests.filter((request) => request.kind === "phase").length, 0);
  assert.equal(thirteen.op.calls.length, 1);
});

test("SC-01: the ledger refuses a fifth call — the request is never sent", async () => {
  const ledger = new MemoryAiLedger();
  const reservation = (await ledger.reserve({ actorId: ME, idempotencyKey: "cap", now: NOW, pool: "user", purpose: "plan", trigger: "plan" })) as { operationId: string };
  const deepseek = fakeDeepseek({});
  const generator = createDeepseekPlanGenerator({
    chat: bindDeepseekPlanChat({ apiKey: "k", fetchImplementation: deepseek.fetchImplementation, model: "m" }),
    log: () => undefined,
    meter: ledgerCallMeter(ledger, reservation.operationId, "m"),
  });
  const input = generatorInput();
  for (let index = 0; index < 4; index += 1) await generator.skeleton(input);
  await assert.rejects(generator.skeleton(input));
  assert.equal(deepseek.requests.length, 4);
  assert.equal(ledger.operations[0]!.calls.length, 4);
});

test("SC-01: a full background pool does not block a plan; a full user pool → PlanGenerationLimitError with 0 calls and 429 USER_DAILY_LIMIT", async () => {
  const background = harness();
  background.ledger.preset.background = BACKGROUND_POOL_DAILY_LIMIT;
  await background.bootstrap();
  assert.equal(background.ledger.operations[0]!.status, "succeeded");

  const full = harness();
  full.ledger.preset.user = USER_POOL_DAILY_LIMIT;
  await assert.rejects(full.bootstrap(), (error: unknown) => error instanceof PlanGenerationLimitError && typeof error.retryOn === "string");
  assert.equal(full.http.count, 0);
  assert.equal(full.ledger.operations.length, 0);
  assert.equal(await full.plans.getCurrent(), null);

  const route = createPlanBootstrapRouteHandlers({
    isDemo: async () => false,
    readGoal: async () => GOAL.text,
    resolveActor: async () => ({ id: ME }) as never,
    serviceForActor: () => ({ mode: "live", service: Object.assign(createPlanBootstrapService({
      actorId: ME,
      generator: full.generator,
      now: () => NOW,
      plans: full.plans,
      references: createAllowListPlanReferenceValidator({ actorId: ME, allowList: { contactsByActor: "any", eventIds: "any" } }),
      source: { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => EVENTS },
    }), { metered: true }), success: true }),
  });
  const response = await route.POST(new Request("http://localhost/api/agent/plans/bootstrap", { body: JSON.stringify({ idempotencyKey: "limit-1" }), method: "POST" }));
  assert.equal(response.status, 429);
  const body = (await response.json()) as { error: { context?: Record<string, string> } };
  assert.equal(body.error.context?.reason, "USER_DAILY_LIMIT");
  assert.ok(body.error.context?.retryOn);
  assert.equal(full.http.count, 0);
});

test("SC-01: demo mode returns 403 without reserving or generating", async () => {
  const h = harness();
  const route = createPlanBootstrapRouteHandlers({
    isDemo: async () => true,
    readGoal: async () => GOAL.text,
    resolveActor: async () => ({ id: ME }) as never,
    serviceForActor: () => ({ mode: "live", service: Object.assign({ bootstrap: () => h.bootstrap() }, { metered: true }), success: true }),
  });
  const response = await route.POST(new Request("http://localhost/api/agent/plans/bootstrap", { body: JSON.stringify({ idempotencyKey: "demo-1" }), method: "POST" }));
  assert.equal(response.status, 403);
  assert.equal(h.ledger.operations.length, 0);
  assert.equal(h.http.count, 0);
});

test("SC-01: figures are the rule values (model numbers ignored) and ally names come from the input", async () => {
  const h = harness();
  const result = await h.bootstrap();
  const analysis = analysisOf(result.snapshot);
  const needs = result.snapshot.items.filter((item) => item.kind === "network_need").length;
  assert.deepEqual(analysis.figures.map((figure) => figure.value), [String(CONTACTS.length), String(planRuleFigures({ items: [] }, { ...generatorInput(), goal: GOAL, supplement: null })[1]!.value), String(needs)]);
  assert.ok(!analysis.figures.some((figure) => figure.value === "999"));
  assert.equal(needs, 2, "two refined phases × one need each");
  assert.deepEqual(analysis.allies, [{ contactId: "contact:wang", help: "可以介绍采购负责人", name: "王砚", subtitle: "北辰精工 · 采购部长" }]);
  // 需求带 targetCount（模型给 2）。
  assert.ok(result.snapshot.items.filter((item) => item.kind === "network_need").every((item) => item.criteria?.targetCount === 2));
});

test("SC-01: targetCount must be an integer 1–5 (0, 6, 2.5 rejected); missing stays absent (read as 1)", () => {
  const base = {
    analysis: {},
    goalSnapshot: "g",
    horizon: "quarter",
    phases: [{ endWeek: 3, granularity: "week", key: "p1", startWeek: 1, title: "t" }],
    startsOn: "2026-09-28",
  };
  const need = (criteria: Record<string, unknown>) => ({ ...base, items: [{ criteria, kind: "network_need", phaseKey: "p1", title: "人" }] });
  for (const bad of [0, 6, 2.5, "3"]) {
    assert.throws(() => parseCreatePlanVersionInput(need({ targetCount: bad }) as never), (error: unknown) => error instanceof PlanServiceError && error.reason === "INVALID_INPUT");
  }
  assert.equal(parseCreatePlanVersionInput(need({ targetCount: 5 }) as never).items[0]!.criteria?.targetCount, 5);
  assert.equal("targetCount" in parseCreatePlanVersionInput(need({}) as never).items[0]!.criteria!, false);
});

test("SC-01: requests use json_object with thinking disabled and a timeout; a missing key fails closed", async () => {
  const h = harness();
  await h.bootstrap();
  for (const request of h.deepseek.requests) {
    assert.deepEqual(request.body.response_format, { type: "json_object" });
    assert.deepEqual(request.body.thinking, { type: "disabled" });
  }
  const hanging = (async (_url: string, init?: RequestInit) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
  await assert.rejects(
    bindDeepseekPlanChat({ apiKey: "k", fetchImplementation: hanging, model: "m", timeoutMs: 20 })({ system: "s", user: "u" }),
    (error: unknown) => error instanceof DeepseekJsonChatError && error.code === "PROVIDER_TIMEOUT" && error.usage === null,
  );
  assert.equal(createConfiguredAiPlanGenerator({ ORBIT_PLAN_GENERATOR: "ai" }), null);
  const previous = { generator: process.env.ORBIT_PLAN_GENERATOR, key: process.env.DEEPSEEK_API_KEY };
  delete process.env.DEEPSEEK_API_KEY;
  try {
    const resolution = resolvePlanGenerator({ provider: "ai" });
    assert.equal(resolution.success, false);
  } finally {
    if (previous.key !== undefined) process.env.DEEPSEEK_API_KEY = previous.key;
  }
  // 不经 openSession 的直接调用没有子账：拒绝。
  await assert.rejects(h.generator.skeleton(generatorInput()), PlanGenerationError);
});

/* ---------------- SC-02 ---------------- */

test("SC-02: fabricated and other people's ids are dropped in the parser (ally removed, ids stripped, event removed) and logged", async () => {
  const h = harness({
    phase: (request) =>
      phaseReply(request, {
        actions: [{ contactIds: ["C2", "C99", "contact:theirs"], eventId: "E99", title: "约佐藤", week: 1 }],
        events: [{ eventId: "E99", week: 1 }, { eventId: "E2", week: 5 }],
      }),
    skeleton: () =>
      skeletonReply({
        extra: {
          allies: [{ contactId: "C99", help: "编的" }, { contactId: "contact:theirs", help: "别人的" }, { contactId: "C3", help: "真的" }],
          thisWeek: [{ contactIds: ["C1", "C42"], eventIds: ["E7"], title: "约王砚", why: "x" }],
        },
      }),
  });
  const result = await h.bootstrap();
  const analysis = analysisOf(result.snapshot);
  assert.deepEqual(analysis.allies.map((ally) => ally.contactId), ["contact:lin"]);
  assert.deepEqual(analysis.thisWeek[0]!.contactIds, ["contact:wang"]);
  assert.deepEqual(analysis.thisWeek[0]!.eventIds, []);
  const ids = JSON.stringify(result.snapshot.items);
  assert.ok(!ids.includes("contact:theirs") && !ids.includes("C99"));
  const action = result.snapshot.items.find((item) => item.title === "约佐藤")!;
  assert.deepEqual(action.linkedContactIds, ["contact:sato"]);
  assert.equal(action.linkedEventId, null);
  // 编造的活动整条去掉；同一活动在两段里只保留第一次出现。
  assert.deepEqual(result.snapshot.items.filter((item) => item.kind === "event").map((item) => item.linkedEventId), ["event:dx-1030"]);
  const dropped = h.logs.filter((line) => line.event === "plan_ai_dropped_references");
  assert.ok(dropped.length >= 2);
  assert.ok(dropped.some((line) => line.stage === "skeleton" && Number(line.dropped) === 4));
});

test("SC-02 R-3 ①: snapshot succeeds, skeleton fails → operation failed, 2 sub-ledger rows, nothing saved; finish exactly once by the pipeline", async () => {
  for (const reply of [{ status: 500 }, new TypeError("socket hang up")] as FakeReply[]) {
    const h = harness({ skeleton: () => reply });
    await assert.rejects(h.bootstrap(), (error: unknown) => error instanceof PlanBootstrapError && error.reason === "PLAN_GENERATION_FAILED");
    const op = h.ledger.operations[0]!;
    assert.equal(op.status, "failed");
    assert.deepEqual(op.calls.map((call) => call.status), ["responded", reply instanceof Error ? "no_response" : "responded"]);
    assert.equal(h.ledger.finishes.length, 1);
    assert.equal(await h.plans.getCurrent(), null);
  }
});

test("SC-02 R-3 ②: one phase fails after the other succeeded → failed, one sub-ledger row per HTTP, nothing saved", async () => {
  const h = harness({ phase: (request) => ((request.payload.phase as { title: string }).title === "阶段 2" ? { status: 502 } : phaseReply(request)) });
  await assert.rejects(h.bootstrap(), PlanBootstrapError);
  const op = h.ledger.operations[0]!;
  assert.equal(op.status, "failed");
  assert.equal(op.calls.length, 4);
  assert.equal(h.http.count, 4);
  assert.equal(h.ledger.finishes.length, 1);
  assert.equal(await h.plans.getCurrent(), null);
});

test("SC-02 R-3 ③: replaying the same key returns the saved plan with 0 new HTTP and no new operation", async () => {
  const h = harness();
  const first = await h.bootstrap("same-key");
  const http = h.http.count;
  const second = await h.bootstrap("same-key");
  assert.equal(second.replayed, true);
  assert.equal(second.snapshot.plan.id, first.snapshot.plan.id);
  assert.equal(h.http.count, http);
  assert.equal(h.ledger.operations.length, 1);
  assert.equal(h.ledger.finishes.length, 1);
});

test("SC-02 R-3 ④: no response anywhere → released (not counted); the snapshot entry never settles", async () => {
  const h = harness({ decision: "auto", skeleton: () => new TypeError("connect ECONNREFUSED"), snapshotOutcome: "no_response" });
  await assert.rejects(h.bootstrap(), PlanBootstrapError);
  const op = h.ledger.operations[0]!;
  assert.equal(op.status, "released");
  assert.deepEqual(op.calls.map((call) => call.status), ["no_response"]);
  assert.equal(h.ledger.finishes.length, 1);

  const fresh = harness({ decision: "fresh", skeleton: () => new TypeError("connect ECONNREFUSED") });
  await assert.rejects(fresh.bootstrap(), PlanBootstrapError);
  assert.equal(fresh.ledger.operations[0]!.status, "released");
  assert.equal(fresh.ledger.finishes.length, 1);
});

test("SC-02: an invalid model output is counted (failed) and a retry with the same key replays the failure without HTTP", async () => {
  const h = harness({ decision: "fresh", skeleton: () => ({ phases: [] }) });
  await assert.rejects(h.bootstrap("k1"), PlanBootstrapError);
  assert.equal(h.ledger.operations[0]!.status, "failed");
  const http = h.http.count;
  await assert.rejects(h.bootstrap("k1"), PlanBootstrapError);
  assert.equal(h.http.count, http, "the settled operation refuses new calls");
  assert.equal(h.ledger.operations.length, 1);
});

test("SC-02: the validator still rejects a fabricated id that reaches it (REFERENCE_NOT_FOUND)", async () => {
  const forged: PlanGenerator = {
    id: "forged",
    phaseDetail: async (_input, phase) => ({ followups: [], items: [{ contactIds: ["contact:ghost"], kind: "action", phaseKey: phase.key, suggestedWeek: phase.startWeek, title: "x" }], phaseKey: phase.key, who: [] }),
    skeleton: async (input) => {
      return {
        analysis: {
          allies: [], answer: [{ text: "a" }], figures: [{ label: "l", unit: "u", value: "1" }, { label: "l", unit: "u", value: "1" }, { label: "l", unit: "u", value: "1" }],
          gaps: [], generator: "forged", kind: "plan_bootstrap", locale: "zh", pitch: { setting: "s", text: "t" }, read: { contacts: 0, contactsTotal: 0, events: 0 },
          risk: "r", thisWeek: [{ contactIds: [], eventIds: [], title: "t", why: "w" }], version: 1,
        },
        horizon: input.goal.horizon,
        phases: [
          { detailed: true, endWeek: 3, granularity: "week", key: "p1", startWeek: 1, summary: "", title: "a" },
          { detailed: true, endWeek: 8, granularity: "week", key: "p2", startWeek: 4, summary: "", title: "b" },
          { detailed: true, endWeek: 12, granularity: "week", key: "p3", startWeek: 9, summary: "", title: "c" },
        ],
      };
    },
  };
  const references = createAllowListPlanReferenceValidator({ actorId: ME, allowList: { contactsByActor: { [ME]: CONTACTS.map((entry) => entry.id) }, eventIds: [] } });
  const service = createPlanBootstrapService({
    actorId: ME,
    generator: forged,
    now: () => NOW,
    plans: createPlanService({ now: steppingClock(), references, repository: createMemoryPlanRepository(), scope: { actorId: ME, workspaceId: "w" } }),
    references,
    source: { listContacts: async () => ({ contacts: CONTACTS, total: CONTACTS.length }), listEvents: async () => [] },
  });
  await assert.rejects(
    service.bootstrap({ goal: GOAL, idempotencyKey: "forged", locale: "zh", supplement: null }),
    (error: unknown) => error instanceof PlanServiceError && error.reason === "REFERENCE_NOT_FOUND",
  );
});
