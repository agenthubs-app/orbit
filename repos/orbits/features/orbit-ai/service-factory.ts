import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockOrbitAiCommandService } from "./mock-service";
import type { OrbitAiCommandService } from "./service";

export const orbitAiCommandServiceFactory =
  createModuleServiceFactory<OrbitAiCommandService>({
    capabilityId: "orbit-ai-command",
    implementations: {
      mock: () => createMockOrbitAiCommandService(),
    },
  });

export function resolveOrbitAiCommandService(mode?: ModuleMode | string) {
  return orbitAiCommandServiceFactory.create(mode);
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
