import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type { DashboardAggregateFailure } from "../../shared/compute/dashboard-contract";

// Sprint 0117: the DTOs, error definitions and constants live in the shared
// directory (shared/compute/dashboard-contract.ts), which the App runs too; the server-only
// error mapping stays here.
export * from "../../shared/compute/dashboard-contract";

export function dashboardAggregateFailureToAppError(
  failure: DashboardAggregateFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function dashboardAggregateFailureContext(
  failure: DashboardAggregateFailure,
  mode: FeatureMode,
): ApiErrorContext {
  const isLiveFailure =
    failure.error.code === "DASHBOARD_AGGREGATE_LIVE_FAILED" ||
    failure.error.code === "DASHBOARD_AGGREGATE_LIVE_STORE_UNCONFIGURED";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    dashboardAggregateErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: isLiveFailure
      ? "Live dashboard aggregate failure came from configured storage setup."
      : "Mock dashboard aggregate failure came from deterministic fixture rules.",
    service: isLiveFailure ? "dashboard-aggregate-live" : "dashboard-aggregate-mock",
  };
}
