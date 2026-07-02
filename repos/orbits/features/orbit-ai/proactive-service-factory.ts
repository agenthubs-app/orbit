import {
  createModuleServiceFactory,
  type ModuleMode,
} from "../../shared/services/module-mode";
import { createLiveOrbitAiProactiveAgentService } from "./live-proactive-service";
import { createMockOrbitAiProactiveAgentService } from "./mock-proactive-service";
import type { OrbitAiProactiveAgentService } from "./proactive-contract";

export const orbitAiProactiveAgentServiceFactory =
  createModuleServiceFactory<OrbitAiProactiveAgentService>({
    capabilityId: "orbit-ai-proactive-agent",
    implementations: {
      live: () => createLiveOrbitAiProactiveAgentService(),
      mock: () => createMockOrbitAiProactiveAgentService(),
    },
  });

export function resolveOrbitAiProactiveAgentService(
  mode?: ModuleMode | string,
) {
  return orbitAiProactiveAgentServiceFactory.create(mode);
}

export function createOrbitAiProactiveAgentService(
  mode?: ModuleMode | string,
): OrbitAiProactiveAgentService {
  const resolution = resolveOrbitAiProactiveAgentService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
