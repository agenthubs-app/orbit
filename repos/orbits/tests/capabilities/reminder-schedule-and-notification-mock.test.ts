/**
 * 提醒调度与通知 mock 的契约测试。
 *
 * 验证 reminder schedule、notification queue 和不投递真实通知的边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as notificationsFixtures from "../../features/notifications/fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the reminder schedule and notification mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("reminder notification contract exports typed fixtures errors and mock-only provenance", async () => {
  const contract = await importProjectModule<{
    REMINDER_SCHEDULE_NOTIFICATION_ERROR_CODES: readonly string[];
    REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE: string;
    mockReminderFrequencies: readonly string[];
    mockReminderScheduleNotificationFixture: {
      state: string;
      reminders: ReadonlyArray<{
        reminderId: string;
        followupTaskId: string;
        dueAt: string;
        dueInDays: number;
        frequency: string;
        priority: string;
        groupedLowPriority: boolean;
        evidenceIds: readonly string[];
        audit: {
          sourceLabel: string;
          providerBoundary: string;
          verificationAction: string;
        };
        pushNotificationRequested: false;
        emailDeliveryRequested: false;
        smsDeliveryRequested: false;
        cronJobRequested: false;
        externalNetworkRequested: false;
      }>;
      groupedLowPriorityReminders: ReadonlyArray<{
        groupId: string;
        frequency: string;
        reminderIds: readonly string[];
        queueEntryId: string;
      }>;
      notificationQueue: ReadonlyArray<{
        queueEntryId: string;
        reminderIds: readonly string[];
        channel: string;
        status: string;
        scheduledFor: string;
        pushNotificationRequested: false;
        emailDeliveryRequested: false;
        smsDeliveryRequested: false;
        cronJobRequested: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        pushNotificationRequested: false;
        emailDeliveryRequested: false;
        smsDeliveryRequested: false;
        cronJobRequested: false;
        liveDatabaseReadExecuted: false;
        liveDatabaseWriteExecuted: false;
        externalNetworkRequested: false;
      };
    };
    mockEmptyReminderScheduleNotificationFixture: {
      state: string;
      reminders: readonly unknown[];
      notificationQueue: readonly unknown[];
      nextAction: string;
    };
    mockPendingReminderScheduleNotificationFixture: {
      state: string;
      reminders: readonly unknown[];
      notificationQueue: readonly unknown[];
      nextAction: string;
    };
  }>("features/notifications/fixtures.ts");
  const serviceInterface = readFileSync(
    join(projectRoot, "features/notifications/service.ts"),
    "utf8",
  );

  assert.match(serviceInterface, /interface ReminderScheduleNotificationService/);
  assert.match(serviceInterface, /listNotifications/);
  assert.match(serviceInterface, /generateReminders/);
  assert.deepEqual(contract.REMINDER_SCHEDULE_NOTIFICATION_ERROR_CODES, [
    "REMINDER_SCHEDULE_NOTIFICATION_REMINDER_ID_REQUIRED",
    "REMINDER_SCHEDULE_NOTIFICATION_REMINDER_NOT_FOUND",
    "REMINDER_SCHEDULE_NOTIFICATION_EMPTY",
    "REMINDER_SCHEDULE_NOTIFICATION_PENDING",
    "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED",
    "REMINDER_SCHEDULE_NOTIFICATION_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS
      .REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS
      .REMINDER_SCHEDULE_NOTIFICATION_EMPTY.recovery,
    /follow-up due dates|reminder frequency|relationship context/i,
  );

  assert.deepEqual(notificationsFixtures.mockReminderFrequencies, [
    "once",
    "daily",
    "weekly",
    "monthly",
  ]);
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.state,
    "success",
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.provenance.source,
    notificationsFixtures.REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE,
  );
  assert.deepEqual(
    notificationsFixtures.mockReminderScheduleNotificationFixture.reminders.map(
      (reminder) => reminder.frequency,
    ),
    ["once", "daily", "weekly", "monthly"],
  );
  assert.deepEqual(
    notificationsFixtures.mockReminderScheduleNotificationFixture.reminders[0].audit,
    {
      sourceLabel: "Follow-up task due date from Maya Chen",
      providerBoundary:
        "push false, email false, SMS false, cron false, persistence false",
      verificationAction: "Review reminder evidence",
    },
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.reminders[0]
      .pushNotificationRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.reminders[0]
      .emailDeliveryRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.reminders[0]
      .smsDeliveryRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.reminders[0]
      .cronJobRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture
      .groupedLowPriorityReminders[0].reminderIds.length,
    2,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.notificationQueue[0].status,
    "mock_queued",
  );
  assert.deepEqual(
    notificationsFixtures.mockReminderScheduleNotificationFixture.notificationQueue.map(
      (entry) => entry.channel,
    ),
    ["push", "email", "sms", "in_app"],
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.provenance
      .pushNotificationRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.provenance
      .emailDeliveryRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.provenance
      .smsDeliveryRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockReminderScheduleNotificationFixture.provenance.cronJobRequested,
    false,
  );
  assert.equal(
    notificationsFixtures.mockEmptyReminderScheduleNotificationFixture.state,
    "empty",
  );
  assert.match(
    notificationsFixtures.mockEmptyReminderScheduleNotificationFixture.nextAction,
    /follow-up due date|reminder frequency|relationship/i,
  );
  assert.equal(
    notificationsFixtures.mockPendingReminderScheduleNotificationFixture.state,
    "pending",
  );
});

test("mock reminder notification service is deterministic and never calls live providers", async () => {
  const serviceModule = await importProjectModule<{
    createMockReminderScheduleNotificationService: () => {
      listNotifications: (input?: {
        scenario?: string | null;
        frequency?: string | null;
        priority?: string | null;
        limit?: number | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          reminders: ReadonlyArray<{
            reminderId: string;
            frequency: string;
            priority: string;
            groupedLowPriority: boolean;
            pushNotificationRequested: false;
            emailDeliveryRequested: false;
            smsDeliveryRequested: false;
            cronJobRequested: false;
          }>;
          notificationQueue: ReadonlyArray<{ channel: string }>;
        };
        error?: { code: string; appCode: string };
      };
      generateReminders: (input?: {
        scenario?: string | null;
        frequencies?: readonly string[] | null;
        includeGroupedLowPriority?: boolean | null;
        dueWithinDays?: number | null;
        limit?: number | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          reminders: ReadonlyArray<{
            reminderId: string;
            frequency: string;
            dueInDays: number;
            groupedLowPriority: boolean;
          }>;
          groupedLowPriorityReminders: ReadonlyArray<{
            reminderIds: readonly string[];
          }>;
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/notifications/mock-service.ts");
  const service = serviceModule.createMockReminderScheduleNotificationService();
  const weeklyInput = {
    frequencies: ["weekly"],
    includeGroupedLowPriority: true,
  };
  const listed = service.listNotifications();
  const generated = service.generateReminders(weeklyInput);
  const dueSoon = service.generateReminders({ dueWithinDays: 2 });
  const empty = service.listNotifications({ scenario: "empty" });
  const pending = service.generateReminders({ scenario: "pending" });
  const failure = service.listNotifications({ scenario: "failure" });

  assert.deepEqual(service.listNotifications(), service.listNotifications());
  assert.deepEqual(
    service.generateReminders(weeklyInput),
    service.generateReminders(weeklyInput),
  );
  assert.deepEqual(
    service.listNotifications({ scenario: "unknown" }),
    service.listNotifications(),
  );
  assert.equal(listed.success, true);
  assert.equal(listed.data?.state, "success");
  assert.equal(listed.data?.reminders.length, 4);
  assert.equal(listed.data?.notificationQueue.length, 4);
  assert.equal(listed.data?.reminders[0].pushNotificationRequested, false);
  assert.equal(listed.data?.reminders[0].emailDeliveryRequested, false);
  assert.equal(listed.data?.reminders[0].smsDeliveryRequested, false);
  assert.equal(listed.data?.reminders[0].cronJobRequested, false);
  assert.equal(generated.success, true);
  assert.deepEqual(
    generated.data?.reminders.map((reminder) => reminder.frequency),
    ["weekly"],
  );
  assert.equal(
    generated.data?.groupedLowPriorityReminders[0].reminderIds.length,
    1,
  );
  assert.equal(dueSoon.success, true);
  assert.deepEqual(
    dueSoon.data?.reminders.map((reminder) => reminder.dueInDays),
    [0, 1],
  );
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.reminders.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(
    failure.error?.code,
    "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED",
  );

  for (const filePath of [
    "features/notifications/contract.ts",
    "features/notifications/fixtures.ts",
    "features/notifications/service.ts",
    "features/notifications/mock-service.ts",
    "app/api/notifications/route.ts",
    "app/api/notifications/reminders/generate/route.ts",
    "features/notifications/reminder-schedule-and-notification-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(
      source,
      /Notification\.requestPermission|serviceWorker|PushManager/i,
    );
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /setInterval|setTimeout|cron\.schedule/);
    assert.doesNotMatch(source, /OpenAI|Anthropic|Pinecone|Weaviate|Qdrant/);
  }
});

test("reminder notification API routes return stable envelopes with empty and failure paths", async () => {
  const notificationsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/notifications/route.ts");
  const generateRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/notifications/reminders/generate/route.ts");
  const fixtures = await importProjectModule<{
    mockEmptyReminderScheduleNotificationFixture: unknown;
  }>("features/notifications/fixtures.ts");

  const notificationsResponse = await notificationsRoute.GET(
    new Request("https://orbit.local/api/notifications", {
      method: "GET",
    }),
  );
  const generateResponse = await generateRoute.POST(
    new Request("https://orbit.local/api/notifications/reminders/generate", {
      body: JSON.stringify({
        frequencies: ["once", "weekly"],
        includeGroupedLowPriority: true,
      }),
      method: "POST",
    }),
  );
  const emptyResponse = await notificationsRoute.GET(
    new Request("https://orbit.local/api/notifications?scenario=empty", {
      method: "GET",
    }),
  );
  const failureResponse = await notificationsRoute.GET(
    new Request("https://orbit.local/api/notifications?scenario=failure", {
      method: "GET",
    }),
  );

  assert.equal(notificationsResponse.status, 200);
  assert.equal(notificationsResponse.headers.get("cache-control"), "no-store");
  assert.equal(
    notificationsResponse.headers.get("x-orbit-feature-mode"),
    "mock",
  );
  assert.equal(generateResponse.status, 200);
  assert.equal(generateResponse.headers.get("cache-control"), "no-store");

  const notificationsEnvelope = (await notificationsResponse.json()) as {
    success: true;
    data: {
      state: string;
      reminders: ReadonlyArray<{
        frequency: string;
        pushNotificationRequested: false;
        emailDeliveryRequested: false;
        smsDeliveryRequested: false;
        cronJobRequested: false;
      }>;
      notificationQueue: ReadonlyArray<{ status: string }>;
      provenance: {
        pushNotificationRequested: false;
        emailDeliveryRequested: false;
        smsDeliveryRequested: false;
        cronJobRequested: false;
      };
    };
  };
  const generateEnvelope = (await generateResponse.json()) as {
    success: true;
    data: {
      state: string;
      reminders: ReadonlyArray<{ frequency: string }>;
      groupedLowPriorityReminders: ReadonlyArray<{
        reminderIds: readonly string[];
      }>;
    };
  };

  assert.equal(notificationsEnvelope.success, true);
  assert.equal(notificationsEnvelope.data.state, "success");
  assert.equal(notificationsEnvelope.data.reminders.length, 4);
  assert.equal(
    notificationsEnvelope.data.reminders[0].pushNotificationRequested,
    false,
  );
  assert.equal(
    notificationsEnvelope.data.reminders[0].emailDeliveryRequested,
    false,
  );
  assert.equal(
    notificationsEnvelope.data.reminders[0].smsDeliveryRequested,
    false,
  );
  assert.equal(notificationsEnvelope.data.reminders[0].cronJobRequested, false);
  assert.equal(notificationsEnvelope.data.notificationQueue[0].status, "mock_queued");
  assert.equal(
    notificationsEnvelope.data.provenance.pushNotificationRequested,
    false,
  );
  assert.equal(
    notificationsEnvelope.data.provenance.emailDeliveryRequested,
    false,
  );
  assert.equal(
    notificationsEnvelope.data.provenance.smsDeliveryRequested,
    false,
  );
  assert.equal(notificationsEnvelope.data.provenance.cronJobRequested, false);
  assert.equal(generateEnvelope.success, true);
  assert.equal(generateEnvelope.data.state, "success");
  assert.deepEqual(
    generateEnvelope.data.reminders.map((reminder) => reminder.frequency),
    ["once", "weekly"],
  );
  assert.equal(
    generateEnvelope.data.groupedLowPriorityReminders[0].reminderIds.length,
    1,
  );
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyReminderScheduleNotificationFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock reminder schedule and notification boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance: "Mock reminder schedule controlled failure",
        reminderScheduleNotificationErrorCode:
          "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED",
        service: "reminder-schedule-notification",
      },
    },
  });
});

test("reminder notification dev probe manifest exercises declared API paths", async () => {
  const debugView = await importProjectModule<{
    REMINDER_SCHEDULE_NOTIFICATION_API_PROBES: ReadonlyArray<{
      label: string;
      method: "GET" | "POST";
      path: string;
      expectedStatus: number;
    }>;
  }>(
    "features/notifications/reminder-schedule-and-notification-mock/debug-view.tsx",
  );
  const notificationsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/notifications/route.ts");
  const generateRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/notifications/reminders/generate/route.ts");

  assert.deepEqual(
    debugView.REMINDER_SCHEDULE_NOTIFICATION_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["GET", "/api/notifications", 200],
      ["POST", "/api/notifications/reminders/generate", 200],
      ["GET", "/api/notifications?scenario=empty", 200],
      ["GET", "/api/notifications?scenario=pending", 200],
      ["GET", "/api/notifications?scenario=failure", 503],
    ],
  );

  for (const probe of debugView.REMINDER_SCHEDULE_NOTIFICATION_API_PROBES) {
    const response =
      probe.method === "GET"
        ? await notificationsRoute.GET(
            new Request(`https://orbit.local${probe.path}`, {
              method: probe.method,
            }),
          )
        : await generateRoute.POST(
            new Request(`https://orbit.local${probe.path}`, {
              body: JSON.stringify({ frequencies: ["once"] }),
              method: probe.method,
            }),
          );
    const envelope = (await response.json()) as {
      success: boolean;
      data?: { state?: string };
      error?: {
        context?: { reminderScheduleNotificationErrorCode?: string };
      };
    };

    assert.equal(response.status, probe.expectedStatus, probe.label);
    assert.equal(typeof envelope.success, "boolean", probe.label);

    if (probe.path.includes("scenario=pending")) {
      assert.equal(envelope.success, true);
      assert.equal(envelope.data?.state, "pending");
    }

    if (probe.path.includes("scenario=failure")) {
      assert.equal(envelope.success, false);
      assert.equal(
        envelope.error?.context?.reminderScheduleNotificationErrorCode,
        "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED",
      );
    }
  }
});

test("reminder notification debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    REMINDER_SCHEDULE_NOTIFICATION_MOCK_SLUG: string;
    ReminderScheduleNotificationMockDemo: () => React.ReactElement;
  }>(
    "features/notifications/reminder-schedule-and-notification-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.ReminderScheduleNotificationMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/notifications/reminder-schedule-and-notification-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.REMINDER_SCHEDULE_NOTIFICATION_MOCK_SLUG,
    "reminder-schedule-and-notification-mock",
  );
  assert.match(pageSource, /REMINDER_SCHEDULE_NOTIFICATION_MOCK_SLUG/);
  assert.match(pageSource, /ReminderScheduleNotificationMockDemo/);

  assert.match(html, /Reminder schedule and notification mock/);
  assert.match(
    html,
    /aria-label="Reminder schedule notification operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="Reminder schedule notification state matrix"/);
  assert.match(html, /Success: 4 reminders/);
  assert.match(html, /Empty: no due follow-up reminders/);
  assert.match(html, /Pending: notification review guard/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /Once/);
  assert.match(html, /Daily/);
  assert.match(html, /Weekly/);
  assert.match(html, /Monthly/);
  assert.match(
    html,
    /aria-label="Audit reminder reminder:followup:maya-deck"/,
  );
  assert.match(html, /Review Maya Chen evidence/);
  assert.match(html, /Review Diego Rivera evidence/);
  assert.match(html, /Review Amina Okafor evidence/);
  assert.match(html, /Review Kenji Sato evidence/);
  assert.doesNotMatch(html, />Review reminder evidence<\/button>/);
  assert.match(html, /Source: Follow-up task due date from Maya Chen/);
  assert.match(
    html,
    /Provider boundary: push false, email false, SMS false, cron false, persistence false/,
  );
  assert.match(html, /evidence:notification:maya-deck/);
  assert.match(html, /Grouped low-priority reminders/);
  assert.match(html, /push false/);
  assert.match(html, /email false/);
  assert.match(html, /SMS false/);
  assert.match(html, /cron false/);
  assert.match(html, /REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED/);
  assert.match(html, /GET \/api\/notifications/);
  assert.match(html, /POST \/api\/notifications\/reminders\/generate/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);

  for (const requiredText of [
    "Live service files",
    "ORBIT_MODULE_MODE=live",
    "push notification provider",
    "email delivery provider",
    "SMS delivery provider",
    "cron scheduler",
    "required env vars",
    "source evidence",
    "provenance",
    "privacy",
    "replacement tests",
  ]) {
    assert.match(liveDoc, new RegExp(requiredText, "i"));
  }
});
