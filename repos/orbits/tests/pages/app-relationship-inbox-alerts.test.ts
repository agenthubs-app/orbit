import assert from "node:assert/strict";
import test from "node:test";

import {
  toProactiveAlerts,
  toReminderAlerts,
} from "../../app/(app)/app/inbox/inbox-panel-view-model";
import type { ReminderScheduleNotificationPayload } from "../../features/notifications/contract";
import type { OrbitAiProactiveAgentPayload } from "../../features/orbit-ai/proactive-contract";

test("notifications API returns reminders that never deliver", async () => {
  const route = await import("../../app/api/notifications/route");
  const response = await route.GET(
    new Request("https://orbit.local/api/notifications"),
  );
  const body = (await response.json()) as {
    success: boolean;
    data: ReminderScheduleNotificationPayload;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.reminders.length > 0);
  // 提醒边界：mock 从不投递。
  for (const reminder of body.data.reminders) {
    assert.equal(reminder.pushNotificationRequested, false);
    assert.equal(reminder.emailDeliveryRequested, false);
    assert.equal(reminder.notificationProviderRequested, false);
  }
});

test("reminder alerts view model maps reminders to navigable alert rows", async () => {
  const route = await import("../../app/api/notifications/route");
  const response = await route.GET(
    new Request("https://orbit.local/api/notifications"),
  );
  const body = (await response.json()) as {
    data: ReminderScheduleNotificationPayload;
  };

  const alerts = toReminderAlerts(body.data);

  assert.ok(alerts.length > 0);
  const first = alerts[0];
  assert.ok(first.title.length > 0);
  assert.ok(first.dueLabel.length > 0);
  assert.equal(first.href, "/app/followups");
  assert.ok(["high", "normal", "low"].includes(first.priority));
});

test("proactive-turns API returns an in-app nudge with no external side effect", async () => {
  const route = await import("../../app/api/ai/proactive-turns/route");
  const response = await route.GET();
  const body = (await response.json()) as {
    success: boolean;
    data: OrbitAiProactiveAgentPayload;
  };

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.ok(body.data.message.content.length > 0);
  // 安全账本：主动提示不投递、不联网、不调外部 provider。
  assert.equal(body.data.provenance.safety.notificationDelivered, false);
  assert.equal(body.data.provenance.safety.externalNetworkRequested, false);
  assert.equal(body.data.provenance.safety.externalSideEffectsExecuted, false);
});

test("proactive alerts view model maps a turn to a nudge with an action link", async () => {
  const route = await import("../../app/api/ai/proactive-turns/route");
  const response = await route.GET();
  const body = (await response.json()) as {
    data: OrbitAiProactiveAgentPayload;
  };

  const alerts = toProactiveAlerts(body.data);

  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].body.length > 0);
  assert.ok(alerts[0].actionLabel.length > 0);
  assert.ok(alerts[0].href.startsWith("/app/"));
});
