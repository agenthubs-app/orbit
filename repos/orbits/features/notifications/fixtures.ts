import {
  REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE,
  type GroupedLowPriorityReminder,
  type NotificationQueueChannel,
  type NotificationQueueEntry,
  type ReminderFrequency,
  type ReminderPriority,
  type ReminderScheduleNotificationPayload,
  type ReminderScheduleNotificationProvenance,
  type ReminderScheduleNotificationSourceReference,
  type ScheduledReminder,
} from "./contract";

export {
  REMINDER_SCHEDULE_NOTIFICATION_ERROR_CODES,
  REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS,
  REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE,
  type GroupedLowPriorityReminder,
  type NotificationQueueEntry,
  type ReminderFrequency,
  type ReminderPriority,
  type ReminderScheduleNotificationPayload,
  type ReminderScheduleNotificationProvenance,
  type ScheduledReminder,
} from "./contract";

const fixtureCollectedAt = "2026-06-25T23:10:00.000Z";

export const mockReminderFrequencies = [
  "once",
  "daily",
  "weekly",
  "monthly",
] as const satisfies readonly ReminderFrequency[];

function source(input: {
  type: ReminderScheduleNotificationSourceReference["type"];
  id: string;
  label: string;
  providerRecordId: string;
}): ReminderScheduleNotificationSourceReference {
  return {
    ...input,
    generatedBy: "mock-reminder-rules",
  };
}

function reminder(input: {
  reminderId: string;
  followupTaskId: string;
  connectionId: string;
  contactName: string;
  organization: string;
  title: string;
  dueAt: string;
  dueInDays: number;
  frequency: ReminderFrequency;
  priority: ReminderPriority;
  groupedLowPriority: boolean;
  recommendedWindow: string;
  source: ReminderScheduleNotificationSourceReference;
  evidenceIds: readonly string[];
}): ScheduledReminder {
  return {
    ...input,
    audit: {
      sourceLabel: input.source.label,
      providerBoundary:
        "push false, email false, SMS false, cron false, persistence false",
      verificationAction: "Review reminder evidence",
    },
    generatedBy: "mock-reminder-rules",
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    notificationProviderRequested: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
  };
}

function queueEntry(input: {
  queueEntryId: string;
  reminderIds: readonly string[];
  channel: NotificationQueueChannel;
  status: NotificationQueueEntry["status"];
  scheduledFor: string;
  reason: string;
  evidenceIds: readonly string[];
}): NotificationQueueEntry {
  return {
    ...input,
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    notificationProviderRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
  };
}

function lowPriorityGroup(input: {
  reminderIds: readonly string[];
  evidenceIds: readonly string[];
}): GroupedLowPriorityReminder {
  return {
    groupId: "group:reminders:low-priority-relationship-digest",
    label: "Grouped low-priority reminders",
    frequency: "weekly",
    priority: "low",
    queueEntryId: "queue:notification:relationship-digest",
    groupReason:
      "Low-priority relationship reminders are grouped into one in-app digest fixture instead of triggering delivery jobs.",
    ...input,
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    externalNetworkRequested: false,
  };
}

