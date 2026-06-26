import type {
  ReminderScheduleNotificationFailure,
  ReminderScheduleNotificationGenerateInput,
  ReminderScheduleNotificationListInput,
  ReminderScheduleNotificationResult,
} from "./contract";
import {
  reminderScheduleNotificationFailureContext,
  reminderScheduleNotificationFailureToAppError,
} from "./contract";

export interface ReminderScheduleNotificationService {
  listNotifications: (
    input?: ReminderScheduleNotificationListInput,
  ) => ReminderScheduleNotificationResult;
  generateReminders: (
    input?: ReminderScheduleNotificationGenerateInput,
  ) => ReminderScheduleNotificationResult;
}

export {
  reminderScheduleNotificationFailureContext,
  reminderScheduleNotificationFailureToAppError,
};

export type {
  ReminderScheduleNotificationFailure,
  ReminderScheduleNotificationGenerateInput,
  ReminderScheduleNotificationListInput,
  ReminderScheduleNotificationResult,
};
