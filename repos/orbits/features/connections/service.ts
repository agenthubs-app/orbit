import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ConnectionAddEvidenceInput,
  ConnectionEvidenceAddResult,
  ConnectionEvidenceDetailResult,
  ConnectionEvidenceFailure,
  ConnectionEvidenceInvalidBodyFailure,
  ConnectionEvidenceListInput,
  ConnectionEvidenceListResult,
  ConnectionEvidenceLookupInput,
} from "./contract";

export interface ConnectionEvidenceService {
  listConnections: (
    input?: ConnectionEvidenceListInput,
  ) => ConnectionEvidenceListResult;
  getConnection: (
    input: ConnectionEvidenceLookupInput,
  ) => ConnectionEvidenceDetailResult;
  addEvidence: (
    input: ConnectionAddEvidenceInput,
  ) => ConnectionEvidenceAddResult;
  invalidAddEvidenceBody: () => ConnectionEvidenceInvalidBodyFailure;
}

export function connectionEvidenceFailureToAppError(
  failure: ConnectionEvidenceFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function connectionEvidenceFailureContext(
  failure: ConnectionEvidenceFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    connectionEvidenceErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock connection evidence failure came from deterministic fixture rules.",
    service: "connection-and-evidence-service-mock",
  };
}

export type {
  ConnectionEvidenceAddResult,
  ConnectionEvidenceDetailResult,
  ConnectionEvidenceListResult,
};
