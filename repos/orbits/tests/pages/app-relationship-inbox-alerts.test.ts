import assert from "node:assert/strict";
import test from "node:test";

import {
  toProactiveAlerts,
  toReminderAlerts,
} from "../../app/(app)/app/inbox/inbox-panel-view-model";
import type { ReminderScheduleNotificationPayload } from "../../features/notifications/contract";
import type { OrbitAiProactiveAgentPayload } from "../../features/orbit-ai/proactive-contract";
import { createFixtureOrbitAiProactiveAgentService } from "../../features/orbit-ai/mock-proactive-service";

test("notifications API returns reminders that never deliver", async () => {
  const { createNotificationsGetHandler } = await import(
    "../../app/api/notifications/handler"
  );
  const response = await createNotificationsGetHandler(async () => ({
    id: "actor:inbox-alert-test",
  }))(
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
  const { createNotificationsGetHandler } = await import(
    "../../app/api/notifications/handler"
  );
  const response = await createNotificationsGetHandler(async () => ({
    id: "actor:inbox-alert-test",
  }))(
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

test("reminder alerts show contact names instead of internal contact ids", () => {
  const alerts = toReminderAlerts({
    reminders: [
      {
        reminderId: "notification_001",
        title: "Review follow-up for contact_021",
        contactName: "山崎 美穂",
        organization: "Aoba Technologies",
        recommendedWindow: "Review before the scheduled in-app reminder",
        dueAt: "2026-07-10T01:00:00.000Z",
        priority: "high",
      },
    ],
  } as unknown as ReminderScheduleNotificationPayload);

  assert.equal(alerts[0]?.title, "跟进 山崎 美穂");
  assert.doesNotMatch(alerts[0]?.title ?? "", /contact_\d+/);
});

test("reminder alerts preserve a validated appointment action href", () => {
  const alerts = toReminderAlerts({
    reminders: [{
      reminderId: "notification:appointment:1:t15m:actor:a",
      title: "约谈已经结束：记录会后纪要与下一步",
      contactName: "Ren",
      organization: "Orbit",
      recommendedWindow: "now",
      dueAt: "2026-08-05T01:45:00.000Z",
      priority: "high",
      href: "/app/contacts/contact%3Aren?capture=meeting-memo&appointmentId=appointment%3A1&eventId=event%3Alaunch",
    }],
  } as unknown as ReminderScheduleNotificationPayload);
  assert.equal(alerts[0]?.href, "/app/contacts/contact%3Aren?capture=meeting-memo&appointmentId=appointment%3A1&eventId=event%3Alaunch");
});

test("proactive-turns API does not expose a fixture-backed production GET", async () => {
  const route = await import("../../app/api/ai/proactive-turns/route");
  const routeSource = await import("node:fs").then((fs) =>
    fs.readFileSync(
      new URL("../../app/api/ai/proactive-turns/route.ts", import.meta.url),
      "utf8",
    ),
  );

  assert.equal("GET" in route, false);
  assert.doesNotMatch(routeSource, /createFixtureOrbitAiProactiveAgentService/);
  assert.match(routeSource, /export async function POST/);
});

test("proactive alerts view model maps an explicit test fixture to a nudge with an action link", () => {
  const result = createFixtureOrbitAiProactiveAgentService().createProactiveTurn();

  assert.equal(result.success, true);
  if (result.success === false) return;

  const alerts = toProactiveAlerts(
    result.data as OrbitAiProactiveAgentPayload,
  );

  assert.equal(alerts.length, 1);
  assert.ok(alerts[0].body.length > 0);
  assert.ok(alerts[0].actionLabel.length > 0);
  assert.ok(alerts[0].href.startsWith("/app/"));
});
