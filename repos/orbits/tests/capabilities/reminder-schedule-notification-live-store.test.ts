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
    const records = await store.listRecords({ limit: "unbounded", collectionName, workspaceId });
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

  // Sprint 0086: the generated fixtures only contain "复核与 X 的下一步" records —
  // no object, no reason, no verifiable target. The notification design keeps
  // them out of the inbox instead of surfacing them as "来源已不可用", so the seed
  // no longer writes them and this read has nothing to show. The read itself must
  // still be a clean, side-effect-free live-store query.
  assert.equal(listed.success, true);
  assert.equal(listed.data.state, "empty");
  assert.deepEqual(listed.data.reminders, []);
  assert.deepEqual(listed.data.notificationQueue, []);
  assert.ok(
    defaultMockFixtures.notifications.every((notification) => /^复核与.+的下一步$/u.test(notification.title)),
    "if a generated notification ever meets the content threshold this test must cover it as a visible reminder",
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
});

test("an internal appointment href without a provable source is unavailable", async () => {
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
  assert.equal(result.data.reminders[0]?.href, "");
  assert.equal(result.data.reminders[0]?.title, "来源已不可用");
  assert.deepEqual(result.data.reminders[0]?.evidenceIds, []);
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
