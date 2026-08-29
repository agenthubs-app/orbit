import assert from "node:assert/strict";
import test from "node:test";

import type { ReminderPlanContract } from "../src/api/contract/reminders";
import type { LocalNotificationRequest } from "../src/notifications/notification-model";
import { syncLocalReminderNotifications } from "../src/notifications/notification-sync";

function plan(id: string, fireAt: string, status: ReminderPlanContract["status"] = "scheduled"): ReminderPlanContract {
  return {
    body: `提醒 ${id}`,
    channels: ["in_app", "ios_push"],
    createdAt: "2026-08-29T00:00:00.000Z",
    createdBy: "user",
    deepLink: `/tasks/${encodeURIComponent(id)}`,
    fireAt,
    id,
    status,
    targetId: id,
    targetType: "task",
    timeZone: "Asia/Tokyo",
    title: `待办 ${id}`,
    updatedAt: "2026-08-29T00:00:00.000Z",
  };
}

test("local notification sync replaces only Orbit-managed schedules", async () => {
  const cancelled: string[] = [];
  const scheduled: LocalNotificationRequest[] = [];
  const result = await syncLocalReminderNotifications({
    adapter: {
      async cancelScheduledNotificationAsync(id) { cancelled.push(id); },
      async getAllScheduledNotificationsAsync() {
        return [
          { content: { data: { orbitReminderPlanId: "old" } }, identifier: "orbit-old" },
          { content: { data: { source: "calendar" } }, identifier: "personal-calendar" },
        ];
      },
      async getPermissionsAsync() { return { granted: true, iosStatus: 2, status: "granted" }; },
      async scheduleNotificationAsync(request) {
        scheduled.push(request);
        return `native:${scheduled.length}`;
      },
    },
    now: "2026-08-29T00:00:00.000Z",
    plans: [
      plan("task:future", "2026-08-30T00:00:00.000Z"),
      plan("task:past", "2026-08-28T00:00:00.000Z"),
      plan("task:cancelled", "2026-08-30T00:00:00.000Z", "cancelled"),
    ],
  });

  assert.deepEqual(cancelled, ["orbit-old"]);
  assert.equal(scheduled.length, 1);
  assert.deepEqual(scheduled[0]?.content, {
    body: "提醒 task:future",
    data: {
      deepLink: "/tasks/task%3Afuture",
      notificationId: "task:future",
      orbitReminderPlanId: "task:future",
    },
    sound: "default",
    title: "待办 task:future",
  });
  assert.deepEqual(result, { cancelled: 1, permission: "granted", scheduled: 1 });
});

test("local notification sync does not mutate schedules without permission", async () => {
  let touched = false;
  const result = await syncLocalReminderNotifications({
    adapter: {
      async cancelScheduledNotificationAsync() { touched = true; },
      async getAllScheduledNotificationsAsync() { touched = true; return []; },
      async getPermissionsAsync() { return { granted: false, iosStatus: 1, status: "denied" }; },
      async scheduleNotificationAsync() { touched = true; return "never"; },
    },
    now: "2026-08-29T00:00:00.000Z",
    plans: [plan("task:future", "2026-08-30T00:00:00.000Z")],
  });

  assert.equal(touched, false);
  assert.deepEqual(result, { cancelled: 0, permission: "denied", scheduled: 0 });
});
