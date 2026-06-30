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

// ReminderScheduleNotificationService 管理提醒/通知建议。
// 当前服务只生成可复核提醒，不会真正投递通知或写入系统日历。
export interface ReminderScheduleNotificationService {
  // 读取待展示的通知/提醒建议。
  listNotifications: (
    input?: ReminderScheduleNotificationListInput,
  ) => ReminderScheduleNotificationResult;
  // 根据上下文生成提醒建议；投递动作必须由后续确认流程完成。
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
