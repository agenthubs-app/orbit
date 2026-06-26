import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  PermissionRequestInput,
  PermissionRequestResult,
  PermissionStateFailure,
  PermissionStateInput,
  PermissionStateResult,
} from "./contract";

export interface PermissionStateService {
  listPermissionStates: (
    input?: PermissionStateInput,
  ) => PermissionStateResult;
  requestPermission: (input: PermissionRequestInput) => PermissionRequestResult;
}

export function permissionStateFailureToAppError(
  failure: PermissionStateFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function permissionStateFailureContext(
  failure: PermissionStateFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    permissionStateErrorCode: failure.error.code,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock permission state failure came from deterministic fixture rules.",
    service: "permission-state-and-staged-authorization-mock",
  };
}
