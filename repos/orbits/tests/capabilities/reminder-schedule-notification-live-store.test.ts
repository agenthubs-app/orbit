import assert from "node:assert/strict";
import test from "node:test";

import { createLiveReminderScheduleNotificationService } from "../../features/notifications/live-service";
import { createStorageReminderScheduleNotificationProvider } from "../../features/notifications/storage/reminder-notification-live-record-provider";
import {
  createReminderScheduleNotificationService,
  resolveReminderScheduleNotificationService,
} from "../../features/notifications/service-factory";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live reminder notification service reads generated notifications without delivery side effects", async () => {
  const workspaceId = "workspace:reminder-notification-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });

  const service = createLiveReminderScheduleNotificationService({
    provider: createStorageReminderScheduleNotificationProvider({
      sourceLabel: "Reminder notification memory live storage",
      store,
      workspaceId,
    }),
  });

  const listed = await service.listNotifications();

  assert.equal(listed.success, true);
  assert.equal(listed.data.state, "success");
  assert.equal(listed.data.reminders.length, 40);
  assert.equal(listed.data.notificationQueue.length, 40);
  assert.equal(
    listed.data.provenance.source,
    `live-record-store:reminder-schedule-notification:${workspaceId}`,
  );
  assert.equal(
    listed.data.provenance.sourceLabel,
    "Reminder notification memory live storage",
  );
  assert.equal(
    listed.data.provenance.privacy,
    "live-reminder-schedule-notification-preview",
  );
  assert.equal(listed.data.provenance.generationMethod, "live-store-query");
  assert.equal(listed.data.provenance.liveDatabaseReadExecuted, true);
  assert.equal(listed.data.provenance.liveDatabaseWriteExecuted, false);
  assert.equal(listed.data.provenance.pushNotificationRequested, false);
  assert.equal(listed.data.provenance.emailDeliveryRequested, false);
  assert.equal(listed.data.provenance.smsDeliveryRequested, false);
  assert.equal(listed.data.provenance.cronJobRequested, false);
  assert.equal(listed.data.provenance.notificationProviderRequested, false);
  assert.equal(listed.data.provenance.externalNetworkRequested, false);
  assert.equal(listed.data.provenance.deviceRequested, false);

  const firstReminder = listed.data.reminders[0];
  const firstQueueEntry = listed.data.notificationQueue[0];

  assert.equal(firstReminder?.reminderId, "notification_001");
  assert.equal(firstReminder?.followupTaskId, "task_001");
  assert.equal(firstReminder?.connectionId, "connection_for_contact_021");
  assert.equal(firstReminder?.contactName, "山崎 美穂");
  assert.equal(firstReminder?.organization, "Aoba Technologies");
  assert.equal(firstReminder?.title, "Review follow-up for contact_021");
  assert.equal(firstReminder?.source.generatedBy, "live-store-query");
  assert.equal(firstReminder?.generatedBy, "live-store-query");
  assert.equal(firstReminder?.pushNotificationRequested, false);
  assert.equal(firstReminder?.emailDeliveryRequested, false);
  assert.equal(firstReminder?.smsDeliveryRequested, false);
  assert.equal(firstReminder?.cronJobRequested, false);
  assert.equal(firstReminder?.notificationProviderRequested, false);
  assert.equal(firstReminder?.externalNetworkRequested, false);
  assert.equal(firstQueueEntry?.queueEntryId, "notification_001");
  assert.deepEqual(firstQueueEntry?.reminderIds, ["notification_001"]);
  assert.equal(firstQueueEntry?.channel, "in_app");
  assert.equal(firstQueueEntry?.status, "live_queued");
  assert.equal(firstQueueEntry?.pushNotificationRequested, false);
  assert.equal(firstQueueEntry?.emailDeliveryRequested, false);
  assert.equal(firstQueueEntry?.smsDeliveryRequested, false);
  assert.equal(firstQueueEntry?.cronJobRequested, false);
  assert.equal(firstQueueEntry?.notificationProviderRequested, false);
  assert.equal(firstQueueEntry?.liveDatabaseWriteExecuted, false);

  const highPriority = await service.listNotifications({
    priority: "high",
  });

  assert.equal(highPriority.success, true);
  assert.equal(
    highPriority.data.reminders.every(
      (reminder) => reminder.priority === "high",
    ),
    true,
  );
  assert.equal(
    highPriority.data.reminders.some(
      (reminder) => reminder.reminderId === "notification_001",
    ),
    true,
  );

  const dueSoon = await service.generateReminders({
    dueWithinDays: 2,
    includeGroupedLowPriority: true,
  });

  assert.equal(dueSoon.success, true);
  assert.equal(dueSoon.data.provenance.generationMethod, "live-reminder-schedule");
  assert.equal(
    dueSoon.data.reminders.every((reminder) => reminder.dueInDays <= 2),
    true,
  );
  assert.equal(
    dueSoon.data.reminders.some(
      (reminder) => reminder.reminderId === "notification_001",
    ),
    true,
  );
  assert.equal(
    dueSoon.data.notificationQueue.length,
    dueSoon.data.reminders.length,
  );
  assert.equal(dueSoon.data.groupedLowPriorityReminders.length, 0);

  const monthlyWithoutGrouped = await service.generateReminders({
    frequencies: ["monthly"],
    includeGroupedLowPriority: false,
  });

  assert.equal(monthlyWithoutGrouped.success, true);
  assert.equal(monthlyWithoutGrouped.data.state, "empty");
  assert.equal(monthlyWithoutGrouped.data.reminders.length, 0);

  const unconfigured = await createLiveReminderScheduleNotificationService({
    provider: null,
  }).listNotifications();

  assert.equal(unconfigured.success, false);
  assert.equal(
    unconfigured.error.code,
    "REMINDER_SCHEDULE_NOTIFICATION_LIVE_STORE_UNCONFIGURED",
  );
  assert.equal(
    unconfigured.error.provenance.liveDatabaseReadExecuted,
    false,
  );
});

test("reminder notification factory registers live mode and fails closed without database config", async () => {
  const previousDatabaseUrl = process.env.ORBIT_DATABASE_URL;
  const previousEventDatabaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
  const previousLiveDatabaseUrl = process.env.ORBIT_LIVE_DATABASE_URL;

  try {
    delete process.env.ORBIT_DATABASE_URL;
    delete process.env.ORBIT_EVENT_DATABASE_URL;
    delete process.env.ORBIT_LIVE_DATABASE_URL;

    const resolution = resolveReminderScheduleNotificationService("live");
    const service = createReminderScheduleNotificationService("live");
    const result = await service.listNotifications();

    assert.equal(resolution.success, true);
    assert.equal(result.success, false);

    if (!result.success) {
      assert.equal(
        result.error.code,
        "REMINDER_SCHEDULE_NOTIFICATION_LIVE_STORE_UNCONFIGURED",
      );
      assert.equal(result.error.provenance.liveDatabaseReadExecuted, false);
      assert.equal(result.error.provenance.liveDatabaseWriteExecuted, false);
    }
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.ORBIT_DATABASE_URL;
    } else {
      process.env.ORBIT_DATABASE_URL = previousDatabaseUrl;
    }

    if (previousEventDatabaseUrl === undefined) {
      delete process.env.ORBIT_EVENT_DATABASE_URL;
    } else {
      process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
    }

    if (previousLiveDatabaseUrl === undefined) {
      delete process.env.ORBIT_LIVE_DATABASE_URL;
    } else {
      process.env.ORBIT_LIVE_DATABASE_URL = previousLiveDatabaseUrl;
    }
  }
});
