import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE =
  "fixture:features/notifications/fixtures.ts" as const;
// Reminder Schedule Notification contract 描述提醒和通知队列的计划协议。
// mock/live 的具体来源标记和执行策略由各自实现提供。

export const REMINDER_SCHEDULE_NOTIFICATION_ERROR_CODES = [
  "REMINDER_SCHEDULE_NOTIFICATION_REMINDER_ID_REQUIRED",
  "REMINDER_SCHEDULE_NOTIFICATION_REMINDER_NOT_FOUND",
  "REMINDER_SCHEDULE_NOTIFICATION_EMPTY",
  "REMINDER_SCHEDULE_NOTIFICATION_PENDING",
  "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED",
] as const;

export type ReminderScheduleNotificationErrorCode =
  (typeof REMINDER_SCHEDULE_NOTIFICATION_ERROR_CODES)[number];

export type ReminderScheduleNotificationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type ReminderScheduleNotificationState =
  | "success"
  | "empty"
  | "pending";

export type ReminderFrequency = "once" | "daily" | "weekly" | "monthly";

export type ReminderPriority = "high" | "normal" | "low";

export type NotificationQueueChannel = "push" | "email" | "sms" | "in_app";

export type NotificationQueueStatus = "mock_queued" | "mock_grouped";

// list 输入用于过滤已有提醒；generate 输入用于按频率和时间窗口生成建议。
export interface ReminderScheduleNotificationListInput {
  scenario?: ReminderScheduleNotificationScenario | string | null;
  frequency?: ReminderFrequency | string | null;
  priority?: ReminderPriority | string | null;
  limit?: number | null;
}

export interface ReminderScheduleNotificationGenerateInput {
  scenario?: ReminderScheduleNotificationScenario | string | null;
  frequencies?: readonly (ReminderFrequency | string)[] | null;
  includeGroupedLowPriority?: boolean | null;
  dueWithinDays?: number | null;
  limit?: number | null;
}

