import assert from "node:assert/strict";
import test from "node:test";

import { createLiveReminderScheduleNotificationService } from "../../features/notifications/live-service";
import { createStorageReminderScheduleNotificationProvider } from "../../features/notifications/storage/reminder-notification-live-record-provider";
import {
  createReminderScheduleNotificationService,
  resolveReminderScheduleNotificationService,
} from "../../features/notifications/service-factory";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("live reminder notification service reads generated notifications without delivery side effects", async () => {
  const actorId = "actor:reminder-owner";
  const workspaceId = "workspace:reminder-notification-live-store-test";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    store,
    workspaceId,
  });
  for (const collectionName of [
    "notifications",
    "tasks",
    "contacts",
    "connections",
    "evidence",
  ]) {
    const records = await store.listRecords({ collectionName, workspaceId });
    for (const record of records) {
      await store.upsertRecord({ ...record, userId: actorId });
    }
  }

  const service = createLiveReminderScheduleNotificationService({
    provider: createStorageReminderScheduleNotificationProvider({
      sourceLabel: "Reminder notification memory live storage",
      store,
      workspaceId,
    }),
  });

  const listed = await service.listNotifications({ actorId });
  const expectedNotification = defaultMockFixtures.notifications[0];
  const expectedTask = defaultMockFixtures.tasks.find(
    (task) => task.title === expectedNotification.title,
  );
  const expectedConnection = defaultMockFixtures.connections.find(
    (connection) => connection.id === expectedTask?.connectionId,
  );
  const expectedContact = defaultMockFixtures.contacts.find(
    (contact) => contact.id === expectedTask?.contactId,
  );
  assert.ok(expectedTask);
  assert.ok(expectedConnection);
  assert.ok(expectedContact);

  assert.equal(listed.success, true);
  assert.equal(listed.data.state, "success");
  assert.equal(
    listed.data.reminders.length,
    defaultMockFixtures.notifications.length,
  );
  assert.equal(
    listed.data.notificationQueue.length,
    defaultMockFixtures.notifications.length,
  );
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

  assert.equal(firstReminder?.reminderId, expectedNotification.id);
  assert.equal(firstReminder?.followupTaskId, expectedTask.id);
  assert.equal(firstReminder?.connectionId, expectedConnection.id);
  assert.equal(firstReminder?.contactName, expectedContact.displayName);
  assert.equal(firstReminder?.organization, expectedContact.organization);
  assert.equal(firstReminder?.title, expectedTask.title);
  assert.equal(firstReminder?.source.generatedBy, "live-store-query");
  assert.equal(firstReminder?.generatedBy, "live-store-query");
  assert.equal(firstReminder?.pushNotificationRequested, false);
  assert.equal(firstReminder?.emailDeliveryRequested, false);
  assert.equal(firstReminder?.smsDeliveryRequested, false);
  assert.equal(firstReminder?.cronJobRequested, false);
  assert.equal(firstReminder?.notificationProviderRequested, false);
  assert.equal(firstReminder?.externalNetworkRequested, false);
  assert.equal(firstQueueEntry?.queueEntryId, expectedNotification.id);
  assert.deepEqual(firstQueueEntry?.reminderIds, [expectedNotification.id]);
  assert.equal(firstQueueEntry?.channel, "in_app");
  assert.equal(firstQueueEntry?.status, "live_queued");
  assert.equal(firstQueueEntry?.pushNotificationRequested, false);
  assert.equal(firstQueueEntry?.emailDeliveryRequested, false);
  assert.equal(firstQueueEntry?.smsDeliveryRequested, false);
  assert.equal(firstQueueEntry?.cronJobRequested, false);
  assert.equal(firstQueueEntry?.notificationProviderRequested, false);
  assert.equal(firstQueueEntry?.liveDatabaseWriteExecuted, false);

  const highPriority = await service.listNotifications({
    actorId,
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
      (reminder) => reminder.reminderId === expectedNotification.id,
    ),
    true,
  );

  const dueSoon = await service.generateReminders({
    actorId,
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
    actorId,
    frequencies: ["monthly"],
    includeGroupedLowPriority: false,
  });

  assert.equal(monthlyWithoutGrouped.success, true);
  assert.equal(monthlyWithoutGrouped.data.state, "empty");
  assert.equal(monthlyWithoutGrouped.data.reminders.length, 0);

  const otherActor = await service.listNotifications({
    actorId: "actor:other",
  });
  assert.equal(otherActor.success, true);
  assert.equal(otherActor.data.state, "empty");
  assert.equal(otherActor.data.reminders.length, 0);

  const missingActor = await service.listNotifications();
  assert.equal(missingActor.success, false);
  assert.equal(
    missingActor.error.code,
    "REMINDER_SCHEDULE_NOTIFICATION_ACTOR_REQUIRED",
  );
  assert.equal(missingActor.error.provenance.liveDatabaseReadExecuted, false);

  const unconfigured = await createLiveReminderScheduleNotificationService({
    provider: null,
  }).listNotifications({ actorId });

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

test("live notification pipeline preserves an internal appointment action href", async () => {
  const actorId = "actor:appointment-reminder";
  const workspaceId = "workspace:appointment-reminder-href";
  const href = "/app/contacts/contact%3Aren?capture=meeting-memo&appointmentId=appointment%3A1&eventId=event%3Alaunch";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await store.upsertRecord({
    workspaceId,
    collectionName: "notifications",
    recordId: "notification:appointment:1:t15m:actor",
    userId: actorId,
    sourceType: "agent_action",
    sourceId: "notification:appointment:1:t15m:actor",
    sourceLabel: "Appointment reminder",
    evidenceIds: ["appointment:1:revision:1"],
    targetType: "contact",
    targetId: "contact:ren",
    occurredAt: "2026-08-05T01:45:00.000Z",
    lifecycleState: "active",
    searchText: "meeting memo",
    payload: {
      id: "notification:appointment:1:t15m:actor",
      channel: "in_app",
      title: "约谈已经结束：记录会后纪要与下一步",
      body: "约谈已经结束：记录会后纪要与下一步",
      status: "pending",
      scheduledFor: "2026-08-05T01:45:00.000Z",
      actionHref: href,
      source: { type: "agent_action", id: "notification:appointment:1:t15m:actor", label: "Appointment reminder" },
      evidenceIds: ["appointment:1:revision:1"],
      createdAt: "2026-08-05T01:31:00.000Z",
    },
    createdAt: "2026-08-05T01:31:00.000Z",
    updatedAt: "2026-08-05T01:31:00.000Z",
  });
  const result = await createLiveReminderScheduleNotificationService({
    provider: createStorageReminderScheduleNotificationProvider({ store, workspaceId }),
  }).listNotifications({ actorId });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.reminders[0]?.href, href);
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
    const result = await service.listNotifications({
      actorId: "actor:factory-test",
    });

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
