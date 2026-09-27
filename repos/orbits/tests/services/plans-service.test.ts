/**
 * W0007 SC-02 / SC-03：计划服务（内存仓储，语义与 Postgres 相同；Postgres 版见
 * tests/capabilities/plans-repository.test.ts）。
 * 一份生效计划、版本继承、四类条目只接受合法转移、每次变化一条 auto 记录、
 * 手动记录的结构化引用、幂等、归档只读、输入校验、factory fail closed。
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { PlanItem, PlanService } from "../../features/plans/contract";
import { createMemoryPlanRepository, type MemoryPlanRepository } from "../../features/plans/repository";
import { createAllowListPlanReferenceValidator, type PlanReferenceAllowList } from "../../features/plans/reference-validator";
import { createPlanService, PlanServiceError } from "../../features/plans/service";
import {
  resetPlansMockRepositoryForTests,
  resolvePlanService,
} from "../../features/plans/service-factory";
import { planInput, steppingClock } from "../support/plan-fixture";

const WORKSPACE = "workspace:plans-service-test";

/** 各人拥有的联系人与公开活动目录；bob 的联系人对 alice 来说「不存在」。 */
const ALLOW_LIST: PlanReferenceAllowList = {
  contactsByActor: {
    "actor:alice": ["contact:tanaka", "contact:sato", "contact:suzuki", "contact:x"],
    "actor:bob": ["contact:bob-only"],
  },
  eventIds: ["event:tokyo-saas-night"],
};

function harness(actorId = "actor:alice", repository: MemoryPlanRepository = createMemoryPlanRepository()) {
  const service = createPlanService({
    now: steppingClock(),
    references: createAllowListPlanReferenceValidator({ actorId, allowList: ALLOW_LIST }),
    repository,
    scope: { actorId, workspaceId: WORKSPACE },
  });
  return { repository, service };
}

function itemOf(items: readonly PlanItem[], title: string): PlanItem {
  const found = items.find((item) => item.title === title);
  assert.ok(found, `missing item ${title}`);
  return found;
}

