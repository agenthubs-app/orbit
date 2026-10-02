// W0044（RN-02）：跟进与提醒的「现在」显式注入，到期天数按东京日历日、逾期为负。
import assert from "node:assert/strict";
import test from "node:test";

import { createLiveFollowupTaskGenerationService } from "../../features/followups/live-service";
import { createStorageFollowupTaskProvider } from "../../features/followups/storage/followup-live-record-provider";
import {
  followupDaysUntil,
  followupPriorityFor,
} from "../../features/followups/task-generation-projection";
import {
  createLiveReminderScheduleNotificationService,
  reminderDaysUntil,
  reminderFrequencyFor,
  reminderPriorityFor,
} from "../../features/notifications/live-service";
import { createStorageReminderScheduleNotificationProvider } from "../../features/notifications/storage/reminder-notification-live-record-provider";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { tokyoCalendarDaysUntil } from "../../shared/utils/tokyo-calendar-days";

type AnyRecord = LiveRecord<Record<string, unknown>>;

// 8/25 09:00 JST
const NOW = "2026-08-25T00:00:00.000Z";

test("SC-02 days until due are Tokyo calendar-day differences and may be negative", () => {
  const cases: readonly { dueAt: string | undefined; now: string; expected: number }[] = [
    // 截止 7/29 10:00 JST、now 8/25 09:00 JST
    { dueAt: "2026-07-29T01:00:00.000Z", now: NOW, expected: -27 },
    // 截止今天 20:00、now 今天 09:00 → 今天
    { dueAt: "2026-08-25T11:00:00.000Z", now: NOW, expected: 0 },
    // 截止昨天 23:00、now 今天 09:00 → 逾期 1 天
    { dueAt: "2026-08-24T14:00:00.000Z", now: NOW, expected: -1 },
    // 截止明天 00:30 JST → 明天（不是按 24 小时向上取整）
    { dueAt: "2026-08-25T15:30:00.000Z", now: NOW, expected: 1 },
    // 东京跨日：UTC 同一天、东京已是次日
    { dueAt: "2026-08-25T16:00:00.000Z", now: "2026-08-25T14:59:00.000Z", expected: 1 },
  ];

  for (const { dueAt, now, expected } of cases) {
    assert.equal(followupDaysUntil(dueAt, now), expected, `followup ${dueAt} @ ${now}`);
    assert.equal(reminderDaysUntil(dueAt ?? "", now), expected, `reminder ${dueAt} @ ${now}`);
    assert.equal(tokyoCalendarDaysUntil(dueAt ?? "", now), expected);
  }

  // 无 dueAt／非法时间：行为同改前（兜底 7）
  assert.equal(followupDaysUntil(undefined, NOW), 7);
  assert.equal(followupDaysUntil("not-a-date", NOW), 7);
  assert.equal(followupDaysUntil("2026-08-26T00:00:00.000Z", "not-a-date"), 7);
  assert.equal(reminderDaysUntil("not-a-date", NOW), 7);
  assert.equal(tokyoCalendarDaysUntil("not-a-date", NOW), null);
});

test("SC-02 overdue keeps existing priority and frequency enums", () => {
  assert.equal(followupPriorityFor(-27), "today");
  assert.equal(followupPriorityFor(0), "today");
  assert.equal(followupPriorityFor(1), "today");
  assert.equal(followupPriorityFor(2), "this_week");
  assert.equal(followupPriorityFor(8), "nurture");
  assert.equal(reminderPriorityFor(-3), "high");
  assert.equal(reminderFrequencyFor(-3), "once");
  assert.equal(reminderPriorityFor(5), "normal");
  assert.equal(reminderFrequencyFor(5), "daily");
});

async function seededFollowupRecords(actorId: string, workspaceId: string): Promise<AnyRecord[]> {
  const fixtures = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-01T19:00:00.000Z",
    store: fixtures,
    workspaceId,
  });

  return (await fixtures.listRecords({ limit: "unbounded", workspaceId, includeDeleted: true }))
    .filter((record) => ["tasks", "contacts", "connections", "evidence"].includes(record.collectionName))
    .map((record) => ({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } }));
}

