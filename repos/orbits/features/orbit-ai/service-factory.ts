import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockOrbitAgentArtifactTaskService } from "./mock-artifact-task-service";
import { createMockOrbitAgentConversationService } from "./mock-conversation-service";
import { createMockOrbitAiCommandService } from "./mock-service";
import type {
  OrbitAgentArtifactTaskService,
  OrbitAgentConversationService,
  OrbitAiCommandService,
} from "./service";

export const orbitAiCommandServiceFactory =
  createModuleServiceFactory<OrbitAiCommandService>({
    capabilityId: "orbit-ai-command",
    implementations: {
      mock: () => createMockOrbitAiCommandService(),
    },
  });

export const orbitAgentConversationServiceFactory =
  createModuleServiceFactory<OrbitAgentConversationService>({
    capabilityId: "orbit-agent-conversation",
    implementations: {
      mock: () => createMockOrbitAgentConversationService(),
    },
  });

export const orbitAgentArtifactTaskServiceFactory =
  createModuleServiceFactory<OrbitAgentArtifactTaskService>({
    capabilityId: "orbit-agent-artifact-task",
    implementations: {
      mock: () => createMockOrbitAgentArtifactTaskService(),
    },
  });

export function resolveOrbitAiCommandService(mode?: ModuleMode | string) {
  return orbitAiCommandServiceFactory.create(mode);
}

export function resolveOrbitAgentConversationService(
  mode?: ModuleMode | string,
) {
  return orbitAgentConversationServiceFactory.create(mode);
}

export function resolveOrbitAgentArtifactTaskService(
  mode?: ModuleMode | string,
) {
  return orbitAgentArtifactTaskServiceFactory.create(mode);
}

export function createOrbitAiCommandService(
  mode?: ModuleMode | string,
): OrbitAiCommandService {
  const resolution = resolveOrbitAiCommandService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function createOrbitAgentArtifactTaskService(
  mode?: ModuleMode | string,
): OrbitAgentArtifactTaskService {
  const resolution = resolveOrbitAgentArtifactTaskService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function createOrbitAgentConversationService(
  mode?: ModuleMode | string,
): OrbitAgentConversationService {
  const resolution = resolveOrbitAgentConversationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
