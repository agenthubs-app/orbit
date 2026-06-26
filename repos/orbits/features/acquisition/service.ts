import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ContactAcquisitionDraftFailure,
  ContactAcquisitionDraftInput,
  ContactAcquisitionDraftResult,
  ContactDraftConfirmationInput,
  ContactDraftConfirmationResult,
} from "./contract";

export interface ContactAcquisitionDraftService {
  listContactDrafts: (
    input?: ContactAcquisitionDraftInput,
  ) => ContactAcquisitionDraftResult;
  confirmContactDraft: (
    input: ContactDraftConfirmationInput,
  ) => ContactDraftConfirmationResult;
}

export function contactAcquisitionDraftFailureToAppError(
  failure: ContactAcquisitionDraftFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function contactAcquisitionDraftFailureContext(
  failure: ContactAcquisitionDraftFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    contactAcquisitionDraftErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock contact acquisition draft failure came from deterministic fixture rules.",
    service: "contact-acquisition-draft-pipeline-mock",
  };
}
