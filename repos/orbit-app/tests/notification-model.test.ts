import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationResponseGuard,
  localNotificationRequest,
  notificationHrefFromDeepLink,
  notificationPermissionFromNative,
} from "../src/notifications/notification-model";

test("notification deep links are restricted to owned in-app destinations", () => {
  assert.equal(notificationHrefFromDeepLink("/tasks/task%3Aone"), "/tasks/task%3Aone");
  assert.equal(notificationHrefFromDeepLink("orbit://tasks/task%3Aone"), "/tasks/task%3Aone");
  assert.equal(notificationHrefFromDeepLink("/schedule"), "/schedule");
  assert.equal(notificationHrefFromDeepLink("/inbox/notification%3Aone"), "/inbox/notification%3Aone");
  assert.equal(notificationHrefFromDeepLink("https://example.com/tasks/one"), null);
  assert.equal(notificationHrefFromDeepLink("/admin"), null);
  assert.equal(notificationHrefFromDeepLink("/account/login"), null);
  assert.equal(notificationHrefFromDeepLink("/tasks/../../admin"), null);
});

test("notification responses are handled once per notification and action", () => {
  const guard = createNotificationResponseGuard(2);
  assert.equal(guard.shouldHandle("notification:one", "default"), true);
  assert.equal(guard.shouldHandle("notification:one", "default"), false);
  assert.equal(guard.shouldHandle("notification:one", "complete"), true);
  assert.equal(guard.shouldHandle("notification:two", "default"), true);
  assert.equal(guard.shouldHandle("notification:one", "default"), true);
});

test("native notification permissions map to the canonical backend states", () => {
  assert.equal(notificationPermissionFromNative({ granted: true, iosStatus: 2, status: "granted" }), "granted");
  assert.equal(notificationPermissionFromNative({ granted: false, iosStatus: 3, status: "granted" }), "provisional");
  assert.equal(notificationPermissionFromNative({ granted: false, iosStatus: 1, status: "denied" }), "denied");
  assert.equal(notificationPermissionFromNative({ granted: false, iosStatus: 0, status: "undetermined" }), "undetermined");
});

test("only future scheduled reminder plans become local notification requests", () => {
  const request = localNotificationRequest({
    body: "确认明天客户访谈的提纲",
    deepLink: "/tasks/task%3Ainterview",
    fireAt: "2026-08-30T00:00:00.000Z",
    id: "reminder:interview",
    status: "scheduled",
    title: "客户访谈准备",
  }, "2026-08-29T00:00:00.000Z");

  assert.deepEqual(request, {
    content: {
      body: "确认明天客户访谈的提纲",
      data: {
        deepLink: "/tasks/task%3Ainterview",
        notificationId: "reminder:interview",
      },
      sound: "default",
      title: "客户访谈准备",
    },
    triggerAt: "2026-08-30T00:00:00.000Z",
  });
  assert.equal(localNotificationRequest({ ...requestPlan, status: "cancelled" }, "2026-08-29T00:00:00.000Z"), null);
  assert.equal(localNotificationRequest(requestPlan, "2026-08-31T00:00:00.000Z"), null);
});

const requestPlan = {
  body: "准备资料",
  deepLink: "/tasks/task%3Aone",
  fireAt: "2026-08-30T00:00:00.000Z",
  id: "reminder:one",
  status: "scheduled" as const,
  title: "准备资料",
};
