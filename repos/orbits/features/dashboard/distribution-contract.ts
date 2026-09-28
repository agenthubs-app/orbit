import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type { NetworkDistributionAnalyticsFailure } from "../../shared/compute/dashboard-distribution-contract";

// Sprint 0117: the DTOs, error definitions and constants live in the shared
// directory (shared/compute/dashboard-distribution-contract.ts), which the App runs too; the server-only
// error mapping stays here.
export * from "../../shared/compute/dashboard-distribution-contract";

export function networkDistributionAnalyticsFailureToAppError(
  failure: NetworkDistributionAnalyticsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function networkDistributionAnalyticsFailureContext(
  failure: NetworkDistributionAnalyticsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    networkDistributionAnalyticsErrorCode: failure.error.code,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "network-distribution-analytics",
  };
}
