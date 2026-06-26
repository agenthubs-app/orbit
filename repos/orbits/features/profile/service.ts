import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ManualProfile,
  ManualProfileUpdateInput,
  ProfileCompleteness,
  ProfileFailure,
  ProfileResult,
  ProfileScenario,
  ProfileSuccess,
} from "./contract";

export interface ProfileService {
  getProfile: (options?: {
    scenario?: ProfileScenario | string | null;
  }) => ProfileResult;
  getPendingManualReview: () => ProfileSuccess;
  scoreCompleteness: (profile: ManualProfile | null) => ProfileCompleteness;
  updateProfile: (input: ManualProfileUpdateInput) => ProfileResult;
}

export function profileFailureToAppError(failure: ProfileFailure): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function profileFailureContext(
  failure: ProfileFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    profileErrorCode: failure.error.code,
    provenance: "Mock profile failure came from deterministic fixture rules.",
    service: "profile-onboarding-and-manual-profile-editor",
  };
}