function shiftUpdatedAt(records: readonly AnyRecord[], days: number): AnyRecord[] {
  return records.map((record) => ({
    ...record,
    updatedAt: new Date(new Date(record.updatedAt).getTime() + days * 86_400_000).toISOString(),
  }));
}

function followupServiceFor(records: readonly AnyRecord[], workspaceId: string, now: () => Date) {
  return createLiveFollowupTaskGenerationService({
    now,
    provider: createStorageFollowupTaskProvider({
      sourceLabel: "Followup clock test storage",
      store: createMemoryLiveRecordStore<Record<string, unknown>>(records),
      workspaceId,
    }),
  });
}

test("SC-01 followup tasks depend on the injected now, not on record updatedAt", async () => {
  const actorId = "actor:followup-clock";
  const workspaceId = "workspace:followup-clock";
  const records = await seededFollowupRecords(actorId, workspaceId);
  const later = shiftUpdatedAt(records, 40);
  let nowCalls = 0;
  const now = () => {
    nowCalls += 1;
    return new Date(NOW);
  };

  const first = await followupServiceFor(records, workspaceId, now).listTasks({ actorId });
  assert.equal(nowCalls, 1, "listTasks reads the clock exactly once");
  const second = await followupServiceFor(later, workspaceId, now).listTasks({ actorId });
  assert.equal(nowCalls, 2);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  if (!first.success || !second.success) return;

  assert.ok(first.data.tasks.length > 1);
  assert.deepEqual(second.data.tasks, first.data.tasks);
  assert.deepEqual(second.data.triggers, first.data.triggers);
  assert.equal(first.data.provenance.collectedAt, NOW);
  assert.ok(first.data.triggers.every((trigger) => trigger.occurredAt === NOW));

  // task_001 截止 2026-07-29T09:00Z（7/29 18:00 JST），now 8/25 09:00 JST → 逾期 27 天，排在最前
  const task001 = first.data.tasks.find((task) => task.taskId === "task_001");
  assert.equal(task001?.dueInDays, -27);
  assert.equal(task001?.priority, "today");
  for (let index = 1; index < first.data.tasks.length; index += 1) {
    assert.ok(first.data.tasks[index - 1]!.dueInDays <= first.data.tasks[index]!.dueInDays);
  }
  assert.ok(
    first.data.tasks.findIndex((task) => task.dueInDays < 0) <
      first.data.tasks.findIndex((task) => task.dueInDays >= 0),
    "overdue tasks sort before today and later",
  );

  // generateTasks 同样只取一次时钟
  const generated = await followupServiceFor(records, workspaceId, now).generateTasks({ actorId });
  assert.equal(nowCalls, 3);
  assert.equal(generated.success, true);
});

test("SC-01 moving the injected now one day later lowers every dated followup by exactly one", async () => {
  const actorId = "actor:followup-clock-shift";
  const workspaceId = "workspace:followup-clock-shift";
  const records = await seededFollowupRecords(actorId, workspaceId);
  const today = await followupServiceFor(records, workspaceId, () => new Date(NOW)).listTasks({ actorId });
  const tomorrow = await followupServiceFor(
    records,
    workspaceId,
    () => new Date(new Date(NOW).getTime() + 86_400_000),
  ).listTasks({ actorId });
  assert.equal(today.success, true);
  assert.equal(tomorrow.success, true);
  if (!today.success || !tomorrow.success) return;

  const before = new Map(today.data.tasks.filter((task) => task.dueAt).map((task) => [task.taskId, task.dueInDays]));
  const after = tomorrow.data.tasks.filter((task) => task.dueAt);
  assert.ok(after.length > 0);
  assert.equal(after.length, before.size);
  for (const task of after) {
    assert.equal(task.dueInDays, (before.get(task.taskId) ?? Number.NaN) - 1, task.taskId);
  }
  // 无 dueAt 的派生建议不随时钟变化
  const derivedBefore = today.data.tasks.filter((task) => !task.dueAt).map((task) => [task.taskId, task.dueInDays]);
  const derivedAfter = tomorrow.data.tasks.filter((task) => !task.dueAt).map((task) => [task.taskId, task.dueInDays]);
  assert.deepEqual(derivedAfter, derivedBefore);
});