export const mockScheduledReminders: readonly ScheduledReminder[] = [
  reminder({
    reminderId: "reminder:followup:maya-deck",
    followupTaskId: "task:followup:promised-action:maya",
    connectionId: "connection:maya-chen",
    contactName: "Maya Chen",
    organization: "Kumo Grid",
    title: "Deliver the grid storage intro deck promised to Maya",
    dueAt: "2026-06-26T09:00:00.000+09:00",
    dueInDays: 0,
    frequency: "once",
    priority: "high",
    groupedLowPriority: false,
    recommendedWindow: "Morning follow-up before the Tokyo workday starts",
    source: source({
      type: "manual",
      id: "source:notification:maya-deck-due-date",
      label: "Follow-up task due date from Maya Chen",
      providerRecordId: "task:followup:promised-action:maya:due",
    }),
    evidenceIds: [
      "evidence:notification:maya-deck",
      "evidence:followup:promised-action",
    ],
  }),
  reminder({
    reminderId: "reminder:followup:diego-case-study",
    followupTaskId: "task:followup:event-encounter:diego",
    connectionId: "connection:diego-rivera",
    contactName: "Diego Rivera",
    organization: "Northstar Fleet",
    title: "Send Diego the procurement case study",
    dueAt: "2026-06-27T10:00:00.000+09:00",
    dueInDays: 1,
    frequency: "daily",
    priority: "normal",
    groupedLowPriority: false,
    recommendedWindow: "One morning reminder until the requested asset is sent",
    source: source({
      type: "event_import",
      id: "source:notification:diego-case-study",
      label: "Event encounter follow-up due date",
      providerRecordId: "encounter:diego:case-study:due",
    }),
    evidenceIds: [
      "evidence:notification:diego-case-study",
      "evidence:followup:event-encounter",
    ],
  }),
  reminder({
    reminderId: "reminder:followup:amina-nurture",
    followupTaskId: "task:followup:dormant-relationship:amina",
    connectionId: "connection:amina-okafor",
    contactName: "Amina Okafor",
    organization: "Helio Works",
    title: "Restart the Helio Works partner conversation",
    dueAt: "2026-06-30T11:00:00.000+09:00",
    dueInDays: 4,
    frequency: "weekly",
    priority: "low",
    groupedLowPriority: true,
    recommendedWindow: "Weekly relationship digest",
    source: source({
      type: "calendar_signal",
      id: "source:notification:amina-recency",
      label: "Relationship recency reminder",
      providerRecordId: "relationship:amina:last-touchpoint:due",
    }),
    evidenceIds: [
      "evidence:notification:amina-nurture",
      "evidence:followup:dormant-relationship",
    ],
  }),
  reminder({
    reminderId: "reminder:followup:kenji-intro",
    followupTaskId: "task:followup:introduction:kenji",
    connectionId: "connection:kenji-sato",
    contactName: "Kenji Sato",
    organization: "Mori Ventures",
    title: "Check whether Kenji can make the investor intro",
    dueAt: "2026-07-06T14:00:00.000+09:00",
    dueInDays: 10,
    frequency: "monthly",
    priority: "low",
    groupedLowPriority: true,
    recommendedWindow: "Monthly low-priority relationship digest",
    source: source({
      type: "email_signal",
      id: "source:notification:kenji-intro",
      label: "Relationship intro reminder",
      providerRecordId: "relationship:kenji:intro-request:due",
    }),
    evidenceIds: [
      "evidence:notification:kenji-intro",
      "evidence:followup:introduction-request",
    ],
  }),
];

export const mockGroupedLowPriorityReminders: readonly GroupedLowPriorityReminder[] =
  [
    lowPriorityGroup({
      reminderIds: [
        "reminder:followup:amina-nurture",
        "reminder:followup:kenji-intro",
      ],
      evidenceIds: [
        "evidence:notification:amina-nurture",
        "evidence:notification:kenji-intro",
      ],
    }),
  ];

export const mockNotificationQueueEntries: readonly NotificationQueueEntry[] = [
  queueEntry({
    queueEntryId: "queue:notification:maya-deck",
    reminderIds: ["reminder:followup:maya-deck"],
    channel: "push",
    status: "mock_queued",
    scheduledFor: "2026-06-26T09:00:00.000+09:00",
    reason:
      "Push notification is represented as a local queue fixture and is not delivered.",
    evidenceIds: ["evidence:notification:maya-deck"],
  }),
  queueEntry({
    queueEntryId: "queue:notification:diego-case-study",
    reminderIds: ["reminder:followup:diego-case-study"],
    channel: "email",
    status: "mock_queued",
    scheduledFor: "2026-06-27T10:00:00.000+09:00",
    reason:
      "Email delivery is represented as a local queue fixture and is not sent.",
    evidenceIds: ["evidence:notification:diego-case-study"],
  }),
  queueEntry({
    queueEntryId: "queue:notification:maya-sms-preview",
    reminderIds: ["reminder:followup:maya-deck"],
    channel: "sms",
    status: "mock_queued",
    scheduledFor: "2026-06-26T09:15:00.000+09:00",
    reason:
      "SMS delivery is represented as a local queue fixture and is not sent.",
    evidenceIds: ["evidence:notification:maya-deck"],
  }),
  queueEntry({
    queueEntryId: "queue:notification:relationship-digest",
    reminderIds: [
      "reminder:followup:amina-nurture",
      "reminder:followup:kenji-intro",
    ],
    channel: "in_app",
    status: "mock_grouped",
    scheduledFor: "2026-06-30T11:00:00.000+09:00",
    reason:
      "Grouped low-priority reminders stay in a deterministic in-app digest fixture.",
    evidenceIds: [
      "evidence:notification:amina-nurture",
      "evidence:notification:kenji-intro",
    ],
  }),
];

