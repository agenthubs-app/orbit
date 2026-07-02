// Agent service factory 管理自主 agent 的动作队列、自治设置和外部动作沙箱。
// 当前 mock 边界强调“预览和确认”，不会发送邮件、创建日程或执行真实外部动作。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridAgentActionQueueService } from "./agent-action-queue-mock/hybrid-service";
import { createLiveExternalActionSandboxService } from "./live-external-action-sandbox";
import { createLiveAgentActionQueueService } from "./live-service";
import { createLiveAgentAutonomySettingsService } from "./live-settings-service";
import { createMockExternalActionSandboxService } from "./mock-external-action-sandbox";
import { createMockAgentActionQueueService } from "./mock-service";
import { createMockAgentAutonomySettingsService } from "./mock-settings-service";
import { createConfiguredStorageAgentActionQueueProvider } from "./storage/agent-action-live-record-provider";
import type { ExternalActionSandboxService } from "./external-action-contract";
import type { AgentActionQueueService } from "./service";
import type { AgentAutonomySettingsService } from "./settings-contract";

export type {
  AgentAutonomySettingsInput,
  AgentAutonomySettingsUpdateInput,
} from "./settings-contract";

export const agentActionQueueServiceFactory =
  createModuleServiceFactory<AgentActionQueueService>({
    capabilityId: "agent-action-queue",
    implementations: {
      hybrid: () => createHybridAgentActionQueueService(),
      live: () =>
        createLiveAgentActionQueueService({
          provider: createConfiguredStorageAgentActionQueueProvider(),
        }),
      mock: () => createMockAgentActionQueueService(),
    },
  });

export const agentAutonomySettingsServiceFactory =
  createModuleServiceFactory<AgentAutonomySettingsService>({
    capabilityId: "agent-autonomy-settings",
    implementations: {
      live: () => createLiveAgentAutonomySettingsService(),
      mock: () => createMockAgentAutonomySettingsService(),
    },
  });

export const externalActionSandboxServiceFactory =
  createModuleServiceFactory<ExternalActionSandboxService>({
    capabilityId: "external-action-sandbox",
    implementations: {
      live: () => createLiveExternalActionSandboxService(),
      mock: () => createMockExternalActionSandboxService(),
    },
  });

export function resolveAgentActionQueueService(mode?: ModuleMode | string) {
  return agentActionQueueServiceFactory.create(mode);
}

export function createAgentActionQueueService(
  mode?: ModuleMode | string,
): AgentActionQueueService {
  const resolution = resolveAgentActionQueueService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveAgentAutonomySettingsService(
  mode?: ModuleMode | string,
) {
  return agentAutonomySettingsServiceFactory.create(mode);
}

export function createAgentAutonomySettingsService(
  mode?: ModuleMode | string,
): AgentAutonomySettingsService {
  const resolution = resolveAgentAutonomySettingsService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveExternalActionSandboxService(
  mode?: ModuleMode | string,
) {
  return externalActionSandboxServiceFactory.create(mode);
}

export function createExternalActionSandboxService(
  mode?: ModuleMode | string,
): ExternalActionSandboxService {
  const resolution = resolveExternalActionSandboxService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
