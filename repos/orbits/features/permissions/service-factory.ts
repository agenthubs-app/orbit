import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockSensitiveActionConfirmationService } from "./mock-confirmation-service";
import { createMockPermissionStateService } from "./mock-service";
import type { SensitiveActionConfirmationService } from "./confirmation-contract";
import type { PermissionStateService } from "./service";

export {
  confirmationGuardFailureContext,
  confirmationGuardFailureToAppError,
} from "./mock-confirmation-service";

export const permissionStateServiceFactory =
  createModuleServiceFactory<PermissionStateService>({
    capabilityId: "permission-state",
    implementations: {
      mock: () => createMockPermissionStateService(),
    },
  });

export const sensitiveActionConfirmationServiceFactory =
  createModuleServiceFactory<SensitiveActionConfirmationService>({
    capabilityId: "sensitive-action-confirmation",
    implementations: {
      mock: () => createMockSensitiveActionConfirmationService(),
    },
  });

export function resolvePermissionStateService(mode?: ModuleMode | string) {
  return permissionStateServiceFactory.create(mode);
}

export function createPermissionStateService(
  mode?: ModuleMode | string,
): PermissionStateService {
  const resolution = resolvePermissionStateService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveSensitiveActionConfirmationService(
  mode?: ModuleMode | string,
) {
  return sensitiveActionConfirmationServiceFactory.create(mode);
}

export function createSensitiveActionConfirmationService(
  mode?: ModuleMode | string,
): SensitiveActionConfirmationService {
  const resolution = resolveSensitiveActionConfirmationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
