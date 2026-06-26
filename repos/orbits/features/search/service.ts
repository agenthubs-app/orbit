import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  RelationshipNaturalSearchFailure,
  RelationshipNaturalSearchInput,
  RelationshipNaturalSearchInvalidBodyFailure,
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchSuggestionsInput,
  RelationshipNaturalSearchSuggestionsResult,
} from "./contract";

export interface RelationshipNaturalSearchService {
  queryRelationships: (
    input?: RelationshipNaturalSearchInput,
  ) => RelationshipNaturalSearchResult;
  getSearchSuggestions: (
    input?: RelationshipNaturalSearchSuggestionsInput,
  ) => RelationshipNaturalSearchSuggestionsResult;
  invalidQueryBody: () => RelationshipNaturalSearchInvalidBodyFailure;
}

export function relationshipNaturalSearchFailureToAppError(
  failure: RelationshipNaturalSearchFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function relationshipNaturalSearchFailureContext(
  failure: RelationshipNaturalSearchFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock relationship natural search failure came from deterministic fixture rules.",
    relationshipNaturalSearchErrorCode: failure.error.code,
    service: "relationship-natural-search-mock",
  };
}

export type {
  RelationshipNaturalSearchResult,
  RelationshipNaturalSearchSuggestionsResult,
};
