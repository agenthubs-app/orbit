import type { ApiErrorContext } from "../../shared/api/envelope";
import {
  RUNTIME_BOUNDARY_HEADER_VALUES,
} from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  AccountSessionFailure,
  AccountSessionResult,
  AccountSessionScenario,
  AccountSessionSuccess,
} from "./contract";

export interface AccountSessionService {
  demoSignIn: () => AccountSessionSuccess;
  getCurrentSession: (options?: {
    scenario?: AccountSessionScenario | string | null;
  }) => AccountSessionResult;
  getPendingDemoSignIn: () => AccountSessionSuccess;
  getSignedOutSession: () => AccountSessionSuccess;
  requireAccount: (
    scenario?: AccountSessionScenario | string | null,
  ) => AccountSessionResult;
  signOut: () => AccountSessionSuccess;
}

export function accountSessionFailureToAppError(
  failure: AccountSessionFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function accountSessionFailureContext(
  failure: AccountSessionFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    accountErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock account session failure came from deterministic fixture rules.",
    service: "mock-account-session",
  };
}
