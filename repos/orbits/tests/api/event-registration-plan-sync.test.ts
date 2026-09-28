/**
 * W0012 SC-01（活动报名／取消的生产者）：报名路由成功后，本人生效计划里的这场活动变为「已报名」并写
 * 一条 auto 记录；取消后退回「推荐」（W0007 的 registered → recommended）。重复提交只留一条，
 * 他人报名不串写；计划同步失败不影响报名结果，报名失败时不同步。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createEventRegistrationCancelRouteHandler } from "../../app/api/events/[id]/registration/cancel/route-handler";
import { createEventRegistrationRouteHandlers } from "../../app/api/events/[id]/registration/route-handlers";
import type { EventRecord } from "../../features/events/event-crud-and-import/contract";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import type { PlanService } from "../../features/plans/contract";
import {
  createPlanEventRegistrationMaintenanceTask,
  reconcileEventRegistrations,
  type PlanEventRegistrationDeps,
} from "../../features/plans/event-registration-reconcile";
import { createAllowListPlanReferenceValidator } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository, type MemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService } from "../../features/plans/service";
import { planInput, steppingClock } from "../support/plan-fixture";

const EVENT_ID = "event:plan-sync";
const WORKSPACE = "w";

const event: EventRecord = {
  aiProviderRequested: false,
  calendarProviderRequested: false,
  calendarSyncRequested: false,
  description: "Plan sync fixture.",
  emailProviderRequested: false,
  endsAt: "2030-03-14T12:00:00.000Z",
  evidence: [],
  externalNetworkRequested: false,
  id: EVENT_ID,
  liveDatabaseWriteExecuted: false,
  nextAction: "Register",
  notificationDelivered: false,
  organizerFeedRequested: false,
  recommendedPreparation: "",
  relationshipContext: "",
  sourceMetadata: {
    calendarSyncRequested: false,
    captureMethod: "manual_form",
    externalNetworkRequested: false,
    importedAt: "2030-01-01T00:00:00.000Z",
    label: "Plan sync fixture",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false,
    provider: "test",
    providerRecordId: EVENT_ID,
    id: "source:plan-sync",
    type: "manual",
  },
  startsAt: "2030-03-14T09:30:00.000Z",
  status: "confirmed",
  title: "Plan sync fixture",
  venue: "Tokyo",
};

const ANSWERS = { targetAttendees: "Partners", valueOffered: "Experience" };

function planServiceFor(actorId: string, repository: MemoryPlanRepository): PlanService {
  return createPlanService({
    now: steppingClock(),
    references: createAllowListPlanReferenceValidator({ actorId, allowList: { contactsByActor: "any", eventIds: "any" } }),
    repository,
    scope: { actorId, workspaceId: WORKSPACE },
  });
}

function routes(actorId: string, repository: MemoryPlanRepository, registrationService = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() })) {
  const syncCalls: Array<{ actorId: string; registered: boolean }> = [];
  const syncPlanRegistration = async (input: { actorId: string; eventId: string; registered: boolean; registrationVersion: string }) => {
    syncCalls.push({ actorId: input.actorId, registered: input.registered });
    await planServiceFor(input.actorId, repository).markEventRegistration(input);
  };
  const { POST } = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: async () => null,
    loadEvent: async (id) => (id === EVENT_ID ? event : null),
    registrationService,
    resolveActor: async () => ({ id: actorId, name: "Tester" }),
    syncPlanRegistration,
  });
  const cancel = createEventRegistrationCancelRouteHandler({
    registrationService,
    resolveActor: async () => ({ id: actorId }),
    syncPlanRegistration,
  });
  const context = { params: Promise.resolve({ id: EVENT_ID }) };
  return {
    cancel: () => cancel(new Request("http://orbit.local/cancel", { method: "POST" }), context),
    register: (body: unknown = { answers: ANSWERS }) =>
      POST(
        new Request("http://orbit.local/registration", {
          body: JSON.stringify(body),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        context,
      ),
    registrationService,
    syncCalls,
  };
}

async function seedPlan(actorId: string, repository: MemoryPlanRepository) {
  const plan = await planServiceFor(actorId, repository).createVersion(
    planInput({ items: [{ kind: "event", linkedEventId: EVENT_ID, phaseKey: "p1", title: "Plan sync fixture" }] }),
  );
  return plan.items[0]!;
}

function eventLogs(repository: MemoryPlanRepository, actorId: string, itemId: string) {
  return repository
    .dump({ actorId, workspaceId: WORKSPACE })
    .log.filter((entry) => entry.itemId === itemId && entry.event === "item_status_changed");
}

test("register → registered with one auto entry; repeat registrations and cancels write once per real transition", async () => {
  const repository = createMemoryPlanRepository();
  const item = await seedPlan("actor:alice", repository);
  const bobItem = await seedPlan("actor:bob", repository);
  const alice = routes("actor:alice", repository);

  assert.equal((await alice.register()).status, 200);
  assert.equal((await alice.register()).status, 200); // 已报名再提交 = 更新报名信息
  const afterRegister = eventLogs(repository, "actor:alice", item.id);
  assert.deepEqual(afterRegister.map((entry) => entry.toStatus), ["registered"]);
  assert.equal(afterRegister[0]!.payload.source, "event_registration");
  assert.match(afterRegister[0]!.idempotencyKey, new RegExp(`^event-registered:${item.id}:`));

  assert.equal((await alice.cancel()).status, 200);
  assert.equal((await alice.cancel()).status, 200); // 已取消再取消：幂等
  const logs = eventLogs(repository, "actor:alice", item.id);
  assert.deepEqual(logs.map((entry) => [entry.fromStatus, entry.toStatus]), [
    ["recommended", "registered"],
    ["registered", "recommended"],
  ]);
  const current = await planServiceFor("actor:alice", repository).getCurrent();
  assert.equal(current?.items.find((entry) => entry.id === item.id)?.status, "recommended");

  // alice 的报名从不写 bob 的计划。
  assert.equal(eventLogs(repository, "actor:bob", bobItem.id).length, 0);
  assert.ok(alice.syncCalls.every((call) => call.actorId === "actor:alice"));
});

test("a failing plan sync never changes the registration response; a rejected registration is not synced; reconcile fixes the plan later", async () => {
  const registrationService = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
  const repository = createMemoryPlanRepository();
  const item = await seedPlan("actor:carol", repository);
  let calls = 0;
  const { POST } = createEventRegistrationRouteHandlers({
    getPublishedQuestionSet: async () => null,
    loadEvent: async (id) => (id === EVENT_ID ? event : null),
    registrationService,
    resolveActor: async () => ({ id: "actor:carol" }),
    async syncPlanRegistration() {
      calls += 1;
      throw new Error("plan store down");
    },
  });
  const context = { params: Promise.resolve({ id: EVENT_ID }) };
  const post = (body: unknown) =>
    POST(new Request("http://orbit.local/r", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" }), context);

  const rejected = await post({ answers: {} });
  assert.equal(rejected.status, 422);
  assert.equal(calls, 0);

  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const ok = await post({ answers: ANSWERS });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).data.status, "rsvped");
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(calls, 1);
  assert.equal((await registrationService.get({ eventId: EVENT_ID, userId: "actor:carol" }))?.status, "rsvped");
  // 同步失败：此刻只有报名是真的，计划里的活动还停在「推荐」。
  const plans = planServiceFor("actor:carol", repository);
  assert.equal((await plans.getCurrent())?.items[0]?.status, "recommended");

  // 之后的 plan-event-registration 对账按当前报名状态补上（一次，一条记录），再跑不重复。
  const deps = reconcileDeps(repository, registrationService);
  assert.deepEqual(await reconcileEventRegistrations(deps, { limit: 50 }), { examined: 1, failed: 0, replayed: 1 });
  assert.equal((await plans.getCurrent())?.items[0]?.status, "registered");
  assert.deepEqual(await reconcileEventRegistrations(deps, { limit: 50 }), { examined: 1, failed: 0, replayed: 0 });
  assert.deepEqual(eventLogs(repository, "actor:carol", item.id).map((entry) => entry.toStatus), ["registered"]);

  // 取消后同步又失败：对账把它退回「推荐」。
  await registrationService.cancel({ eventId: EVENT_ID, userId: "actor:carol" });
  await reconcileEventRegistrations(deps, { limit: 50 });
  assert.equal((await plans.getCurrent())?.items[0]?.status, "recommended");
  assert.deepEqual(eventLogs(repository, "actor:carol", item.id).map((entry) => entry.toStatus), ["registered", "recommended"]);
});

function reconcileDeps(
  repository: MemoryPlanRepository,
  registrationService: ReturnType<typeof createEventRegistrationService>,
): PlanEventRegistrationDeps {
  return {
    async listActiveEventItems() {
      const rows: Array<{ actorId: string; eventId: string; status: "recommended" | "registered" }> = [];
      for (const actorId of ["actor:alice", "actor:bob", "actor:carol", "actor:dave"]) {
        const current = await planServiceFor(actorId, repository).getCurrent();
        for (const entry of current?.items ?? []) {
          if (entry.kind === "event" && (entry.status === "recommended" || entry.status === "registered")) {
            rows.push({ actorId, eventId: entry.linkedEventId!, status: entry.status });
          }
        }
      }
      return rows;
    },
    planServiceFor: (actorId) => planServiceFor(actorId, repository),
    async readRegistrations({ actorId, eventIds }) {
      const found = await Promise.all(eventIds.map((eventId) => registrationService.get({ eventId, userId: actorId })));
      return found.flatMap((registration) =>
        registration ? [{ eventId: registration.eventId, status: registration.status, updatedAt: registration.updatedAt }] : [],
      );
    },
  };
}

test("an older registration sync arriving after a newer cancel does not revert the plan", async () => {
  const repository = createMemoryPlanRepository();
  const item = await seedPlan("actor:alice", repository);
  const plans = planServiceFor("actor:alice", repository);
  const eventId = EVENT_ID;
  // 报名 v1 → 取消 v2：取消先同步到，报名那次的同步后到。
  await plans.markEventRegistration({ eventId, registered: false, registrationVersion: "2030-01-02T00:00:00.000Z" });
  const late = await plans.markEventRegistration({ eventId, registered: true, registrationVersion: "2030-01-01T00:00:00.000Z" });
  assert.equal(late.log, null);
  assert.equal((await plans.getCurrent())?.items[0]?.status, "recommended");
  assert.equal(eventLogs(repository, "actor:alice", item.id).length, 0);
  // 之后更新的一次报名正常生效。
  const again = await plans.markEventRegistration({ eventId, registered: true, registrationVersion: "2030-01-03T00:00:00.000Z" });
  assert.equal(again.item?.status, "registered");
  assert.equal(again.item?.meta.registrationVersion, "2030-01-03T00:00:00.000Z");
  // 乱序的旧取消到达：同样忽略。
  assert.equal((await plans.markEventRegistration({ eventId, registered: false, registrationVersion: "2030-01-02T00:00:00.000Z" })).log, null);
  assert.equal((await plans.getCurrent())?.items[0]?.status, "registered");
});

test("reconcile is bounded, actor-isolated, keeps attended terminal and leaves items without a registration alone", async () => {
  const repository = createMemoryPlanRepository();
  const registrationService = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
  for (const actorId of ["actor:alice", "actor:bob", "actor:dave"]) await seedPlan(actorId, repository);
  await registrationService.register({ answers: ANSWERS, eventId: EVENT_ID, userId: "actor:alice" });
  await registrationService.register({ answers: ANSWERS, eventId: EVENT_ID, userId: "actor:bob" });
  // bob 已参加（终态）：从对账查询里消失。dave 没有报名记录：不动。
  await planServiceFor("actor:bob", repository).markEventAttended({ eventId: EVENT_ID });
  const deps = reconcileDeps(repository, registrationService);
  const readFor: string[] = [];
  const spied: PlanEventRegistrationDeps = {
    ...deps,
    readRegistrations: (input) => {
      readFor.push(input.actorId);
      return deps.readRegistrations(input);
    },
  };
  assert.deepEqual(await reconcileEventRegistrations(spied, { limit: 50 }), { examined: 2, failed: 0, replayed: 1 });
  // 每个 actor 只读自己的报名；已参加的 bob 不在查询里。
  assert.deepEqual(readFor, ["actor:alice", "actor:dave"]);
  assert.equal((await planServiceFor("actor:alice", repository).getCurrent())?.items[0]?.status, "registered");
  assert.equal((await planServiceFor("actor:bob", repository).getCurrent())?.items[0]?.status, "attended");
  assert.equal((await planServiceFor("actor:dave", repository).getCurrent())?.items[0]?.status, "recommended");

  // 上限：一次最多重放 limit 条。
  const many = createMemoryPlanRepository();
  const regs = createEventRegistrationService({ provider: createMemoryEventRegistrationProvider() });
  for (const actorId of ["actor:alice", "actor:bob", "actor:carol"]) {
    await seedPlan(actorId, many);
    await regs.register({ answers: ANSWERS, eventId: EVENT_ID, userId: actorId });
  }
  assert.equal((await reconcileEventRegistrations(reconcileDeps(many, regs), { limit: 2 })).replayed, 2);
  assert.equal((await reconcileEventRegistrations(reconcileDeps(many, regs), { limit: 2 })).replayed, 1);
});

test("the plan-event-registration task skips when the database is unconfigured", async () => {
  const task = createPlanEventRegistrationMaintenanceTask({ resolve: () => null });
  assert.equal(task.name, "plan-event-registration");
  assert.deepEqual(await task.run({ deadline: Date.now() + 1000, now: () => new Date() }), { skipped: "database_unconfigured" });
});
