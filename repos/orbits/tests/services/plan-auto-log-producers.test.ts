/**
 * W0012 SC-01 / SC-02：自动进展的每个生产者重复触发只留一条 auto 记录、不串写他人计划；
 * 手动进展的 @ 只以结构化字段保存，@ 某人后 TA 在所属人脉需求里变为已建立联系。
 *
 * 生产者与幂等键（服务层；Postgres 并发版见 plans-repository.test.ts）：
 * - 行动完成：`updateItem(set_status done)`，键 `item:<clientKey>`（命令回执）；无键时状态一致即不写；
 * - 联系人关联：`linkNeedContact`，键 `link:<clientKey>` / `match:<candidateId>`；已关联即不写；
 * - 建立联系：`recordInteraction`（键 `interaction:<clientKey>`）、手动 @（`mention:<note>:<need>:<contact>`）；已建立即不写；
 * - 活动报名 / 取消：`markEventRegistration`，键 `event-registered|event-cancelled:<item>:<registrationVersion>`；
 * - 活动参加：`markEventAttended`（W0015），键 `event-attended:<item>`；
 * - 进入新阶段：`enterCurrentPhase`，键 `phase-entered:<plan>:<phase>`（见 plan-phase-refinement.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanItem, PlanLogEntry, PlanService } from "../../features/plans/contract";
import { createAllowListPlanReferenceValidator, type PlanReferenceAllowList } from "../../features/plans/reference-validator";
import { createMemoryPlanRepository, type MemoryPlanRepository } from "../../features/plans/repository";
import { createPlanService, PlanServiceError } from "../../features/plans/service";
import { planInput, steppingClock } from "../support/plan-fixture";

const WORKSPACE = "workspace:plan-producers";
const ALLOW_LIST: PlanReferenceAllowList = {
  contactsByActor: {
    "actor:alice": ["contact:tanaka", "contact:sato"],
    "actor:bob": ["contact:bob-only"],
  },
  eventIds: ["event:tokyo-saas-night"],
};

function serviceFor(actorId: string, repository: MemoryPlanRepository): PlanService {
  return createPlanService({
    now: steppingClock(),
    references: createAllowListPlanReferenceValidator({ actorId, allowList: ALLOW_LIST }),
    repository,
    scope: { actorId, workspaceId: WORKSPACE },
  });
}

async function setup() {
  const repository = createMemoryPlanRepository();
  const alice = serviceFor("actor:alice", repository);
  const bob = serviceFor("actor:bob", repository);
  const plan = await alice.createVersion(planInput());
  const bobPlan = await bob.createVersion(planInput());
  const find = (items: readonly PlanItem[], kind: PlanItem["kind"]) => items.find((item) => item.kind === kind)!;
  return { alice, bob, bobPlan, find, plan, repository };
}

function autoLogs(repository: MemoryPlanRepository, actorId: string, predicate: (entry: PlanLogEntry) => boolean): PlanLogEntry[] {
  return repository.dump({ actorId, workspaceId: WORKSPACE }).log.filter((entry) => entry.kind === "auto" && predicate(entry));
}

async function rejectsWith(promise: Promise<unknown>, reason: PlanServiceError["reason"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PlanServiceError, `expected PlanServiceError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  });
}

test("action done: repeated ticks (keyed or not) leave one auto entry; another actor's item is 404", async () => {
  const { alice, bob, find, plan, repository } = await setup();
  const action = find(plan.items, "action");
  await alice.updateItem({ change: { op: "set_status", status: "done" }, idempotencyKey: "tick-1", itemId: action.id });
  await alice.updateItem({ change: { op: "set_status", status: "done" }, idempotencyKey: "tick-1", itemId: action.id });
  await alice.updateItem({ change: { op: "set_status", status: "done" }, itemId: action.id });
  assert.equal(autoLogs(repository, "actor:alice", (entry) => entry.itemId === action.id && entry.toStatus === "done").length, 1);
  await rejectsWith(bob.updateItem({ change: { op: "set_status", status: "done" }, itemId: action.id }), "ITEM_NOT_FOUND");
  assert.equal(autoLogs(repository, "actor:bob", (entry) => entry.event === "item_status_changed").length, 0);
});

test("contact linked: linking the same contact twice leaves one contact_linked entry; foreign contacts are refused", async () => {
  const { alice, bob, find, plan, repository } = await setup();
  const need = find(plan.items, "network_need");
  await alice.linkNeedContact({ contactId: "contact:tanaka", needItemId: need.id });
  await alice.linkNeedContact({ contactId: "contact:tanaka", needItemId: need.id });
  await alice.linkNeedContact({ contactId: "contact:tanaka", idempotencyKey: "link-1", needItemId: need.id });
  assert.equal(autoLogs(repository, "actor:alice", (entry) => entry.event === "contact_linked").length, 1);
  await rejectsWith(alice.linkNeedContact({ contactId: "contact:bob-only", needItemId: need.id }), "REFERENCE_NOT_FOUND");
  await rejectsWith(bob.linkNeedContact({ contactId: "contact:bob-only", needItemId: need.id }), "ITEM_NOT_FOUND");
  assert.equal(autoLogs(repository, "actor:bob", (entry) => entry.event === "contact_linked").length, 0);
});

test("connection established: 记一次互动 twice leaves one contact_established entry; bob cannot log on alice's action", async () => {
  const { alice, bob, find, plan, repository } = await setup();
  const need = find(plan.items, "network_need");
  const { action } = await alice.linkNeedContact({ contactId: "contact:tanaka", needItemId: need.id });
  await alice.recordInteraction({ actionItemId: action.id, idempotencyKey: "met-1" });
  await alice.recordInteraction({ actionItemId: action.id, idempotencyKey: "met-1" });
  await alice.recordInteraction({ actionItemId: action.id });
  assert.equal(autoLogs(repository, "actor:alice", (entry) => entry.event === "contact_established").length, 1);
  await rejectsWith(bob.recordInteraction({ actionItemId: action.id }), "ITEM_NOT_FOUND");
});

test("event registered / cancelled: one entry per real transition, retries of the same registration write nothing", async () => {
  const { alice, bob, find, plan, repository } = await setup();
  const event = find(plan.items, "event");
  const eventId = event.linkedEventId!;

  const registered = await alice.markEventRegistration({ eventId, registered: true, registrationVersion: "v1" });
  assert.equal(registered.item?.status, "registered");
  assert.equal(registered.log?.idempotencyKey, `event-registered:${event.id}:v1`);
  assert.equal(registered.log?.payload.source, "event_registration");
  assert.equal(registered.log?.linkedEventId, eventId);
  // 同一次报名重试、报名信息更新（新版本但状态没变）：不再写。
  assert.equal((await alice.markEventRegistration({ eventId, registered: true, registrationVersion: "v1" })).log, null);
  assert.equal((await alice.markEventRegistration({ eventId, registered: true, registrationVersion: "v2" })).log, null);

  // 取消：已报名 → 推荐（W0007 的回退迁移），一条。
  const cancelled = await alice.markEventRegistration({ eventId, registered: false, registrationVersion: "v3" });
  assert.equal(cancelled.item?.status, "recommended");
  assert.equal(cancelled.log?.fromStatus, "registered");
  assert.equal(cancelled.log?.toStatus, "recommended");
  assert.equal((await alice.markEventRegistration({ eventId, registered: false, registrationVersion: "v3" })).log, null);

  // 重新报名是新的一次真实变化。
  assert.ok((await alice.markEventRegistration({ eventId, registered: true, registrationVersion: "v4" })).log);
  const logs = autoLogs(repository, "actor:alice", (entry) => entry.itemId === event.id && entry.event === "item_status_changed");
  assert.deepEqual(logs.map((entry) => entry.toStatus), ["registered", "recommended", "registered"]);

  // bob 报名同一场活动只改 bob 自己的计划。
  await bob.markEventRegistration({ eventId, registered: true, registrationVersion: "b1" });
  assert.equal(autoLogs(repository, "actor:alice", (entry) => entry.itemId === event.id).length, 3);
  assert.equal(autoLogs(repository, "actor:bob", (entry) => entry.toStatus === "registered").length, 1);

  // 没有这场活动、没有计划：什么都不做。
  assert.deepEqual(await alice.markEventRegistration({ eventId: "event:unknown", registered: true, registrationVersion: "x" }), { item: null, log: null });
  const nobody = serviceFor("actor:nobody", repository);
  assert.deepEqual(await nobody.markEventRegistration({ eventId, registered: true, registrationVersion: "x" }), { item: null, log: null });
});

test("concurrent registration syncs of the same registration write once", async () => {
  const { alice, find, plan, repository } = await setup();
  const event = find(plan.items, "event");
  await Promise.all(
    [1, 2, 3].map(() => alice.markEventRegistration({ eventId: event.linkedEventId!, registered: true, registrationVersion: "v1" })),
  );
  assert.equal(autoLogs(repository, "actor:alice", (entry) => entry.itemId === event.id).length, 1);
});

test("attended is terminal: registration sync never moves an attended event, attended logs once", async () => {
  const { alice, find, plan, repository } = await setup();
  const event = find(plan.items, "event");
  const eventId = event.linkedEventId!;
  await alice.markEventRegistration({ eventId, registered: true, registrationVersion: "v1" });
  await alice.markEventAttended({ eventId });
  await alice.markEventAttended({ eventId });
  assert.equal(autoLogs(repository, "actor:alice", (entry) => entry.toStatus === "attended").length, 1);
  const cancel = await alice.markEventRegistration({ eventId, registered: false, registrationVersion: "v9" });
  assert.equal(cancel.item?.status, "attended");
  assert.equal(cancel.log, null);
});

test("a manual note @-mentions contacts and an event as structured refs; the mentioned contact becomes established", async () => {
  const { alice, bob, find, plan, repository } = await setup();
  const need = find(plan.items, "network_need");
  await alice.linkNeedContact({ contactId: "contact:tanaka", needItemId: need.id });

  const { entry } = await alice.addManualLog({
    body: "和田中在 SaaS Night 聊了 20 分钟",
    idempotencyKey: "note-1",
    linkedContactIds: ["contact:tanaka", "contact:sato"],
    linkedEventId: "event:tokyo-saas-night",
  });
  assert.equal(entry.kind, "manual");
  assert.deepEqual(entry.linkedContactIds, ["contact:tanaka", "contact:sato"]);
  assert.equal(entry.linkedEventId, "event:tokyo-saas-night");
  // 正文里写的名字不会被解析：引用只来自结构化字段。
  const current = (await alice.getCurrent())!;
  const updated = current.items.find((item) => item.id === need.id)!;
  assert.equal(updated.status, "established");
  assert.equal(updated.contactLinks.find((link) => link.contactId === "contact:tanaka")?.state, "established");
  const established = autoLogs(repository, "actor:alice", (log) => log.event === "contact_established");
  assert.equal(established.length, 1);
  assert.equal(established[0]!.idempotencyKey, `mention:${entry.id}:${need.id}:contact:tanaka`);
  assert.equal(established[0]!.payload.source, "manual_mention");
  // sato 没有关联到任何需求：不凭空建立关联。
  assert.equal(updated.contactLinks.some((link) => link.contactId === "contact:sato"), false);

  // 同一次提交重试：回放，不再写；再 @ 一次已建立的人：只多一条手动记录。
  await alice.addManualLog({
    body: "和田中在 SaaS Night 聊了 20 分钟",
    idempotencyKey: "note-1",
    linkedContactIds: ["contact:tanaka", "contact:sato"],
    linkedEventId: "event:tokyo-saas-night",
  });
  await alice.addManualLog({ body: "又和田中通了电话", linkedContactIds: ["contact:tanaka"] });
  assert.equal(autoLogs(repository, "actor:alice", (log) => log.event === "contact_established").length, 1);

  const noText = await alice.addManualLog({ body: "@田中 见面了" });
  assert.deepEqual(noText.entry.linkedContactIds, []);

  // 他人的联系人、未发布的活动：404，不写。
  const before = repository.dump({ actorId: "actor:alice", workspaceId: WORKSPACE }).log.length;
  await rejectsWith(alice.addManualLog({ body: "x", linkedContactIds: ["contact:bob-only"] }), "REFERENCE_NOT_FOUND");
  await rejectsWith(alice.addManualLog({ body: "x", linkedEventId: "event:draft-only" }), "REFERENCE_NOT_FOUND");
  assert.equal(repository.dump({ actorId: "actor:alice", workspaceId: WORKSPACE }).log.length, before);
  // bob @ 自己的联系人不影响 alice 的需求。
  await bob.addManualLog({ body: "x", linkedContactIds: ["contact:bob-only"] });
  assert.equal(autoLogs(repository, "actor:alice", (log) => log.event === "contact_established").length, 1);
});
