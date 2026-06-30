// Notifications service factory 管理提醒排程/通知能力。
// 当前 mock 只生成可复核的通知计划，不投递真实通知。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockReminderScheduleNotificationService } from "./mock-service";
import type { ReminderScheduleNotificationService } from "./service";

export const reminderScheduleNotificationServiceFactory =
  createModuleServiceFactory<ReminderScheduleNotificationService>({
    capabilityId: "reminder-schedule-notification",
    implementations: {
      mock: () => createMockReminderScheduleNotificationService(),
    },
  });

export function resolveReminderScheduleNotificationService(
  mode?: ModuleMode | string,
) {
  return reminderScheduleNotificationServiceFactory.create(mode);
}

export function createReminderScheduleNotificationService(
  mode?: ModuleMode | string,
): ReminderScheduleNotificationService {
  const resolution = resolveReminderScheduleNotificationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
