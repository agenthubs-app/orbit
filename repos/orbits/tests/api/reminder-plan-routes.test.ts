import assert from "node:assert/strict";
import test from "node:test";

import { createNotificationPreferencesGetHandler, createNotificationPreferencesPatchHandler } from "../../app/api/notification-preferences/handler";
import { createPushTokenDeleteHandler, createPushTokenPostHandler } from "../../app/api/devices/push-token/handler";
import { createReminderPatchHandler } from "../../app/api/reminders/[id]/handler";
import { createRemindersGetHandler, createRemindersPostHandler } from "../../app/api/reminders/handler";
import { createNotificationsGetHandler } from "../../app/api/notifications/handler";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService } from "../../features/notifications/reminder-plan-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorA = { email: "a@example.test", id: "actor:a", name: "A" };

function harness() {
  const repository = createReminderPlanRepository({ store: createMemoryLiveRecordStore<Record<string, unknown>>(), workspaceId: "workspace:test" });
  const service = createReminderPlanService({ now: () => "2026-08-29T02:00:00.000Z", repository, targetAuthorizer: { async assertOwned() {} } });
  const resolveActor = async () => actorA;
  return { resolveActor, service };
}

test("reminder routes authenticate before parsing and reject unsupported fields", async () => {
  const { service } = harness();
  let parsed = false;
  const unauthorized = createRemindersPostHandler({
    resolveActor: async () => { throw new Error("unauthorized"); },
    service,
  });
  const request = new Request("http://localhost/api/reminders", {
    body: "{not-json",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  Object.defineProperty(request, "json", { value: async () => { parsed = true; throw new Error("bad json"); } });
  assert.equal((await unauthorized(request)).status, 500);
  assert.equal(parsed, false);

  const handler = createRemindersPostHandler({ resolveActor: async () => actorA, service });
  const invalid = await handler(new Request("http://localhost/api/reminders", {
    body: JSON.stringify({ actorId: "actor:b" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  assert.equal(invalid.status, 400);
});

test("reminder routes create, filter, reschedule, and cancel actor-owned plans", async () => {
  const { resolveActor, service } = harness();
  const post = createRemindersPostHandler({ resolveActor, service });
  const createdResponse = await post(new Request("http://localhost/api/reminders", {
    body: JSON.stringify({ body: "提前准备材料", channels: ["in_app", "ios_push"], createdBy: "user", deepLink: "/tasks/task%3Aone", fireAt: "2026-08-29T05:00:00.000Z", idempotencyKey: "create:one", targetId: "task:one", targetType: "task", timeZone: "Asia/Tokyo", title: "准备材料" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).data.reminder;

  const get = createRemindersGetHandler({ resolveActor, service });
  const listed = await get(new Request("http://localhost/api/reminders?targetType=task&targetId=task%3Aone"));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data.reminders.length, 1);

  const patch = createReminderPatchHandler({ resolveActor, service });
  const moved = await patch(new Request(`http://localhost/api/reminders/${encodeURIComponent(created.id)}`, {
    body: JSON.stringify({ action: "reschedule", expectedUpdatedAt: created.updatedAt, fireAt: "2026-08-29T06:00:00.000Z", idempotencyKey: "move", timeZone: "Asia/Tokyo" }),
    headers: { "content-type": "application/json" }, method: "PATCH",
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(moved.status, 200);
  const cancelled = await patch(new Request(`http://localhost/api/reminders/${encodeURIComponent(created.id)}`, {
    body: JSON.stringify({ action: "cancel", idempotencyKey: "cancel" }), headers: { "content-type": "application/json" }, method: "PATCH",
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).data.reminder.status, "cancelled");
});

test("device and preference routes keep notification state separate from reminder plans", async () => {
  const { resolveActor, service } = harness();
  const register = createPushTokenPostHandler({ resolveActor, service });
  assert.equal((await register(new Request("http://localhost/api/devices/push-token", {
    body: JSON.stringify({ deviceId: "ios:simulator", permission: "granted", platform: "ios", token: "ExponentPushToken[test]" }), headers: { "content-type": "application/json" }, method: "POST",
  }))).status, 200);

  const patchPreferences = createNotificationPreferencesPatchHandler({ resolveActor, service });
  const changed = await patchPreferences(new Request("http://localhost/api/notification-preferences", {
    body: JSON.stringify({ inAppEnabled: true, iosPushEnabled: false, lockScreenContent: "private", quietHours: { enabled: true, end: "08:00", start: "22:00", timeZone: "Asia/Tokyo" } }), headers: { "content-type": "application/json" }, method: "PATCH",
  }));
  assert.equal(changed.status, 200);
  const getPreferences = createNotificationPreferencesGetHandler({ resolveActor, service });
  assert.equal((await (await getPreferences()).json()).data.preferences.iosPushEnabled, false);

  const revoke = createPushTokenDeleteHandler({ resolveActor, service });
  assert.equal((await revoke(new Request("http://localhost/api/devices/push-token", { body: JSON.stringify({ deviceId: "ios:simulator" }), headers: { "content-type": "application/json" }, method: "DELETE" }))).status, 200);
  assert.equal((await service.notificationAvailability(actorA.id)).iosPushAvailable, false);
});

test("delivered reminder plans appear in the existing inbox projection without device tokens", async () => {
  const { resolveActor, service } = harness();
  await service.create({ actorId: actorA.id, body: "联系渡边确认会面议程", channels: ["in_app"], createdBy: "user", deepLink: "/tasks/task%3Awatanabe", fireAt: "2026-08-29T01:59:00.000Z", idempotencyKey: "inbox", targetId: "task:watanabe", targetType: "task", timeZone: "Asia/Tokyo", title: "联系渡边" });
  await service.dispatchDue({ now: "2026-08-29T02:00:00.000Z", provider: { async send() { return { ok: false, code: "NOT_USED" }; } } });

  const previousMode = process.env.ORBIT_FEATURE_MODE;
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_FEATURE_MODE = "mock";
  process.env.ORBIT_MODULE_MODE = "mock";
  try {
    const response = await createNotificationsGetHandler(resolveActor, null, service)(new Request("http://localhost/api/notifications"));
    assert.equal(response.status, 200);
    const payload = (await response.json()).data;
    assert.equal(payload.reminders.some((item: { title: string }) => item.title === "联系渡边"), true);
    assert.doesNotMatch(JSON.stringify(payload), /ExponentPushToken/u);
  } finally {
    if (previousMode === undefined) delete process.env.ORBIT_FEATURE_MODE; else process.env.ORBIT_FEATURE_MODE = previousMode;
    if (previousModuleMode === undefined) delete process.env.ORBIT_MODULE_MODE; else process.env.ORBIT_MODULE_MODE = previousModuleMode;
  }
});
