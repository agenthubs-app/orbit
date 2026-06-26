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

export interface AppAgentRouteServices {
  agentActionService: AgentActionQueueService;
  confirmationService: SensitiveActionConfirmationService;
  notificationService: ReminderScheduleNotificationService;
  sandboxService: ExternalActionSandboxService;
  settingsService: AgentAutonomySettingsService;
}

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
  const resolution = resolveAppAgentRouteServices();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
