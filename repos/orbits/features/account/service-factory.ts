import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockAccountSessionService } from "./mock-service";
import type { AccountSessionService } from "./service";

export const accountSessionServiceFactory =
  createModuleServiceFactory<AccountSessionService>({
    capabilityId: "account-session",
    implementations: {
      mock: () => createMockAccountSessionService(),
    },
  });

export function resolveAccountSessionService(mode?: ModuleMode | string) {
  return accountSessionServiceFactory.create(mode);
}

export function createAccountSessionService(
  mode?: ModuleMode | string,
): AccountSessionService {
  const resolution = resolveAccountSessionService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
