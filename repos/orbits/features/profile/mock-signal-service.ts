import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import {
  PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS,
  type ProfileSignalReviewQueueErrorCode,
  type ProfileSignalReviewQueueFailure,
  type ProfileSignalReviewQueueInput,
  type ProfileSignalReviewQueuePayload,
  type ProfileSignalReviewQueueResult,
  type ProfileSignalReviewQueueScenario,
  type ProfileSignalReviewQueueService,
  type ProfileSignalReviewQueueSuccess,
  type ProfileSignalSuggestionAcceptedPayload,
  type ProfileSignalSuggestionAcceptedSuccess,
  type ProfileSignalSuggestionAcceptResult,
  type ProfileUpdateSuggestion,
} from "./signal-contract";
import {
  mockEmptyProfileSignalReviewQueueFixture,
  mockPendingProfileSignalReviewQueueFixture,
  mockProfileSignalReviewQueueFailureProvenance,
  mockProfileSignalReviewQueueFixture,
  mockProfileSignalReviewSuggestions,
  mockProfileSignalSuggestionAcceptedFixture,
} from "./signal-fixtures";

const supportedScenarios = new Set<ProfileSignalReviewQueueScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  payload: ProfileSignalReviewQueuePayload,
): ProfileSignalReviewQueueSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function accepted(
  payload: ProfileSignalSuggestionAcceptedPayload,
): ProfileSignalSuggestionAcceptedSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ProfileSignalReviewQueueErrorCode,
): ProfileSignalReviewQueueFailure {
  const definition = PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockProfileSignalReviewQueueFailureProvenance,
      evidenceIds: mockProfileSignalReviewQueueFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ProfileSignalReviewQueueInput["scenario"],
): ProfileSignalReviewQueueScenario {
  if (scenario && supportedScenarios.has(scenario as ProfileSignalReviewQueueScenario)) {
    return scenario as ProfileSignalReviewQueueScenario;
  }

  return "success";
}

function findSuggestion(id: string): ProfileUpdateSuggestion | undefined {
  return mockProfileSignalReviewSuggestions.find(
    (suggestion) => suggestion.id === id,
  );
}

export function createMockProfileSignalReviewQueueService(): ProfileSignalReviewQueueService {
  return {
    listUpdateSuggestions(input = {}) {
      switch (normalizeScenario(input.scenario)) {
        case "empty":
          return success(mockEmptyProfileSignalReviewQueueFixture);
        case "pending":
          return success(mockPendingProfileSignalReviewQueueFixture);
        case "failure":
          return failure("PROFILE_SIGNAL_REVIEW_QUEUE_FAILED");
        case "success":
        default:
          return success(mockProfileSignalReviewQueueFixture);
      }
    },

    acceptUpdateSuggestion(id) {
      const suggestion = findSuggestion(id);

      if (!suggestion) {
        return failure("PROFILE_SIGNAL_SUGGESTION_NOT_FOUND");
      }

      if (suggestion.status !== "pending") {
        return failure("PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED");
      }

      if (id === mockProfileSignalSuggestionAcceptedFixture.acceptedSuggestion.id) {
        return accepted(mockProfileSignalSuggestionAcceptedFixture);
      }

      return accepted({
        state: "accepted",
        acceptedSuggestion: {
          ...suggestion,
          status: "accepted",
        },
        profilePatch: {
          [suggestion.targetProfileField]: suggestion.suggestedValue,
        },
        appliedFields: [suggestion.targetProfileField],
        acceptedAt: mockProfileSignalSuggestionAcceptedFixture.acceptedAt,
        provenance: suggestion.provenance,
        nextAction:
          "Apply this patch only after the operator confirms the profile save.",
      });
    },
  };
}

export function profileSignalReviewQueueFailureToAppError(
  result: ProfileSignalReviewQueueFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function profileSignalReviewQueueFailureContext(
  result: ProfileSignalReviewQueueFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    profileSignalReviewQueueErrorCode: result.error.code,
    provenance:
      "Mock profile signal review failure came from deterministic fixture rules.",
    service: "profile-signal-review-queue-mock",
  };
}

export type {
  ProfileSignalReviewQueueResult,
  ProfileSignalSuggestionAcceptResult,
};