export interface ReminderScheduleNotificationErrorDefinition {
  code: ReminderScheduleNotificationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 通知失败定义明确不会回退调用真实投递、cron、数据库或设备。
export const REMINDER_SCHEDULE_NOTIFICATION_ERROR_DEFINITIONS = {
  REMINDER_SCHEDULE_NOTIFICATION_REMINDER_ID_REQUIRED: {
    code: "REMINDER_SCHEDULE_NOTIFICATION_REMINDER_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A reminder id is required before resolving a reminder notification fixture.",
    recovery:
      "Keep reminder-specific actions disabled until a known local reminder fixture is selected.",
  },
  REMINDER_SCHEDULE_NOTIFICATION_REMINDER_NOT_FOUND: {
    code: "REMINDER_SCHEDULE_NOTIFICATION_REMINDER_NOT_FOUND",
    appCode: "NOT_FOUND",
    message:
      "No mock reminder schedule or notification fixture matches that reminder id.",
    recovery:
      "Render the missing-reminder envelope and avoid querying notification delivery, email, SMS, schedulers, devices, databases, or external networks.",
  },
  REMINDER_SCHEDULE_NOTIFICATION_EMPTY: {
    code: "REMINDER_SCHEDULE_NOTIFICATION_EMPTY",
    appCode: "CONFLICT",
    message:
      "No mock reminder can be generated because no follow-up due dates match the reminder frequency.",
    recovery:
      "Add relationship context with follow-up due dates or adjust reminder frequency before generating notification queue entries.",
  },
  REMINDER_SCHEDULE_NOTIFICATION_PENDING: {
    code: "REMINDER_SCHEDULE_NOTIFICATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock reminder schedule is waiting for a local notification review guard.",
    recovery:
      "Render the pending state and do not call push notifications, email delivery, SMS delivery, cron jobs, databases, devices, or external networks.",
  },
  REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED: {
    code: "REMINDER_SCHEDULE_NOTIFICATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock reminder schedule and notification boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry push notifications, email delivery, SMS delivery, cron jobs, databases, devices, or external networks.",
  },
} as const satisfies Record<
  ReminderScheduleNotificationErrorCode,
  ReminderScheduleNotificationErrorDefinition
>;

export type ReminderScheduleNotificationSourceReference = SourceReferenceDTO & {
  type: "manual" | "event_import" | "calendar_signal" | "email_signal" | "system";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-reminder-rules";
};

// audit 描述提醒仍需人工复核，所有 delivery provider 均为 false。
export interface ReminderNotificationAudit {
  sourceLabel: string;
  providerBoundary:
    "push false, email false, SMS false, cron false, persistence false";
  verificationAction: "Review reminder evidence";
}

// ScheduledReminder 是计划中的提醒建议，不是已经注册的系统提醒。
export interface ScheduledReminder {
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
  audit: ReminderNotificationAudit;
  generatedBy: "mock-reminder-rules";
  pushNotificationRequested: false;
  emailDeliveryRequested: false;
  smsDeliveryRequested: false;
  cronJobRequested: false;
  notificationProviderRequested: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
}

export interface GroupedLowPriorityReminder {
  groupId: string;
  label: string;
  frequency: ReminderFrequency;
  priority: "low";
  reminderIds: readonly string[];
  queueEntryId: string;
  groupReason: string;
  evidenceIds: readonly string[];
  pushNotificationRequested: false;
  emailDeliveryRequested: false;
  smsDeliveryRequested: false;
  cronJobRequested: false;
  externalNetworkRequested: false;
}

// QueueEntry 是 mock 通知队列项，不代表任何 provider 已经接收任务。
export interface NotificationQueueEntry {
  queueEntryId: string;
  reminderIds: readonly string[];
  channel: NotificationQueueChannel;
  status: NotificationQueueStatus;
  scheduledFor: string;
  reason: string;
  evidenceIds: readonly string[];
  pushNotificationRequested: false;
  emailDeliveryRequested: false;
  smsDeliveryRequested: false;
  cronJobRequested: false;
  notificationProviderRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
}

export interface ReminderScheduleNotificationProvenance {
  source: typeof REMINDER_SCHEDULE_NOTIFICATION_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-reminder-schedule-notification-only";
  generationMethod:
    | "fixture"
    | "rule-based-reminder-schedule"
    | "rule-based-state";
  pushNotificationRequested: false;
  emailDeliveryRequested: false;
  smsDeliveryRequested: false;
  cronJobRequested: false;
  notificationProviderRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
}

export interface ReminderScheduleNotificationPayload {
  state: ReminderScheduleNotificationState;
  reminders: readonly ScheduledReminder[];
  groupedLowPriorityReminders: readonly GroupedLowPriorityReminder[];
  notificationQueue: readonly NotificationQueueEntry[];
  summary: string;
  provenance: ReminderScheduleNotificationProvenance;
  nextAction: string;
}

export interface ReminderScheduleNotificationSuccess {
  success: true;
  data: ReminderScheduleNotificationPayload;
}

export interface ReminderScheduleNotificationFailure {
  success: false;
  error: ReminderScheduleNotificationErrorDefinition & {
    state: "failure";
    provenance: ReminderScheduleNotificationProvenance;
    evidenceIds: readonly string[];
  };
}

export type ReminderScheduleNotificationResult =
  | ReminderScheduleNotificationSuccess
  | ReminderScheduleNotificationFailure;

export function reminderScheduleNotificationFailureToAppError(
  failure: ReminderScheduleNotificationFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function reminderScheduleNotificationFailureContext(
  failure: ReminderScheduleNotificationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock reminder schedule and notification failure came from deterministic fixture rules.",
    reminderScheduleNotificationErrorCode: failure.error.code,
    service: "reminder-schedule-and-notification-mock",
  };
}
