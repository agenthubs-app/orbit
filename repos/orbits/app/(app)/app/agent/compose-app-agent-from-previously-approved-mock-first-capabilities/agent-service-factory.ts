import { createAgentActionQueueService } from "../../../../../features/agent/service-factory";
import type { AgentActionQueueService } from "../../../../../features/agent/service";
import { createExternalActionSandboxService } from "../../../../../features/agent/service-factory";
import type { ExternalActionSandboxService } from "../../../../../features/agent/external-action-contract";
import { createAgentAutonomySettingsService } from "../../../../../features/agent/service-factory";
import type { AgentAutonomySettingsService } from "../../../../../features/agent/settings-contract";
import { createReminderScheduleNotificationService } from "../../../../../features/notifications/service-factory";
import type { ReminderScheduleNotificationService } from "../../../../../features/notifications/service";
import {
  createSensitiveActionConfirmationService,
} from "../../../../../features/permissions/service-factory";
import type { SensitiveActionConfirmationService } from "../../../../../features/permissions/confirmation-contract";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

// Agent 页面需要同时读取动作队列、自治设置、确认流、通知和外部动作沙箱。
// 这个文件把这些 feature service 聚合成页面级依赖，页面组件不直接知道各模块的 factory。
export interface AppAgentRouteServices {
  agentActionService: AgentActionQueueService;
  confirmationService: SensitiveActionConfirmationService;
  notificationService: ReminderScheduleNotificationService;
  sandboxService: ExternalActionSandboxService;
  settingsService: AgentAutonomySettingsService;
}

// 每个页面级 factory 都声明 capabilityId，方便未来把某个能力从 mock 切到 live/hybrid。
export const appAgentActionServiceFactory =
  createModuleServiceFactory<AgentActionQueueService>({
    capabilityId: "app-agent-action-queue",
    implementations: {
      mock: () => createAgentActionQueueService(),
    },
  });

export const appAgentSettingsServiceFactory =
  createModuleServiceFactory<AgentAutonomySettingsService>({
    capabilityId: "app-agent-autonomy-settings",
    implementations: {
      mock: () => createAgentAutonomySettingsService(),
    },
  });

export const appAgentConfirmationServiceFactory =
  createModuleServiceFactory<SensitiveActionConfirmationService>({
    capabilityId: "app-agent-confirmation-guard",
    implementations: {
      mock: () => createSensitiveActionConfirmationService(),
    },
  });

export const appAgentSandboxServiceFactory =
  createModuleServiceFactory<ExternalActionSandboxService>({
    capabilityId: "app-agent-external-action-sandbox",
    implementations: {
      mock: () => createExternalActionSandboxService(),
    },
  });

export const appAgentNotificationServiceFactory =
  createModuleServiceFactory<ReminderScheduleNotificationService>({
    capabilityId: "app-agent-notification-queue",
    implementations: {
      mock: () => createReminderScheduleNotificationService(),
    },
  });

export function resolveAppAgentRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppAgentRouteServices> {
  // 分别解析每个子服务，任何一个能力在目标 mode 下不可用都会阻止页面继续装配。
  const agentActionResolution = appAgentActionServiceFactory.create(mode);
  const settingsResolution = appAgentSettingsServiceFactory.create(mode);
  const confirmationResolution = appAgentConfirmationServiceFactory.create(mode);
  const sandboxResolution = appAgentSandboxServiceFactory.create(mode);
  const notificationResolution = appAgentNotificationServiceFactory.create(mode);

  if (agentActionResolution.success === false) {
    return agentActionResolution;
  }

  if (settingsResolution.success === false) {
    return settingsResolution;
  }

  if (confirmationResolution.success === false) {
    return confirmationResolution;
  }

  if (sandboxResolution.success === false) {
    return sandboxResolution;
  }

  if (notificationResolution.success === false) {
    return notificationResolution;
  }

  // 所有子服务解析成功后，返回一个页面可直接消费的聚合 service bundle。
  return {
    success: true,
    mode: agentActionResolution.mode,
    service: {
      agentActionService: agentActionResolution.service,
      confirmationService: confirmationResolution.service,
      notificationService: notificationResolution.service,
      sandboxService: sandboxResolution.service,
      settingsService: settingsResolution.service,
    },
  };
}

export function createAppAgentRouteServices(): AppAgentRouteServices {
  // 页面运行时使用 throwing 版本；测试或上层切换 mode 时可用 resolve 版本拿结构化错误。
  const resolution = resolveAppAgentRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