async function rejectsWith(promise: Promise<unknown>, reason: PlanServiceError["reason"]): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof PlanServiceError, `expected PlanServiceError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    return true;
  });
}

async function logCount(service: PlanService): Promise<number> {
  return (await service.getCurrent())?.log.length ?? 0;
}

test("creating the first plan stores v1 as the only active plan with a plan_created log", async () => {
  const { service } = harness();
  assert.equal(await service.getCurrent(), null);

  const snapshot = await service.createVersion(planInput());
  assert.equal(snapshot.plan.version, 1);
  assert.equal(snapshot.plan.status, "active");
  assert.equal(snapshot.plan.startsOn, "2026-09-28");
  assert.equal(snapshot.plan.horizon, "quarter");
  assert.equal(snapshot.items.length, 5);
  assert.deepEqual(
    snapshot.items.map((item) => [item.kind, item.status]),
    [["action", "not_started"], ["action", "not_started"], ["network_need", "open"], ["info", "open"], ["event", "recommended"]],
  );
  assert.equal(snapshot.log.length, 1);
  assert.equal(snapshot.log[0]!.event, "plan_created");
  assert.equal(snapshot.log[0]!.kind, "auto");
  assert.equal((await service.getCurrent())?.plan.id, snapshot.plan.id);
});

test("a new version archives the old one and carries completed actions and linked contacts", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const done = itemOf(v1.items, "整理 20 家目标客户名单");
  const need = itemOf(v1.items, "日本市场的渠道伙伴");
  const info = itemOf(v1.items, "日本 SaaS 采购一般要多久");
  const event = itemOf(v1.items, "Tokyo SaaS Night");

  await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: done.id });
  await service.updateItem({ change: { contactId: "contact:tanaka", op: "link_contact" }, itemId: need.id });
  await service.updateItem({ change: { contactId: "contact:sato", op: "link_contact" }, itemId: need.id });
  await service.updateItem({ change: { contactId: "contact:tanaka", op: "establish_contact" }, itemId: need.id });
  await service.updateItem({ change: { answer: "大约 3 个月", op: "set_answer" }, itemId: info.id });
  await service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id });

  // v2：取代人脉需求（继承联系人），同一活动再次出现（并入报名状态），没提到完成的行动与信息（原样带入）。
  const v2 = await service.createVersion(planInput({
    basePlanId: v1.plan.id,
    items: [
      { kind: "action", phaseKey: "p1", suggestedWeek: 2, title: "拜访三家渠道商" },
      {
        contactIds: ["contact:suzuki"],
        inheritsFromItemId: need.id,
        kind: "network_need",
        phaseKey: "p2",
        title: "渠道伙伴（重新定义）",
      },
      { kind: "event", linkedEventId: "event:tokyo-saas-night", phaseKey: "p2", title: "Tokyo SaaS Night（v2）" },
    ],
  }));

  assert.equal(v2.plan.version, 2);
  assert.equal(v2.plan.previousPlanId, v1.plan.id);
  const versions = await service.listVersions();
  assert.deepEqual(versions.map((plan) => [plan.version, plan.status]), [[2, "active"], [1, "archived"]]);

  // 旧版本保持原样。
  const archived = await service.getPlan(v1.plan.id);
  assert.equal(archived?.plan.status, "archived");
  assert.equal(itemOf(archived!.items, "整理 20 家目标客户名单").status, "done");

  const newNeed = itemOf(v2.items, "渠道伙伴（重新定义）");
  assert.equal(newNeed.carriedFromItemId, need.id);
  assert.equal(newNeed.status, "established");
  assert.deepEqual(newNeed.linkedContactIds, ["contact:tanaka", "contact:sato", "contact:suzuki"]);
  assert.deepEqual(
    newNeed.contactLinks.map((link) => [link.contactId, link.state]),
    [["contact:tanaka", "established"], ["contact:sato", "linked"], ["contact:suzuki", "linked"]],
  );

  const newEvent = itemOf(v2.items, "Tokyo SaaS Night（v2）");
  assert.equal(newEvent.status, "registered");
  assert.equal(newEvent.carriedFromItemId, event.id);

  const carriedAction = itemOf(v2.items, "整理 20 家目标客户名单");
  assert.equal(carriedAction.status, "done");
  assert.equal(carriedAction.carriedFromItemId, done.id);
  assert.equal(carriedAction.suggestedWeek, null);
  assert.ok(carriedAction.completedAt);
  const carriedInfo = itemOf(v2.items, "日本 SaaS 采购一般要多久");
  assert.equal(carriedInfo.answer, "大约 3 个月");

  // 未完成的旧行动不带入；活动与人脉需求不重复。
  assert.equal(v2.items.filter((item) => item.title === "约两位行业前辈喝咖啡").length, 0);
  assert.equal(v2.items.filter((item) => item.kind === "event").length, 1);
  assert.equal(v2.items.filter((item) => item.kind === "network_need").length, 1);
  assert.equal(v2.log[0]!.event, "plan_created");
  assert.equal(v2.log[0]!.payload.carriedCount, 2);
  assert.equal(v2.log[0]!.payload.inheritedCount, 2);
});

test("an unclaimed need with linked contacts is carried over instead of being dropped", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const need = itemOf(v1.items, "日本市场的渠道伙伴");
  await service.updateItem({ change: { contactId: "contact:tanaka", op: "link_contact" }, itemId: need.id });
  const v2 = await service.createVersion(planInput({ items: [], phases: [{ endWeek: 4, granularity: "week", key: "other", startWeek: 1, title: "新阶段" }] }));
  const carried = itemOf(v2.items, "日本市场的渠道伙伴");
  assert.deepEqual(carried.linkedContactIds, ["contact:tanaka"]);
  assert.equal(carried.phaseKey, null, "phase keys missing from the new version are cleared");
});

test("basePlanId guards against stale or duplicate version creation", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput({ basePlanId: null }));
  await rejectsWith(service.createVersion(planInput({ basePlanId: null })), "BASE_PLAN_MISMATCH");
  await rejectsWith(service.createVersion(planInput({ basePlanId: "plan:stale" })), "BASE_PLAN_MISMATCH");
  const v2 = await service.createVersion(planInput({ basePlanId: v1.plan.id }));
  assert.equal(v2.plan.version, 2);
  assert.equal((await service.listVersions()).filter((plan) => plan.status === "active").length, 1);
});

test("concurrent version creation leaves exactly one active plan", async () => {
  const { service } = harness();
  const results = await Promise.allSettled([
    service.createVersion(planInput({ basePlanId: null })),
    service.createVersion(planInput({ basePlanId: null })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const unguarded = await Promise.all([service.createVersion(planInput()), service.createVersion(planInput())]);
  assert.deepEqual(unguarded.map((snapshot) => snapshot.plan.version).sort(), [2, 3]);
  const versions = await service.listVersions();
  assert.equal(versions.filter((plan) => plan.status === "active").length, 1);
  assert.equal(versions[0]!.status, "active");
  assert.equal(versions[0]!.version, 3);
});

test("the same creationKey saves only one plan", async () => {
  const { service } = harness();
  const [first, second] = await Promise.all([
    service.createVersion(planInput({ creationKey: "bootstrap:1" })),
    service.createVersion(planInput({ creationKey: "bootstrap:1" })),
  ]);
  assert.equal(first.plan.id, second.plan.id);
  assert.equal((await service.listVersions()).length, 1);
});

test("actions accept only legal transitions and each change writes one auto log", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const action = itemOf(v1.items, "整理 20 家目标客户名单");
  const other = itemOf(v1.items, "约两位行业前辈喝咖啡");

  const started = await service.updateItem({ change: { op: "set_status", status: "in_progress" }, itemId: action.id });
  assert.equal(started.item.status, "in_progress");
  assert.equal(started.log?.event, "item_status_changed");
  assert.equal(started.log?.fromStatus, "not_started");
  assert.equal(started.log?.toStatus, "in_progress");
  assert.equal(started.log?.itemId, action.id);
  assert.equal(started.log?.kind, "auto");

  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "not_started" }, itemId: action.id }), "ILLEGAL_TRANSITION");
  const done = await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: action.id });
  assert.ok(done.item.completedAt);
  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "in_progress" }, itemId: action.id }), "ILLEGAL_TRANSITION");
  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: action.id }), "ILLEGAL_TRANSITION");
  const undone = await service.updateItem({ change: { op: "set_status", status: "not_started" }, itemId: action.id });
  assert.equal(undone.item.completedAt, null);

  // 打勾：未开始直接完成。
  const checked = await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: other.id });
  assert.equal(checked.item.status, "done");

  // 与当前状态相同：无变化，不写记录。
  const noop = await service.updateItem({ change: { op: "set_status", status: "done" }, itemId: other.id });
  assert.equal(noop.log, null);

  // 1 plan_created + 4 次真实变化；非法转移与无变化都没有写。
  assert.equal(await logCount(service), 5);
});

test("deferring an action moves it to a later week and counts the deferral", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const action = itemOf(v1.items, "约两位行业前辈喝咖啡");
  const deferred = await service.updateItem({ change: { op: "defer_action", toWeek: 3 }, itemId: action.id });
  assert.equal(deferred.item.suggestedWeek, 3);
  assert.equal(deferred.item.deferralCount, 1);
  assert.equal(deferred.log?.event, "action_deferred");
  assert.deepEqual(deferred.log?.payload, { fromWeek: 2, op: "defer_action", toWeek: 3 });
  await rejectsWith(service.updateItem({ change: { op: "defer_action", toWeek: 3 }, itemId: action.id }), "ILLEGAL_TRANSITION");
});

test("event items move recommended → registered → attended and back to recommended on cancel", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const event = itemOf(v1.items, "Tokyo SaaS Night");

  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "attended" }, itemId: event.id }), "ILLEGAL_TRANSITION");
  await service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id });
  const cancelled = await service.updateItem({ change: { op: "set_status", status: "recommended" }, itemId: event.id });
  assert.equal(cancelled.log?.body, "取消报名：Tokyo SaaS Night");
  assert.equal(cancelled.log?.linkedEventId, "event:tokyo-saas-night");
  await service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id });
  const attended = await service.updateItem({ change: { op: "set_status", status: "attended" }, itemId: event.id });
  assert.equal(attended.item.status, "attended");
  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id }), "ILLEGAL_TRANSITION");
  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "recommended" }, itemId: event.id }), "ILLEGAL_TRANSITION");
});

test("network needs link contacts in two levels and derive their status", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const need = itemOf(v1.items, "日本市场的渠道伙伴");

  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "linked" }, itemId: need.id }), "ILLEGAL_TRANSITION");
  await rejectsWith(service.updateItem({ change: { contactId: "contact:tanaka", op: "establish_contact" }, itemId: need.id }), "ILLEGAL_TRANSITION");

  const linked = await service.updateItem({ change: { contactId: "contact:tanaka", op: "link_contact" }, itemId: need.id });
  assert.equal(linked.item.status, "linked");
  assert.deepEqual(linked.log?.linkedContactIds, ["contact:tanaka"]);
  assert.equal(linked.log?.event, "contact_linked");

  const established = await service.updateItem({ change: { contactId: "contact:tanaka", op: "establish_contact" }, itemId: need.id });
  assert.equal(established.item.status, "established");
  assert.equal(established.log?.fromStatus, "linked");
  assert.equal(established.log?.toStatus, "established");
  assert.ok(established.item.contactLinks[0]!.establishedAt);

  await rejectsWith(service.updateItem({ change: { contactId: "contact:tanaka", op: "unlink_contact" }, itemId: need.id }), "ILLEGAL_TRANSITION");
  await service.updateItem({ change: { contactId: "contact:sato", op: "link_contact" }, itemId: need.id });
  const unlinked = await service.updateItem({ change: { contactId: "contact:sato", op: "unlink_contact" }, itemId: need.id });
  assert.deepEqual(unlinked.item.linkedContactIds, ["contact:tanaka"]);
  assert.equal(unlinked.log?.event, "contact_unlinked");

  // 信息条目不能关联联系人。
  const info = itemOf(v1.items, "日本 SaaS 采购一般要多久");
  await rejectsWith(service.updateItem({ change: { contactId: "contact:x", op: "link_contact" }, itemId: info.id }), "ILLEGAL_TRANSITION");
});

test("info items take answers and derive answered / open", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const info = itemOf(v1.items, "日本 SaaS 采购一般要多久");
  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "answered" }, itemId: info.id }), "ILLEGAL_TRANSITION");
  const answered = await service.updateItem({ change: { answer: "  大约 3 个月  ", op: "set_answer" }, itemId: info.id });
  assert.equal(answered.item.answer, "大约 3 个月");
  assert.equal(answered.item.status, "answered");
  const cleared = await service.updateItem({ change: { answer: "   ", op: "set_answer" }, itemId: info.id });
  assert.equal(cleared.item.status, "open");
  assert.equal(cleared.item.answer, null);
  const action = itemOf(v1.items, "整理 20 家目标客户名单");
  await rejectsWith(service.updateItem({ change: { answer: "x", op: "set_answer" }, itemId: action.id }), "ILLEGAL_TRANSITION");
});

test("the same idempotency key applies a change once", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  const event = itemOf(v1.items, "Tokyo SaaS Night");
  const input = { change: { op: "set_status", status: "registered" } as const, idempotencyKey: "registration:42", itemId: event.id };
  const first = await service.updateItem(input);
  const replay = await service.updateItem(input);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.log?.id, first.log?.id);
  assert.equal(await logCount(service), 2);

  const action = itemOf(v1.items, "整理 20 家目标客户名单");
  await rejectsWith(service.updateItem({ ...input, change: { op: "set_status", status: "done" }, itemId: action.id }), "IDEMPOTENCY_KEY_REUSED");
  await rejectsWith(service.updateItem({ ...input, change: { op: "set_status", status: "recommended" } }), "IDEMPOTENCY_KEY_REUSED");
});

test("a keyed no-op leaves a receipt, so a delayed retry cannot overwrite a newer change", async () => {
  const { repository, service } = harness();
  const v1 = await service.createVersion(planInput());
  const event = itemOf(v1.items, "Tokyo SaaS Night");
  await service.updateItem({ change: { op: "set_status", status: "registered" }, itemId: event.id });

  // 客户端重复发了一次「报名」（此时已报名 → 无变化），带 key。
  const stale = { change: { op: "set_status", status: "registered" } as const, idempotencyKey: "tap:7", itemId: event.id };
  const first = await service.updateItem(stale);
  assert.equal(first.log, null);
  assert.equal(first.replayed, false);
  const receipts = repository.dump({ actorId: "actor:alice", workspaceId: WORKSPACE }).commands;
  assert.deepEqual(receipts.map((receipt) => [receipt.idempotencyKey, receipt.outcome, receipt.itemId]), [["item:tap:7", "noop", event.id]]);

  // 用户随后取消报名；那次旧请求延迟重放：只回放、不重新报名。
  await service.updateItem({ change: { op: "set_status", status: "recommended" }, itemId: event.id });
  const logsBefore = await logCount(service);
  const retried = await service.updateItem(stale);
  assert.equal(retried.replayed, true);
  assert.equal(retried.log, null);
  assert.equal(retried.item.status, "recommended");
  assert.equal(await logCount(service), logsBefore);
});

test("concurrent retries of the same keyed request write once", async () => {
  const { repository, service } = harness();
  const v1 = await service.createVersion(planInput());
  const action = itemOf(v1.items, "整理 20 家目标客户名单");
  const input = { change: { op: "set_status", status: "done" } as const, idempotencyKey: "check:9", itemId: action.id };
  const results = await Promise.all([service.updateItem(input), service.updateItem(input), service.updateItem(input)]);
  assert.equal(results.filter((result) => !result.replayed).length, 1);
  assert.equal(new Set(results.map((result) => result.log?.id)).size, 1);
  const rows = repository.dump({ actorId: "actor:alice", workspaceId: WORKSPACE });
  assert.equal(rows.log.length, 2);
  assert.equal(rows.commands.length, 1);
});

test("unknown or foreign contacts and events are rejected with REFERENCE_NOT_FOUND and nothing is written", async () => {
  const { repository, service } = harness();
  const scope = { actorId: "actor:alice", workspaceId: WORKSPACE };
  const withContact = (contactId: string) =>
    planInput({ items: [{ contactIds: [contactId], kind: "network_need", title: "需要的人" }] });
  await rejectsWith(service.createVersion(withContact("contact:bob-only")), "REFERENCE_NOT_FOUND");
  await rejectsWith(service.createVersion(withContact("contact:nobody")), "REFERENCE_NOT_FOUND");
  await rejectsWith(
    service.createVersion(planInput({ items: [{ kind: "event", linkedEventId: "event:unpublished", title: "未发布" }] })),
    "REFERENCE_NOT_FOUND",
  );
  assert.deepEqual(repository.dump(scope).plans, []);

  const v1 = await service.createVersion(planInput());
  const need = itemOf(v1.items, "日本市场的渠道伙伴");
  const before = repository.dump(scope);
  await rejectsWith(
    service.updateItem({ change: { contactId: "contact:bob-only", op: "link_contact" }, idempotencyKey: "link:1", itemId: need.id }),
    "REFERENCE_NOT_FOUND",
  );
  await rejectsWith(service.addManualLog({ body: "x", linkedContactIds: ["contact:bob-only"] }), "REFERENCE_NOT_FOUND");
  await rejectsWith(service.addManualLog({ body: "x", linkedEventId: "event:unpublished" }), "REFERENCE_NOT_FOUND");
  assert.deepEqual(repository.dump(scope), before);
});

test("the same manual-log key with a different body is a conflict", async () => {
  const { service } = harness();
  await service.createVersion(planInput());
  await service.addManualLog({ body: "第一次", idempotencyKey: "note:x" });
  await rejectsWith(service.addManualLog({ body: "改过的", idempotencyKey: "note:x" }), "IDEMPOTENCY_KEY_REUSED");
});

test("manual logs keep structured contact / event / item references", async () => {
  const { service } = harness();
  await rejectsWith(service.addManualLog({ body: "还没有计划" }), "NO_ACTIVE_PLAN");
  const v1 = await service.createVersion(planInput());
  const need = itemOf(v1.items, "日本市场的渠道伙伴");
  const { entry } = await service.addManualLog({
    body: "和 @田中 在 @Tokyo SaaS Night 聊了渠道合作",
    itemId: need.id,
    linkedContactIds: ["contact:tanaka"],
    linkedEventId: "event:tokyo-saas-night",
  });
  assert.equal(entry.kind, "manual");
  assert.equal(entry.event, "note");
  assert.equal(entry.author, "user");
  assert.deepEqual(entry.linkedContactIds, ["contact:tanaka"]);
  assert.equal(entry.linkedEventId, "event:tokyo-saas-night");
  assert.equal(entry.itemId, need.id);
  assert.equal((await service.getCurrent())?.log[0]?.id, entry.id);

  const replay = await service.addManualLog({ body: "重复", idempotencyKey: "note:1" });
  const again = await service.addManualLog({ body: "重复", idempotencyKey: "note:1" });
  assert.equal(again.replayed, true);
  assert.equal(again.entry.id, replay.entry.id);

  await rejectsWith(service.addManualLog({ body: "  " }), "INVALID_INPUT");
  await rejectsWith(service.addManualLog({ body: "x", itemId: "item:missing" }), "ITEM_NOT_FOUND");
});

test("archived versions are read-only", async () => {
  const { service } = harness();
  const v1 = await service.createVersion(planInput());
  await service.createVersion(planInput());
  const oldAction = itemOf(v1.items, "约两位行业前辈喝咖啡");
  await rejectsWith(service.updateItem({ change: { op: "set_status", status: "done" }, itemId: oldAction.id }), "PLAN_ARCHIVED");
  const archived = await service.getPlan(v1.plan.id);
  assert.equal(itemOf(archived!.items, "约两位行业前辈喝咖啡").status, "not_started");
});

test("another actor can neither read nor change the plan", async () => {
  const repository = createMemoryPlanRepository();
  const alice = harness("actor:alice", repository).service;
  const bob = harness("actor:bob", repository).service;
  const v1 = await alice.createVersion(planInput());
  assert.equal(await bob.getCurrent(), null);
  assert.equal(await bob.getPlan(v1.plan.id), null);
  assert.deepEqual(await bob.listVersions(), []);
  await rejectsWith(bob.updateItem({ change: { op: "set_status", status: "done" }, itemId: v1.items[0]!.id }), "ITEM_NOT_FOUND");
  assert.equal((await alice.getCurrent())?.items[0]?.status, "not_started");
});

test("invalid plan input is rejected before anything is written", async () => {
  const { repository, service } = harness();
  const cases = [
    planInput({ horizon: "decade" as never }),
    planInput({ startsOn: "2026-02-30" }),
    planInput({ phases: [] }),
    planInput({ phases: [{ endWeek: 4, granularity: "week", key: "a", startWeek: 1, title: "A" }, { endWeek: 6, granularity: "week", key: "b", startWeek: 3, title: "B" }] }),
    planInput({ items: [{ kind: "action", phaseKey: "p1", suggestedWeek: 9, title: "周次不在阶段内" }] }),
    planInput({ items: [{ kind: "action", phaseKey: "missing", title: "阶段不存在" }] }),
    planInput({ items: [{ kind: "event", title: "没有活动 id" }] }),
    planInput({ items: [{ kind: "action", status: "done", title: "不能以完成开始" }] }),
    planInput({ items: [{ kind: "network_need", status: "linked", title: "状态是推导的" }] }),
    planInput({ items: [{ criteria: { primaryIndustryId: "food_hospitality", secondaryIndustryId: "technology_internet.ai_data" }, kind: "network_need", title: "行业不匹配" }] }),
    planInput({ items: [{ answer: "x", kind: "action", title: "答案只属于信息" }] }),
    planInput({ items: [{ inheritsFromItemId: "item:unknown", kind: "action", title: "继承不存在的条目" }] }),
    planInput({ goalSnapshot: "   " }),
  ];
  for (const input of cases) {
    await rejectsWith(service.createVersion(input), "INVALID_INPUT");
  }
  assert.deepEqual(repository.dump({ actorId: "actor:alice", workspaceId: WORKSPACE }).plans, []);
});

const DATABASE_ENV_KEYS = [
  "ORBIT_EVENT_DATABASE_URL",
  "ORBIT_LIVE_DATABASE_URL",
  "ORBIT_DATABASE_URL",
  "ORBIT_LOCAL_DATABASE_URL",
  "ORBIT_DATABASE_TARGET",
  "ORBIT_EXPECTED_DATABASE_HOST",
] as const;

test("live mode without a configured database fails closed with NOT_IMPLEMENTED", () => {
  const previous = new Map(DATABASE_ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of DATABASE_ENV_KEYS) delete process.env[key];
  try {
    const resolution = resolvePlanService({ actorId: "actor:a", mode: "live" });
    assert.equal(resolution.success, false);
    if (resolution.success === false) {
      assert.equal(resolution.error.code, "NOT_IMPLEMENTED");
      assert.equal(resolution.error.capabilityId, "plans");
      assert.equal(resolution.error.requestedMode, "live");
    }
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("mock mode keeps plans in the shared in-process repository, scoped by actor", async () => {
  resetPlansMockRepositoryForTests();
  try {
    const first = resolvePlanService({ actorId: "actor:mock", mode: "mock" });
    assert.equal(first.success, true);
    if (!first.success) return;
    await first.service.createVersion(planInput());
    const again = resolvePlanService({ actorId: "actor:mock", mode: "mock" });
    const other = resolvePlanService({ actorId: "actor:other", mode: "mock" });
    assert.ok(again.success && other.success);
    if (again.success) assert.equal((await again.service.getCurrent())?.plan.version, 1);
    if (other.success) assert.equal(await other.service.getCurrent(), null);
  } finally {
    resetPlansMockRepositoryForTests();
  }
});
