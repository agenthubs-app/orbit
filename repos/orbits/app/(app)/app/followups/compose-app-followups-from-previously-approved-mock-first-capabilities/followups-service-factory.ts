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

// Followups 页面聚合任务生成、消息草稿和提醒通知三个能力。
// 页面组件通过这个 service bundle 获取数据，不直接实例化 feature service。
export interface AppFollowupsRouteServices {
  taskService: FollowupTaskGenerationService;
  draftService: MessageDraftGeneratorService;
  notificationService: ReminderScheduleNotificationService;
}

// 三个子能力分开声明 capabilityId，便于以后只替换任务、草稿或通知中的某一块。
export const appFollowupTaskServiceFactory =
  createModuleServiceFactory<FollowupTaskGenerationService>({
    capabilityId: "followup-tasks",
    implementations: {
      live: ({ requestedMode }) =>
        createFollowupTaskGenerationService(requestedMode),
      mock: ({ requestedMode }) =>
        createFollowupTaskGenerationService(requestedMode),
    },
  });

export const appFollowupDraftServiceFactory =
  createModuleServiceFactory<MessageDraftGeneratorService>({
    capabilityId: "followup-message-drafts",
    implementations: {
      live: ({ requestedMode }) =>
        createMessageDraftGeneratorService(requestedMode),
      mock: ({ requestedMode }) =>
        createMessageDraftGeneratorService(requestedMode),
    },
  });

export const appFollowupNotificationServiceFactory =
  createModuleServiceFactory<ReminderScheduleNotificationService>({
    capabilityId: "followup-reminders",
    implementations: {
      live: ({ requestedMode }) =>
        createReminderScheduleNotificationService(requestedMode),
      mock: ({ requestedMode }) =>
        createReminderScheduleNotificationService(requestedMode),
    },
  });

export function resolveAppFollowupsRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppFollowupsRouteServices> {
  // 逐个解析子服务；如果某个 mode 不支持某项能力，直接返回该失败。
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

  // fallback 分支避免构造出半可用的 followups 页面依赖。
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

  // 所有子服务可用时，返回页面可直接使用的聚合对象。
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
  // 页面运行时使用 throwing 版本；需要测试 mode 的地方用 resolve 函数。
  const resolution = resolveAppFollowupsRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
