import { createMessageDraftGeneratorService } from "../../../../../features/followups/service-factory";
import { createFollowupTaskGenerationService } from "../../../../../features/followups/service-factory";
import type { MessageDraftGeneratorService } from "../../../../../features/followups/message-draft-contract";
import type { FollowupTaskGenerationService } from "../../../../../features/followups/service";
import { createReminderScheduleNotificationService } from "../../../../../features/notifications/service-factory";
import type { ReminderScheduleNotificationService } from "../../../../../features/notifications/service";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

export interface AppFollowupsRouteServices {
  taskService: FollowupTaskGenerationService;
  draftService: MessageDraftGeneratorService;
  notificationService: ReminderScheduleNotificationService;
}

export const appFollowupTaskServiceFactory =
  createModuleServiceFactory<FollowupTaskGenerationService>({
    capabilityId: "followup-tasks",
    implementations: {
      mock: () => createFollowupTaskGenerationService(),
    },
  });

export const appFollowupDraftServiceFactory =
  createModuleServiceFactory<MessageDraftGeneratorService>({
    capabilityId: "followup-message-drafts",
    implementations: {
      mock: () => createMessageDraftGeneratorService(),
    },
  });

export const appFollowupNotificationServiceFactory =
  createModuleServiceFactory<ReminderScheduleNotificationService>({
    capabilityId: "followup-reminders",
    implementations: {
      mock: () => createReminderScheduleNotificationService(),
    },
  });

export function resolveAppFollowupsRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppFollowupsRouteServices> {
  const taskResolution = appFollowupTaskServiceFactory.create(mode);
  const draftResolution = appFollowupDraftServiceFactory.create(mode);
  const notificationResolution =
    appFollowupNotificationServiceFactory.create(mode);
  const failedResolution = [
    taskResolution,
    draftResolution,
    notificationResolution,
  ].find((resolution) => resolution.success === false);

  if (failedResolution?.success === false) {
    return failedResolution;
  }

  if (
    taskResolution.success === false ||
    draftResolution.success === false ||
    notificationResolution.success === false
  ) {
    return {
      success: false,
      error: {
        availableModes: [],
        capabilityId: "followups",
        code: "NOT_IMPLEMENTED",
        message:
          "Follow-up route services are unavailable in the requested mode.",
        requestedMode: "mock",
      },
    };
  }

  return {
    success: true,
    mode: taskResolution.mode,
    service: {
      draftService: draftResolution.service,
      notificationService: notificationResolution.service,
      taskService: taskResolution.service,
    },
  };
}

export function createAppFollowupsRouteServices(): AppFollowupsRouteServices {
  const resolution = resolveAppFollowupsRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
