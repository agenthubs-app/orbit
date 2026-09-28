/**
 * W0008 SC-02 / SC-04 / SC-05（服务层）：第一份计划的生成与保存。
 *
 * - 一次成功的生成保存为生效的 v1（阶段、四类条目、回答卡片数据、幂等键）；
 * - 同一幂等键重复提交（先后或并发）只保存一份；已有别的计划 → PLAN_ALREADY_EXISTS；
 * - 任一阶段失败 → 什么都不保存；
 * - 校验器拒绝编造的 id、别人的联系人、不在目录里的活动；
 * - factory 只提供 mock，其他 provider fail closed；全程没有外部请求。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createPlanBootstrapService,
  PlanBootstrapError,
  type PlanBootstrapRequest,
} from "../../features/plans/bootstrap";
import { generatePlanDraft, type PlanGenerator } from "../../features/plans/generator";
import { resolvePlanGenerator } from "../../features/plans/generator-service-factory";
import type { PlanInputSource } from "../../features/plans/input-source";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService, PlanServiceError } from "../../features/plans/service";
import { validateGeneratedPlan } from "../../features/plans/validate";
import { CONTACTS, EVENTS, ME, NOW, OTHER, contact, generatorInput } from "../support/plan-bootstrap-fixture";
import { steppingClock } from "../support/plan-fixture";

const WORKSPACE = "workspace:plan-bootstrap-test";
const THEIR_CONTACT = contact({ displayName: "别人的", id: "contact:theirs", ownerId: OTHER });

const ALLOW_LIST = {
  contactsByActor: { [ME]: CONTACTS.map((entry) => entry.id), [OTHER]: [THEIR_CONTACT.id] },
  eventIds: EVENTS.map((entry) => entry.id),
};

function harness(options: { generator?: PlanGenerator; contacts?: typeof CONTACTS } = {}) {
  const repository = createMemoryPlanRepository();
  const references = createAllowListPlanReferenceValidator({ actorId: ME, allowList: ALLOW_LIST });
  const plans = createPlanService({ now: steppingClock(), references, repository, scope: { actorId: ME, workspaceId: WORKSPACE } });
  const reads: string[] = [];
  const source: PlanInputSource = {
    listContacts: async (actorId) => {
      reads.push(`contacts:${actorId}`);
      const contacts = options.contacts ?? CONTACTS;
      return { contacts, total: contacts.length };
    },
    listEvents: async () => {
      reads.push("events");
      return EVENTS;
    },
  };
  const service = createPlanBootstrapService({
    actorId: ME,
    generator: options.generator ?? createMockPlanGenerator(),
    now: () => NOW,
    plans,
    references,
    source,
  });
  const rows = () => repository.dump({ actorId: ME, workspaceId: WORKSPACE });
  return { plans, reads, rows, service };
}

function request(overrides: Partial<PlanBootstrapRequest> = {}): PlanBootstrapRequest {
  return {
    goal: { horizon: "quarter", snapshot: "三个月内拿到 10 家企业客户的试用（3 个月内）", text: "三个月内拿到 10 家企业客户的试用" },
    idempotencyKey: "plan-key-1",
    locale: "zh",
    supplement: "我更想先从制造业客户开始",
    ...overrides,
  };
}

async function rejectsWith(promise: Promise<unknown>, reason: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PlanBootstrapError || error instanceof PlanServiceError, String(error));
    assert.equal(error.reason, reason);
    return true;
  });
}

test("a successful bootstrap saves the whole plan as the active v1 in one go", async () => {
  const { plans, reads, rows, service } = harness();
  const result = await service.bootstrap(request());
  assert.equal(result.replayed, false);
  assert.equal(result.snapshot.plan.version, 1);
  assert.equal(result.snapshot.plan.status, "active");
  assert.equal(result.snapshot.plan.horizon, "quarter");
  assert.equal(result.snapshot.plan.startsOn, "2026-09-28");
  assert.equal(result.snapshot.plan.phases.length, 3);
  assert.deepEqual(
    [...new Set(result.snapshot.items.map((item) => item.kind))].sort(),
    ["action", "event", "info", "network_need"],
  );
  const analysis = result.snapshot.plan.analysis as { kind: string; request: Record<string, unknown> };
  assert.equal(analysis.kind, "plan_bootstrap");
  assert.deepEqual(analysis.request, {
    idempotencyKey: "plan-key-1",
    question: "根据我的目标和人脉信息，我该如何实现目标？",
    supplement: "我更想先从制造业客户开始",
  });
  assert.deepEqual(reads, [`contacts:${ME}`, "events"]);
  assert.equal(rows().plans.length, 1);
  assert.equal((await plans.getCurrent())?.plan.id, result.snapshot.plan.id);
  assert.equal(result.snapshot.log[0]?.event, "plan_created");
});

test("the same key submitted twice, or twice at once, saves exactly one plan", async () => {
  const { rows, service } = harness();
  const first = await service.bootstrap(request());
  const again = await service.bootstrap(request());
  assert.equal(again.replayed, true);
  assert.equal(again.snapshot.plan.id, first.snapshot.plan.id);
  assert.equal(rows().plans.length, 1);

  const concurrent = harness();
  const [a, b] = await Promise.all([concurrent.service.bootstrap(request()), concurrent.service.bootstrap(request())]);
  assert.equal(a.snapshot.plan.id, b.snapshot.plan.id);
  assert.deepEqual([a.replayed, b.replayed].sort(), [false, true], "exactly one of the two created it");
  assert.equal(concurrent.rows().plans.length, 1);
});

test("a different request when a plan already exists does not make a second plan", async () => {
  const { rows, service } = harness();
  const first = await service.bootstrap(request());
  await assert.rejects(service.bootstrap(request({ idempotencyKey: "plan-key-2" })), (error: unknown) => {
    assert.ok(error instanceof PlanBootstrapError);
    assert.equal(error.reason, "PLAN_ALREADY_EXISTS");
    assert.equal(error.code, "CONFLICT");
    assert.equal(error.planId, first.snapshot.plan.id);
    return true;
  });
  assert.equal(rows().plans.length, 1);
});

test("any failing phase fails the whole generation and nothing is saved", async () => {
  const base = createMockPlanGenerator();
  const generator: PlanGenerator = {
    ...base,
    async phaseDetail(input, phase) {
      if (phase.key === "p3") throw new Error("phase 3 timed out");
      return base.phaseDetail(input, phase);
    },
  };
  const { rows, service } = harness({ generator });
  await assert.rejects(service.bootstrap(request()), (error: unknown) => {
    assert.ok(error instanceof PlanBootstrapError);
    assert.equal(error.reason, "PLAN_GENERATION_FAILED");
    assert.equal(error.code, "SERVICE_UNAVAILABLE");
    return true;
  });
  assert.deepEqual(rows().plans, []);
  assert.deepEqual(rows().items, []);
});

test("a generator that references a contact outside its input, or someone else's, is rejected before saving", async () => {
  const base = createMockPlanGenerator();
  const inventing: PlanGenerator = {
    ...base,
    async skeleton(input) {
      const skeleton = await base.skeleton(input);
      skeleton.analysis.allies = [{ contactId: "contact:invented", help: "x", name: "编造的人", subtitle: null }];
      return skeleton;
    },
  };
  const invented = harness({ generator: inventing });
  await rejectsWith(invented.service.bootstrap(request()), "REFERENCE_NOT_FOUND");
  assert.deepEqual(invented.rows().plans, []);

  // 别人的联系人混进了输入：生成器照常引用，但按 actor 的引用校验器不认。
  const leaked = harness({ contacts: [{ ...THEIR_CONTACT, createdAt: "2026-09-27T00:00:00.000Z", ownerId: ME }, ...CONTACTS] });
  await rejectsWith(leaked.service.bootstrap(request()), "REFERENCE_NOT_FOUND");
  assert.deepEqual(leaked.rows().plans, []);
});

test("a missing goal is refused; a goal without a horizon plans for 3 months", async () => {
  const { rows, service } = harness();
  await rejectsWith(service.bootstrap(request({ goal: { horizon: null, snapshot: "", text: "  " } })), "GOAL_REQUIRED");
  assert.deepEqual(rows().plans, []);
  const result = await service.bootstrap(request({ goal: { horizon: null, snapshot: "找渠道", text: "找渠道" } }));
  assert.equal(result.snapshot.plan.horizon, "quarter");
});

test("the validator rejects unknown and foreign ids and plans cut into the wrong number of phases", async () => {
  const input = generatorInput();
  const references = createAllowListPlanReferenceValidator({ actorId: ME, allowList: ALLOW_LIST });
  const draft = await generatePlanDraft(createMockPlanGenerator(), input);
  await validateGeneratedPlan({ draft, generatorInput: input, references });

  const withItem = (patch: Record<string, unknown>) => ({ ...draft, items: [...draft.items, { kind: "action" as const, phaseKey: "p1", title: "x", ...patch }] });
  const reasons = async (candidate: typeof draft, candidateInput = input) => {
    try {
      await validateGeneratedPlan({ draft: candidate, generatorInput: candidateInput, references });
      return "ok";
    } catch (error) {
      return error instanceof PlanServiceError ? error.reason : String(error);
    }
  };
  assert.equal(await reasons(withItem({ contactIds: ["contact:invented"] })), "REFERENCE_NOT_FOUND");
  assert.equal(await reasons(withItem({ linkedEventId: "event:invented" })), "REFERENCE_NOT_FOUND");
  // 在输入里、但属于别人：W0007 的引用校验器拒绝。
  const foreignInput = { ...input, contacts: [...input.contacts, THEIR_CONTACT] };
  assert.equal(await reasons(withItem({ contactIds: [THEIR_CONTACT.id] }), foreignInput), "REFERENCE_NOT_FOUND");
  const thisWeek = [{ contactIds: [THEIR_CONTACT.id], eventIds: [], title: "约别人的联系人", why: "x" }];
  assert.equal(await reasons({ ...draft, analysis: { ...draft.analysis, thisWeek } }, foreignInput), "REFERENCE_NOT_FOUND");
  // 3 个月内只能是 3 段。
  const twoPhases = {
    ...draft,
    analysis: { ...draft.analysis, phases: draft.analysis.phases.slice(0, 2) },
    items: draft.items.filter((item) => item.phaseKey !== "p3"),
    phases: draft.phases.slice(0, 2),
  };
  assert.equal(await reasons(twoPhases), "INVALID_INPUT");
});

test("the generator factory returns the mock; any other provider fails closed; no external request is made", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("no network in plan generation");
  });
  const resolution = resolvePlanGenerator();
  assert.equal(resolution.success, true);
  assert.equal(resolution.success && resolution.service.id, "mock-template-v1");

  const ai = resolvePlanGenerator({ provider: "ai" });
  assert.equal(ai.success, false);
  assert.equal(ai.success === false && ai.error.code, "NOT_IMPLEMENTED");

  const previous = process.env.ORBIT_PLAN_GENERATOR;
  process.env.ORBIT_PLAN_GENERATOR = "openai";
  t.after(() => {
    if (previous === undefined) delete process.env.ORBIT_PLAN_GENERATOR;
    else process.env.ORBIT_PLAN_GENERATOR = previous;
  });
  assert.equal(resolvePlanGenerator().success, false, "an env-selected provider without an implementation fails closed");

  const { service } = harness({ generator: resolution.success ? resolution.service : undefined });
  await service.bootstrap(request());
  assert.equal(fetchMock.mock.callCount(), 0);
});