export const mockReminderScheduleNotificationProvenance: ReminderScheduleNotificationProvenance =
  {
    source: REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE,
    sourceLabel: "Mock reminder schedule and notification fixture",
    evidenceIds: [
      "evidence:notification:maya-deck",
      "evidence:notification:diego-case-study",
      "evidence:notification:amina-nurture",
      "evidence:notification:kenji-intro",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-reminder-schedule-notification-only",
    generationMethod: "fixture",
    pushNotificationRequested: false,
    emailDeliveryRequested: false,
    smsDeliveryRequested: false,
    cronJobRequested: false,
    notificationProviderRequested: false,
    liveDatabaseReadExecuted: false,
    liveDatabaseWriteExecuted: false,
    productionAuditLogWriteExecuted: false,
    externalNetworkRequested: false,
    deviceRequested: false,
  };

export const mockEmptyReminderScheduleNotificationProvenance: ReminderScheduleNotificationProvenance =
  {
    ...mockReminderScheduleNotificationProvenance,
    sourceLabel: "Mock empty reminder schedule rule",
    evidenceIds: ["evidence:notification-empty"],
    generationMethod: "rule-based-state",
  };

export const mockPendingReminderScheduleNotificationProvenance: ReminderScheduleNotificationProvenance =
  {
    ...mockReminderScheduleNotificationProvenance,
    sourceLabel: "Mock pending notification review guard",
    evidenceIds: ["evidence:notification-pending"],
    generationMethod: "rule-based-state",
  };

export const mockReminderScheduleNotificationFailureProvenance: ReminderScheduleNotificationProvenance =
  {
    ...mockReminderScheduleNotificationProvenance,
    sourceLabel: "Mock reminder schedule controlled failure",
    evidenceIds: ["evidence:notification-controlled-failure"],
    generationMethod: "rule-based-state",
  };

export const mockReminderScheduleNotificationFixture: ReminderScheduleNotificationPayload =
  {
    state: "success",
    reminders: mockScheduledReminders,
    groupedLowPriorityReminders: mockGroupedLowPriorityReminders,
    notificationQueue: mockNotificationQueueEntries,
    summary:
      "Local rules scheduled follow-up due date reminders and notification queue entries without push, email, SMS, cron, or persistence work.",
    provenance: mockReminderScheduleNotificationProvenance,
    nextAction:
      "Review reminder evidence before a live notification provider or scheduler can be enabled.",
  };

export const mockEmptyReminderScheduleNotificationFixture: ReminderScheduleNotificationPayload =
  {
    state: "empty",
    reminders: [],
    groupedLowPriorityReminders: [],
    notificationQueue: [],
    summary:
      "No due follow-up reminders matched the local reminder frequency rules.",
    provenance: mockEmptyReminderScheduleNotificationProvenance,
    nextAction:
      "Add relationship context with a follow-up due date or choose a reminder frequency before generating notifications.",
  };

export const mockPendingReminderScheduleNotificationFixture: ReminderScheduleNotificationPayload =
  {
    state: "pending",
    reminders: [],
    groupedLowPriorityReminders: [],
    notificationQueue: [],
    summary:
      "Reminder generation is waiting for a local notification review guard.",
    provenance: mockPendingReminderScheduleNotificationProvenance,
    nextAction:
      "Resolve the notification review guard before exposing scheduled reminders or queue entries.",
  };
