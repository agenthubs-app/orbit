// Permissions service factory 管理权限状态和敏感动作确认。
// 任何可能产生外部副作用的流程都应先经过这里的确认 contract。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveSensitiveActionConfirmationService } from "./live-confirmation-service";
import { createLivePermissionStateService } from "./live-service";
import { createMockSensitiveActionConfirmationService } from "./mock-confirmation-service";
import { createMockPermissionStateService } from "./mock-service";
import type { SensitiveActionConfirmationService } from "./confirmation-contract";
import type { PermissionStateService } from "./service";
import { createConfiguredStoragePermissionStateProvider } from "./storage/permission-live-record-provider";

export {
  confirmationGuardFailureContext,
  confirmationGuardFailureToAppError,
} from "./mock-confirmation-service";

export const permissionStateServiceFactory =
  createModuleServiceFactory<PermissionStateService>({
    capabilityId: "permission-state",
    implementations: {
      live: () =>
        createLivePermissionStateService({
          provider: createConfiguredStoragePermissionStateProvider(),
        }),
      mock: () => createMockPermissionStateService(),
    },
  });

export const sensitiveActionConfirmationServiceFactory =
  createModuleServiceFactory<SensitiveActionConfirmationService>({
    capabilityId: "sensitive-action-confirmation",
    implementations: {
      live: () => createLiveSensitiveActionConfirmationService(),
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
