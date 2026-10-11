/**
 * W0007 SC-04：`/api/agent/plans/**`。
 * 未登录 401（统一 envelope、不写库）、只能读写本人计划（他人条目 404 且不变）、
 * 非法转移 409 不写库、坏输入 400、服务解析失败 503。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createPlanRouteHandlers } from "../../app/api/agent/plans/route-handlers";
import { createMemoryPlanRepository } from "../../features/plans/repository";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createPlanService } from "../../features/plans/service";
import { AppError } from "../../shared/errors/app-error";
import { createNotImplementedFailure } from "../../shared/services/module-mode";
import { planInput, steppingClock } from "../support/plan-fixture";

const WORKSPACE = "workspace:plans-route-test";

function harness() {
  const repository = createMemoryPlanRepository();
  const clock = steppingClock();
  const serviceForActor = (actorId: string) => ({
    mode: "mock" as const,
    service: createPlanService({
      now: clock,
      references: createAllowListPlanReferenceValidator({
        actorId,
        allowList: {
          contactsByActor: { "actor:me": ["contact:tanaka"], "actor:owner": ["contact:owner-only"] },
          eventIds: ["event:tokyo-saas-night"],
        },
      }),
      repository,
      scope: { actorId, workspaceId: WORKSPACE },
    }),
    success: true as const,
  });
  // R25：`POST /api/agent/plans`（v1 创建）已改为 409 PLAN_V1_RETIRED，`POST_VERSION` 处理函数删除；
  // 需要一份 v1 计划的用例直接经服务创建（`createVersion`）。
  const handlersFor = (actorId: string | null) =>
    Object.assign(
      createPlanRouteHandlers({
        resolveActor: async () => (actorId ? { id: actorId } : null),
        serviceForActor,
      }),
      { createVersion: (input: unknown) => serviceForActor(actorId ?? "actor:anonymous").service.createVersion(input as never) },
    );
  const rows = (actorId: string) => repository.dump({ actorId, workspaceId: WORKSPACE });
  return { handlersFor, rows };
}

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/agent/plans", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method,
  });
}

const itemContext = (itemId: string) => ({ params: Promise.resolve({ itemId }) });

async function createPlanAs(handlers: ReturnType<ReturnType<typeof harness>["handlersFor"]>) {
  const created = JSON.parse(JSON.stringify(await handlers.createVersion(planInput())));
  return created as { plan: { id: string }; items: Array<{ id: string; kind: string; status: string }> };
}

test("signed-out requests to every plan route get 401 before any write", async () => {
  const { handlersFor, rows } = harness();
  const handlers = handlersFor(null);
  const responses = [
    await handlers.GET_CURRENT(),
    await handlers.PATCH_ITEM(jsonRequest("PATCH", { change: { op: "set_status", status: "done" } }), itemContext("item:x")),
    await handlers.POST_LOG(jsonRequest("POST", { body: "note" })),
  ];
  for (const response of responses) {
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
  assert.deepEqual(rows("actor:me").plans, []);
});

test("the signed-in actor creates, reads, updates and logs on their own plan", async () => {
  const { handlersFor } = harness();
  const me = handlersFor("actor:me");

  const empty = await me.GET_CURRENT();
  assert.equal(empty.status, 200);
  assert.equal(empty.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await empty.json(), { data: null, success: true });

  const created = await createPlanAs(me);
  const action = created.items.find((item) => item.kind === "action")!;

  const patched = await me.PATCH_ITEM(
    jsonRequest("PATCH", { change: { op: "set_status", status: "done" }, idempotencyKey: "check:1" }),
    itemContext(action.id),
  );
  assert.equal(patched.status, 200);
  const patchBody = await patched.json();
  assert.equal(patchBody.success, true);
  assert.equal(patchBody.data.item.status, "done");
  assert.equal(patchBody.data.log.kind, "auto");
  assert.equal(patchBody.data.replayed, false);

  const logged = await me.POST_LOG(jsonRequest("POST", {
    body: "和田中聊了渠道",
    linkedContactIds: ["contact:tanaka"],
    linkedEventId: "event:tokyo-saas-night",
  }));
  assert.equal(logged.status, 201);
  const logBody = await logged.json();
  assert.deepEqual(logBody.data.entry.linkedContactIds, ["contact:tanaka"]);

  const current = await (await me.GET_CURRENT()).json();
  assert.equal(current.data.plan.id, created.plan.id);
  assert.deepEqual(current.data.log.map((entry: { event: string }) => entry.event), ["note", "item_status_changed", "plan_created"]);
});

test("another user's plan item is not found and stays unchanged", async () => {
  const { handlersFor, rows } = harness();
  const owner = handlersFor("actor:owner");
  const created = await createPlanAs(owner);
  const action = created.items.find((item) => item.kind === "action")!;

  const intruder = handlersFor("actor:intruder");
  const response = await intruder.PATCH_ITEM(
    jsonRequest("PATCH", { change: { op: "set_status", status: "done" } }),
    itemContext(action.id),
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "NOT_FOUND");
  assert.equal(body.error.context.reason, "ITEM_NOT_FOUND");

  assert.deepEqual(await (await intruder.GET_CURRENT()).json(), { data: null, success: true });
  const ownerRows = rows("actor:owner");
  assert.equal(ownerRows.items.find((item) => item.id === action.id)?.status, "not_started");
  assert.equal(ownerRows.log.length, 1);
  assert.deepEqual(rows("actor:intruder").plans, []);
});

test("an illegal transition returns 409 and writes nothing", async () => {
  const { handlersFor, rows } = harness();
  const me = handlersFor("actor:me");
  const created = await createPlanAs(me);
  const event = created.items.find((item) => item.kind === "event")!;
  const before = rows("actor:me");

  const response = await me.PATCH_ITEM(
    jsonRequest("PATCH", { change: { op: "set_status", status: "attended" } }),
    itemContext(event.id),
  );
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "CONFLICT");
  assert.equal(body.error.context.reason, "ILLEGAL_TRANSITION");
  assert.deepEqual(rows("actor:me"), before);
});

test("malformed bodies are rejected with 400 and write nothing", async () => {
  const { handlersFor, rows } = harness();
  const me = handlersFor("actor:me");

  // R25：v1 创建接口的 400（坏 JSON、坏 horizon）断言随 `POST_VERSION` 删除。
  const notJsonLog = await me.POST_LOG(jsonRequest("POST", "{not json"));
  assert.equal(notJsonLog.status, 400);
  assert.equal((await notJsonLog.json()).error.code, "VALIDATION_ERROR");
  assert.deepEqual(rows("actor:me").plans, []);

  const created = await createPlanAs(me);
  const badOp = await me.PATCH_ITEM(jsonRequest("PATCH", { change: { op: "delete" } }), itemContext(created.items[0]!.id));
  assert.equal(badOp.status, 400);
  const noPlanLog = await handlersFor("actor:fresh").POST_LOG(jsonRequest("POST", { body: "x" }));
  assert.equal(noPlanLog.status, 404);
  assert.equal(rows("actor:me").log.length, 1);
});

test("contacts and events the actor does not own are 404 and nothing is written", async () => {
  const { handlersFor, rows } = harness();
  const me = handlersFor("actor:me");
  const created = await createPlanAs(me);
  const need = created.items.find((item) => item.kind === "network_need")!;
  const before = rows("actor:me");

  const foreignLink = await me.PATCH_ITEM(
    jsonRequest("PATCH", { change: { contactId: "contact:owner-only", op: "link_contact" } }),
    itemContext(need.id),
  );
  assert.equal(foreignLink.status, 404);
  const linkBody = await foreignLink.json();
  assert.equal(linkBody.error.code, "NOT_FOUND");
  assert.equal(linkBody.error.context.reason, "REFERENCE_NOT_FOUND");

  const foreignNote = await me.POST_LOG(jsonRequest("POST", { body: "x", linkedContactIds: ["contact:owner-only"] }));
  assert.equal(foreignNote.status, 404);
  const unknownEventNote = await me.POST_LOG(jsonRequest("POST", { body: "x", linkedEventId: "event:unknown" }));
  assert.equal(unknownEventNote.status, 404);
  assert.deepEqual(rows("actor:me"), before);

  await assert.rejects(handlersFor("actor:owner").createVersion({
    ...planInput(),
    items: [{ contactIds: ["contact:tanaka"], kind: "network_need", title: "别人的联系人" }],
  }), (error: unknown) => (error as { reason?: string }).reason === "REFERENCE_NOT_FOUND");
  assert.deepEqual(rows("actor:owner").plans, []);
});

test("errors thrown while resolving the actor or the service still return the JSON envelope", async () => {
  const throwingActor = createPlanRouteHandlers({
    resolveActor: async () => {
      throw new Error("account graph unavailable");
    },
  });
  const actorFailure = await throwingActor.GET_CURRENT();
  assert.equal(actorFailure.status, 503);
  const actorBody = await actorFailure.json();
  assert.equal(actorBody.success, false);
  assert.equal(actorBody.error.code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(actorBody), /account graph/);
  assert.equal(actorFailure.headers.get("Cache-Control"), "no-store");

  const throwingService = createPlanRouteHandlers({
    resolveActor: async () => ({ id: "actor:me" }),
    serviceForActor: () => {
      throw new Error("pool exploded");
    },
  });
  const serviceFailure = await throwingService.POST_LOG(jsonRequest("POST", { body: "x" }));
  assert.equal(serviceFailure.status, 503);
  const serviceBody = await serviceFailure.json();
  assert.equal(serviceBody.error.code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(serviceBody), /pool exploded/);

  const typedFailure = await createPlanRouteHandlers({
    resolveActor: async () => {
      throw new AppError("FORBIDDEN", "Account is suspended.");
    },
  }).GET_CURRENT();
  assert.equal(typedFailure.status, 403);
  assert.equal((await typedFailure.json()).error.code, "FORBIDDEN");
});

test("an unavailable plan service fails closed with 503", async () => {
  const handlers = createPlanRouteHandlers({
    resolveActor: async () => ({ id: "actor:me" }),
    serviceForActor: () => createNotImplementedFailure("plans", "live", ["mock", "live"]),
  });
  const response = await handlers.GET_CURRENT();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.equal(body.error.context.capabilityId, "plans");
});

