import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type { OpportunityReminderAnalyticsFailure } from "../../shared/compute/dashboard-opportunity-contract";

// Sprint 0117: the DTOs, error definitions and constants live in the shared
// directory (shared/compute/dashboard-opportunity-contract.ts), which the App runs too; the server-only
// error mapping stays here.
export * from "../../shared/compute/dashboard-opportunity-contract";

export function opportunityReminderAnalyticsFailureToAppError(
  failure: OpportunityReminderAnalyticsFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function opportunityReminderAnalyticsFailureContext(
  failure: OpportunityReminderAnalyticsFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    opportunityReminderAnalyticsErrorCode: failure.error.code,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "opportunity-reminder-analytics",
  };
}
