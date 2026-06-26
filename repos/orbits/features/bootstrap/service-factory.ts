import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockAppBootstrapService } from "./mock-service";
import type { AppBootstrapService } from "./service";

export const appBootstrapServiceFactory =
  createModuleServiceFactory<AppBootstrapService>({
    capabilityId: "app-bootstrap",
    implementations: {
      mock: () => createMockAppBootstrapService(),
    },
  });

export function resolveAppBootstrapService(mode?: ModuleMode | string) {
  return appBootstrapServiceFactory.create(mode);
}

export function createAppBootstrapService(
  mode?: ModuleMode | string,
): AppBootstrapService {
  const resolution = resolveAppBootstrapService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
