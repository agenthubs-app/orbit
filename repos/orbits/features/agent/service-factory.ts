import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockExternalActionSandboxService } from "./mock-external-action-sandbox";
import { createMockAgentActionQueueService } from "./mock-service";
import { createMockAgentAutonomySettingsService } from "./mock-settings-service";
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
      mock: () => createMockAgentActionQueueService(),
    },
  });

export const agentAutonomySettingsServiceFactory =
  createModuleServiceFactory<AgentAutonomySettingsService>({
    capabilityId: "agent-autonomy-settings",
    implementations: {
      mock: () => createMockAgentAutonomySettingsService(),
    },
  });

export const externalActionSandboxServiceFactory =
  createModuleServiceFactory<ExternalActionSandboxService>({
    capabilityId: "external-action-sandbox",
    implementations: {
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
