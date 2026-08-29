import assert from "node:assert/strict";
import test from "node:test";

import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService } from "../../features/notifications/reminder-plan-service";
import type { PushProvider } from "../../features/notifications/push-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const NOW = "2026-08-29T02:00:00.000Z";

function harness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createReminderPlanRepository({ store, workspaceId: "workspace:test" });
  const service = createReminderPlanService({
    now: () => NOW,
    repository,
    targetAuthorizer: { async assertOwned({ actorId, targetId }) {
      if (targetId === "task:foreign" || actorId === "actor:blocked") throw new Error("not owned");
    } },
  });
  return { repository, service, store };
}

test("reminder plans create, list, reschedule, and cancel within one actor", async () => {
  const { service } = harness();
  const created = await service.create({
    actorId: "actor:a",
    body: "提前准备参会材料",
    channels: ["in_app", "ios_push"],
    createdBy: "user",
    deepLink: "/tasks/task%3Aevent",
    fireAt: "2026-08-29T05:00:00.000Z",
    idempotencyKey: "create:one",
    targetId: "task:event",
    targetType: "task",
    timeZone: "Asia/Tokyo",
    title: "活动准备",
  });
  assert.equal(created.status, "scheduled");
  assert.equal((await service.list({ actorId: "actor:a" })).length, 1);
  assert.equal((await service.list({ actorId: "actor:b" })).length, 0);

  const moved = await service.reschedule({
    actorId: "actor:a",
    expectedUpdatedAt: created.updatedAt,
    fireAt: "2026-08-29T06:00:00.000Z",
    idempotencyKey: "move:one",
    reminderId: created.id,
    timeZone: "Asia/Tokyo",
  });
  assert.equal(moved.fireAt, "2026-08-29T06:00:00.000Z");
  const cancelled = await service.cancel({
    actorId: "actor:a",
    idempotencyKey: "cancel:one",
    reminderId: created.id,
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancelledAt, NOW);
});

test("completing a target cancels all future plans without deleting its history", async () => {
  const { service } = harness();
  for (const [key, fireAt] of [["future:a", "2026-08-29T05:00:00.000Z"], ["future:b", "2026-08-30T05:00:00.000Z"]] as const) {
    await service.create({ actorId: "actor:a", body: "联系渡边", channels: ["in_app"], createdBy: "user", deepLink: "/tasks/task%3Awatanabe", fireAt, idempotencyKey: key, targetId: "task:watanabe", targetType: "task", timeZone: "Asia/Tokyo", title: "联系渡边" });
  }
  await service.create({ actorId: "actor:a", body: "已经触发", channels: ["in_app"], createdBy: "user", deepLink: "/tasks/task%3Awatanabe", fireAt: "2026-08-28T05:00:00.000Z", idempotencyKey: "past", targetId: "task:watanabe", targetType: "task", timeZone: "Asia/Tokyo", title: "旧提醒" });

  const count = await service.cancelFutureForTarget({ actorId: "actor:a", idempotencyKey: "task-complete", targetId: "task:watanabe", targetType: "task" });
  assert.equal(count, 2);
  const plans = await service.list({ actorId: "actor:a", targetId: "task:watanabe", targetType: "task", includeCancelled: true });
  assert.equal(plans.filter((item) => item.status === "cancelled").length, 2);
  assert.equal(plans.some((item) => item.fireAt === "2026-08-28T05:00:00.000Z"), true);
});

test("device registration and invalidation remain actor scoped", async () => {
  const { service } = harness();
  await service.registerDevice({ actorId: "actor:a", deviceId: "ios:one", permission: "granted", platform: "ios", token: "ExponentPushToken[a]" });
  await service.registerDevice({ actorId: "actor:b", deviceId: "ios:one", permission: "granted", platform: "ios", token: "ExponentPushToken[b]" });
  assert.equal((await service.notificationAvailability("actor:a")).iosPushAvailable, true);
  await service.invalidateDevice({ actorId: "actor:a", deviceId: "ios:one", reason: "DEVICE_NOT_REGISTERED" });
  assert.equal((await service.notificationAvailability("actor:a")).iosPushAvailable, false);
  assert.equal((await service.notificationAvailability("actor:b")).iosPushAvailable, true);
});

test("dispatch is idempotent, respects quiet hours, and preserves in-app fallback", async () => {
  const { service } = harness();
  await service.updatePreferences({
    actorId: "actor:a",
    inAppEnabled: true,
    iosPushEnabled: true,
    lockScreenContent: "private",
    quietHours: { enabled: true, end: "12:00", start: "10:00", timeZone: "Asia/Tokyo" },
  });
  await service.registerDevice({ actorId: "actor:a", deviceId: "ios:one", permission: "granted", platform: "ios", token: "ExponentPushToken[a]" });
  await service.create({ actorId: "actor:a", body: "Orbit 有一条提醒", channels: ["in_app", "ios_push"], createdBy: "user", deepLink: "/tasks/task%3Aquiet", fireAt: "2026-08-29T01:59:00.000Z", idempotencyKey: "quiet", targetId: "task:quiet", targetType: "task", timeZone: "Asia/Tokyo", title: "Orbit" });
  const calls: string[] = [];
  const provider: PushProvider = { async send(input) { calls.push(input.deliveryId); return { ok: true, providerMessageId: `provider:${input.deliveryId}` }; } };

  const first = await service.dispatchDue({ now: NOW, provider });
  const second = await service.dispatchDue({ now: NOW, provider });
  assert.equal(first.inAppDelivered, 1);
  assert.equal(first.pushDelivered, 0);
  assert.equal(first.quietHoursSuppressed, 1);
  assert.equal(second.claimed, 0);
  assert.deepEqual(calls, []);
});

test("an unconfigured or invalid push provider fails visibly without losing in-app delivery", async () => {
  const { service } = harness();
  await service.registerDevice({ actorId: "actor:a", deviceId: "ios:one", permission: "granted", platform: "ios", token: "ExponentPushToken[a]" });
  await service.create({ actorId: "actor:a", body: "联系佐藤", channels: ["in_app", "ios_push"], createdBy: "user", deepLink: "/tasks/task%3Asato", fireAt: "2026-08-29T01:59:00.000Z", idempotencyKey: "provider-fail", targetId: "task:sato", targetType: "task", timeZone: "Asia/Tokyo", title: "联系佐藤" });
  const provider: PushProvider = { async send() { return { ok: false, code: "DEVICE_NOT_REGISTERED", tokenInvalid: true }; } };

  const result = await service.dispatchDue({ now: NOW, provider });
  assert.equal(result.inAppDelivered, 1);
  assert.equal(result.pushFailed, 1);
  assert.equal((await service.notificationAvailability("actor:a")).iosPushAvailable, false);
  const deliveries = await service.listDeliveries({ actorId: "actor:a" });
  assert.deepEqual(deliveries.map((item) => item.status).sort(), ["delivered", "failed"]);
});