function reminderRecord(updatedAt: string, scheduledFor: string): AnyRecord {
  return {
    workspaceId: "workspace:reminder-clock",
    collectionName: "notifications",
    recordId: "notification:clock:1",
    userId: "actor:reminder-clock",
    sourceType: "agent_action",
    sourceId: "notification:clock:1",
    sourceLabel: "Appointment reminder",
    evidenceIds: ["appointment:clock:revision:1"],
    targetType: "contact",
    targetId: "contact:ren",
    occurredAt: scheduledFor,
    lifecycleState: "active",
    searchText: "meeting memo",
    payload: {
      id: "notification:clock:1",
      channel: "in_app",
      title: "约谈已经结束：记录会后纪要与下一步",
      body: "约谈已经结束：记录会后纪要与下一步",
      status: "pending",
      scheduledFor,
      actionHref: "/app/contacts",
      source: { type: "agent_action", id: "notification:clock:1", label: "Appointment reminder" },
      evidenceIds: ["appointment:clock:revision:1"],
      createdAt: "2026-07-20T00:00:00.000Z",
    },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt,
  } as AnyRecord;
}

function reminderServiceFor(record: AnyRecord, now: () => Date) {
  return createLiveReminderScheduleNotificationService({
    now,
    provider: createStorageReminderScheduleNotificationProvider({
      store: createMemoryLiveRecordStore<Record<string, unknown>>([record]),
      workspaceId: "workspace:reminder-clock",
    }),
  });
}

test("SC-01 reminders depend on the injected now, not on record updatedAt", async () => {
  const actorId = "actor:reminder-clock";
  // 截止 7/29 10:00 JST
  const scheduledFor = "2026-07-29T01:00:00.000Z";
  let nowCalls = 0;
  const now = () => {
    nowCalls += 1;
    return new Date(NOW);
  };

  const first = await reminderServiceFor(reminderRecord("2026-07-20T00:00:00.000Z", scheduledFor), now)
    .listNotifications({ actorId });
  assert.equal(nowCalls, 1, "listNotifications reads the clock exactly once");
  const second = await reminderServiceFor(reminderRecord("2026-08-30T00:00:00.000Z", scheduledFor), now)
    .listNotifications({ actorId });
  const generated = await reminderServiceFor(reminderRecord("2026-07-20T00:00:00.000Z", scheduledFor), now)
    .generateReminders({ actorId });
  assert.equal(nowCalls, 3);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(generated.success, true);
  if (!first.success || !second.success) return;

  assert.equal(first.data.reminders.length, 1);
  assert.deepEqual(second.data.reminders, first.data.reminders);
  assert.deepEqual(second.data.notificationQueue, first.data.notificationQueue);
  assert.equal(first.data.provenance.collectedAt, NOW);
  assert.equal(first.data.reminders[0]?.dueInDays, -27);
  assert.equal(first.data.reminders[0]?.priority, "high");
  assert.equal(first.data.reminders[0]?.frequency, "once");

  const tomorrow = await reminderServiceFor(
    reminderRecord("2026-07-20T00:00:00.000Z", scheduledFor),
    () => new Date(new Date(NOW).getTime() + 86_400_000),
  ).listNotifications({ actorId });
  assert.equal(tomorrow.success, true);
  if (!tomorrow.success) return;
  assert.equal(tomorrow.data.reminders[0]?.dueInDays, -28);
});
