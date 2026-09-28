/**
 * W0008 SC-04：`POST /api/agent/plans/bootstrap`。
 *
 * 未登录 401（不读资料、不生成、不写库）；缺幂等键／补充过长 400；没写目标 400；
 * 同一幂等键重复提交只保存一份（201 → 200）；已有计划 409 带那份计划的 id；
 * 生成失败 503 且不保存；引用他人联系人或编造的 id 404 且不保存；服务解析失败 503；
 * 目标从服务端资料读（请求体里的 goal 被忽略），身份只认服务端解析的 actor。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanBootstrapRouteHandlers } from "../../app/api/agent/plans/bootstrap/route-handlers";
import { createPlanBootstrapService } from "../../features/plans/bootstrap";
import type { PlanGenerator } from "../../features/plans/generator";
import { createMockPlanGenerator } from "../../features/plans/mock-generator";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import { CONTACTS, EVENTS, ME, NOW, OTHER, contact } from "../support/plan-bootstrap-fixture";
import { steppingClock } from "../support/plan-fixture";

const WORKSPACE = "workspace:plan-bootstrap-route";
const THEIRS = contact({ createdAt: "2026-09-27T00:00:00.000Z", displayName: "别人的", id: "contact:theirs", ownerId: OTHER });

function harness(options: { goal?: string | null; generator?: PlanGenerator; contactsFor?: (actorId: string) => typeof CONTACTS } = {}) {
  const repository = createMemoryPlanRepository();
  const clock = steppingClock();
  const calls: string[] = [];
  const serviceForActor = (actorId: string) => {
    const references = createAllowListPlanReferenceValidator({
      actorId,
      allowList: { contactsByActor: { [ME]: CONTACTS.map((entry) => entry.id), [OTHER]: [THEIRS.id] }, eventIds: EVENTS.map((entry) => entry.id) },
    });
    return {
      mode: "mock" as const,
      service: createPlanBootstrapService({
        actorId,
        generator: options.generator ?? createMockPlanGenerator(),
        now: () => NOW,
        plans: createPlanService({ now: clock, references, repository, scope: { actorId, workspaceId: WORKSPACE } }),
        references,
        source: {
          listContacts: async (id) => {
            calls.push(`contacts:${id}`);
            const contacts = options.contactsFor?.(id) ?? CONTACTS;
            return { contacts, total: contacts.length };
          },
          listEvents: async () => EVENTS,
        },
      }),
      success: true as const,
    };
  };
  const handlersFor = (actorId: string | null) =>
    createPlanBootstrapRouteHandlers({
      readGoal: async (id) => {
        calls.push(`goal:${id}`);
        return options.goal === undefined ? "三个月内拿到 10 家企业客户的试用（3 个月内）" : options.goal;
      },
      resolveActor: async () => (actorId ? { id: actorId } : null),
      serviceForActor,
    });
  const plans = (actorId = ME) => repository.dump({ actorId, workspaceId: WORKSPACE }).plans;
  return { calls, handlersFor, plans };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/agent/plans/bootstrap", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function json(response: Response) {
  return (await response.json()) as {
    data?: { planId: string; replayed: boolean; version: number };
    error?: { code: string; context?: Record<string, string> };
    success: boolean;
  };
}

test("signed out: 401 envelope before reading the profile, generating or writing", async () => {
  const { calls, handlersFor, plans } = harness();
  const response = await handlersFor(null).POST(post({ idempotencyKey: "k1" }));
  assert.equal(response.status, 401);
  const body = await json(response);
  assert.equal(body.success, false);
  assert.equal(body.error?.code, "UNAUTHORIZED");
  assert.deepEqual(calls, []);
  assert.deepEqual(plans(), []);
});

test("the first request saves plan v1 (201); the same key again returns it without saving another (200)", async () => {
  const { handlersFor, plans } = harness();
  const handlers = handlersFor(ME);
  const first = await handlers.POST(post({ idempotencyKey: "plan-abc", supplement: "先做东京" }));
  assert.equal(first.status, 201);
  const created = await json(first);
  assert.equal(created.data?.version, 1);
  assert.equal(created.data?.replayed, false);

  const again = await handlers.POST(post({ idempotencyKey: "plan-abc", supplement: "先做东京" }));
  assert.equal(again.status, 200);
  const replayed = await json(again);
  assert.equal(replayed.data?.planId, created.data?.planId);
  assert.equal(replayed.data?.replayed, true);
  assert.equal(plans().length, 1);

  // 同时双击：仍然只有一份。
  const concurrent = harness();
  const [a, b] = await Promise.all([
    concurrent.handlersFor(ME).POST(post({ idempotencyKey: "plan-dbl" })),
    concurrent.handlersFor(ME).POST(post({ idempotencyKey: "plan-dbl" })),
  ]);
  const [bodyA, bodyB] = [await json(a), await json(b)];
  assert.equal(bodyA.data?.planId, bodyB.data?.planId);
  assert.deepEqual([a.status, b.status].sort(), [200, 201], "exactly one request created the plan");
  assert.deepEqual([bodyA.data?.replayed, bodyB.data?.replayed].sort(), [false, true]);
  assert.equal(concurrent.plans().length, 1);
});

test("a different request once a plan exists is a 409 carrying the existing plan id", async () => {
  const { handlersFor, plans } = harness();
  const created = await json(await handlersFor(ME).POST(post({ idempotencyKey: "plan-1" })));
  const response = await handlersFor(ME).POST(post({ idempotencyKey: "plan-2" }));
  assert.equal(response.status, 409);
  const body = await json(response);
  assert.equal(body.error?.context?.reason, "PLAN_ALREADY_EXISTS");
  assert.equal(body.error?.context?.planId, created.data?.planId);
  assert.equal(plans().length, 1);
});

test("bad input is a 400 and writes nothing: missing key, bad key, long supplement, non-JSON", async () => {
  const { handlersFor, plans } = harness();
  for (const body of [{}, { idempotencyKey: "has spaces" }, { idempotencyKey: "k", supplement: "长".repeat(61) }, { idempotencyKey: "k", supplement: 3 }, "not json"]) {
    const response = await handlersFor(ME).POST(post(body));
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal((await json(response)).error?.code, "VALIDATION_ERROR");
  }
  assert.deepEqual(plans(), []);
});

test("no goal on the profile is a 400 GOAL_REQUIRED; a goal in the request body is ignored", async () => {
  const { calls, handlersFor, plans } = harness({ goal: "" });
  const response = await handlersFor(ME).POST(post({ goal: "请求体里伪造的目标", idempotencyKey: "k1" }));
  assert.equal(response.status, 400);
  assert.equal((await json(response)).error?.context?.reason, "GOAL_REQUIRED");
  assert.ok(calls.includes(`goal:${ME}`), "the goal is read for the server-resolved actor");
  assert.deepEqual(plans(), []);
});

test("a generator failure is a 503 and nothing is saved", async () => {
  const base = createMockPlanGenerator();
  const { handlersFor, plans } = harness({
    generator: { ...base, phaseDetail: async (input, phase) => (phase.key === "p2" ? Promise.reject(new Error("x")) : base.phaseDetail(input, phase)) },
  });
  const response = await handlersFor(ME).POST(post({ idempotencyKey: "k1" }));
  assert.equal(response.status, 503);
  assert.equal((await json(response)).error?.context?.reason, "PLAN_GENERATION_FAILED");
  assert.deepEqual(plans(), []);
});

test("non-owned or invented ids are a 404 and nothing is saved", async () => {
  // 别人的联系人混进了输入（模拟读取层出错）：按 actor 的引用校验拒绝。
  const leaked = harness({ contactsFor: () => [{ ...THEIRS, ownerId: ME }, ...CONTACTS] });
  const response = await leaked.handlersFor(ME).POST(post({ idempotencyKey: "k1" }));
  assert.equal(response.status, 404);
  assert.equal((await json(response)).error?.context?.reason, "REFERENCE_NOT_FOUND");
  assert.deepEqual(leaked.plans(), []);

  const base = createMockPlanGenerator();
  const invented = harness({
    generator: {
      ...base,
      async phaseDetail(input, phase) {
        const detail = await base.phaseDetail(input, phase);
        return phase.key === "p2"
          ? { ...detail, items: [...detail.items, { kind: "event" as const, linkedEventId: "event:invented", phaseKey: "p2", title: "编造的活动" }] }
          : detail;
      },
    },
  });
  const inventedResponse = await invented.handlersFor(ME).POST(post({ idempotencyKey: "k2" }));
  assert.equal(inventedResponse.status, 404);
  assert.deepEqual(invented.plans(), []);
});

test("each actor gets their own plan: another user's request neither sees nor blocks mine", async () => {
  const { calls, handlersFor, plans } = harness({ contactsFor: (actorId) => (actorId === OTHER ? [THEIRS] : CONTACTS) });
  assert.equal((await handlersFor(OTHER).POST(post({ idempotencyKey: "same-key" }))).status, 201);
  assert.equal((await handlersFor(ME).POST(post({ idempotencyKey: "same-key" }))).status, 201);
  assert.equal(plans(ME).length, 1);
  assert.equal(plans(OTHER).length, 1);
  assert.notEqual(plans(ME)[0]!.id, plans(OTHER)[0]!.id);
  assert.ok(calls.includes(`contacts:${OTHER}`) && calls.includes(`contacts:${ME}`));
});

test("service resolution failures and thrown identity errors stay inside the envelope (503)", async () => {
  const unavailable = createPlanBootstrapRouteHandlers({
    resolveActor: async () => ({ id: ME }),
    serviceForActor: () => createNotImplementedFailure("plan-generator", "live", ["mock"]),
  });
  const response = await unavailable.POST(post({ idempotencyKey: "k1" }));
  assert.equal(response.status, 503);
  assert.equal((await json(response)).error?.context?.reason, "NOT_IMPLEMENTED");

  const throwing = createPlanBootstrapRouteHandlers({
    resolveActor: async () => {
      throw new Error("account store down");
    },
  });
  const thrown = await throwing.POST(post({ idempotencyKey: "k1" }));
  assert.equal(thrown.status, 503);
  assert.equal((await json(thrown)).success, false);
});
