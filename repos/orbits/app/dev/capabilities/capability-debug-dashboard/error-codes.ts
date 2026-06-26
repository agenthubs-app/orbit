import type { ApiErrorContext } from "../../../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../../../shared/api/envelope";
import type { FeatureMode } from "../../../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../../../shared/errors/app-error";

export const CAPABILITY_DEBUG_DASHBOARD_ERROR_CODES = [
  "CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED",
] as const;

export type CapabilityDebugDashboardErrorCode =
  (typeof CAPABILITY_DEBUG_DASHBOARD_ERROR_CODES)[number];

export interface CapabilityDebugDashboardErrorDefinition {
  code: CapabilityDebugDashboardErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const CAPABILITY_DEBUG_DASHBOARD_ERROR_DEFINITIONS = {
  CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED: {
    code: "CAPABILITY_DEBUG_DASHBOARD_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The capability debug dashboard mock is pinned to a controlled failure scenario.",
    recovery:
      "Render the capability debug dashboard failure state and do not call production admin tools, observability platforms, databases, providers, devices, AI, external networks, calendar, email, or notification services.",
  },
} as const satisfies Record<
  CapabilityDebugDashboardErrorCode,
  CapabilityDebugDashboardErrorDefinition
>;

export function capabilityDebugDashboardFailureToAppError(
  definition: CapabilityDebugDashboardErrorDefinition,
): AppError {
  return new AppError(definition.appCode, definition.message);
}

export function capabilityDebugDashboardFailureContext(
  code: CapabilityDebugDashboardErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    capabilityDebugDashboardErrorCode: code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock capability debug dashboard failure came from deterministic fixture rules.",
    service: "capability-debug-dashboard",
  };
}
