import {
  DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS,
  mockAppliedDuplicateMergeFixture,
  mockDuplicateMergeFailureProvenance,
  mockDuplicateMergeSuggestions,
  mockDuplicateMergeSuggestionsFixture,
  mockEmptyDuplicateMergeSuggestionsFixture,
  mockPendingDuplicateMergeSuggestionsFixture,
  type DuplicateDetectionMergeErrorCode,
  type DuplicateDetectionMergeFailure,
  type DuplicateDetectionMergeScenario,
  type DuplicateDetectionMergeService,
  type DuplicateMergeApplyInput,
  type DuplicateMergeApplyPayload,
  type DuplicateMergeApplyResult,
  type DuplicateMergeApplyScenario,
  type DuplicateMergeApplySuccess,
  type DuplicateMergeSuggestion,
  type DuplicateMergeSuggestionInput,
  type DuplicateMergeSuggestionsPayload,
  type DuplicateMergeSuggestionsResult,
  type DuplicateMergeSuggestionsSuccess,
} from "./merge-contract";

const supportedListScenarios = new Set<DuplicateDetectionMergeScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedApplyScenarios = new Set<DuplicateMergeApplyScenario>([
  "success",
  "pending",
  "blocked",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function suggestionsSuccess(
  payload: DuplicateMergeSuggestionsPayload,
): DuplicateMergeSuggestionsSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function applySuccess(
  payload: DuplicateMergeApplyPayload,
): DuplicateMergeApplySuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: DuplicateDetectionMergeErrorCode,
): DuplicateDetectionMergeFailure {
  const definition = DUPLICATE_DETECTION_MERGE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockDuplicateMergeFailureProvenance,
      evidenceIds: mockDuplicateMergeFailureProvenance.evidenceIds,
    },
  };
}

function normalizeListScenario(
  scenario?: DuplicateMergeSuggestionInput["scenario"],
): DuplicateDetectionMergeScenario {
  if (
    scenario &&
    supportedListScenarios.has(scenario as DuplicateDetectionMergeScenario)
  ) {
    return scenario as DuplicateDetectionMergeScenario;
  }

  return "success";
}

function normalizeApplyScenario(
  scenario?: DuplicateMergeApplyInput["scenario"],
): DuplicateMergeApplyScenario {
  if (
    scenario &&
    supportedApplyScenarios.has(scenario as DuplicateMergeApplyScenario)
  ) {
    return scenario as DuplicateMergeApplyScenario;
  }

  return "success";
}

function scenarioSuggestionsResult(
  scenario: DuplicateDetectionMergeScenario,
): DuplicateMergeSuggestionsResult | null {
  switch (scenario) {
    case "empty":
      return suggestionsSuccess(mockEmptyDuplicateMergeSuggestionsFixture);
    case "pending":
      return suggestionsSuccess(mockPendingDuplicateMergeSuggestionsFixture);
    case "failure":
      return failure("DUPLICATE_DETECTION_MERGE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioApplyResult(
  scenario: DuplicateMergeApplyScenario,
): DuplicateMergeApplyResult | null {
  switch (scenario) {
    case "pending":
      return failure("DUPLICATE_MERGE_PENDING_REVIEW");
    case "blocked":
      return failure("DUPLICATE_MERGE_CONFIRMATION_BLOCKED");
    case "failure":
      return failure("DUPLICATE_DETECTION_MERGE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function findSuggestion(
  suggestionId: string,
): DuplicateMergeSuggestion | undefined {
  return mockDuplicateMergeSuggestions.find(
    (suggestion) => suggestion.id === suggestionId,
  );
}

function buildAppliedPayload(
  suggestion: DuplicateMergeSuggestion,
  actorLabel: string,
): DuplicateMergeApplyPayload {
  const base =
    suggestion.id === mockAppliedDuplicateMergeFixture.suggestionId
      ? mockAppliedDuplicateMergeFixture
      : {
          ...mockAppliedDuplicateMergeFixture,
          suggestionId: suggestion.id,
          appliedSuggestion: suggestion,
          mergedContactPreview: {
            ...mockAppliedDuplicateMergeFixture.mergedContactPreview,
            contactId: suggestion.existingContactId,
            evidenceIds: [
              ...suggestion.evidenceIds,
              "evidence:duplicate-merge-confirmation",
            ],
          },
          fieldDecisions: suggestion.fieldDecisions,
        };

  return {
    ...base,
    confirmedBy: actorLabel,
    confirmation: {
      ...base.confirmation,
      actorLabel,
      question: suggestion.reviewQuestion,
    },
    createdEvidence: {
      ...base.createdEvidence,
      excerpt: `${actorLabel} confirmed ${suggestion.id} in the local mock boundary; no live merge write was executed.`,
    },
  };
}

export function createMockDuplicateMergeService(): DuplicateDetectionMergeService {
  return {
    listMergeSuggestions(input = {}): DuplicateMergeSuggestionsResult {
      const scenarioResult = scenarioSuggestionsResult(
        normalizeListScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      return suggestionsSuccess(mockDuplicateMergeSuggestionsFixture);
    },

    applyMergeSuggestion(input): DuplicateMergeApplyResult {
      const scenarioResult = scenarioApplyResult(
        normalizeApplyScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const suggestion = findSuggestion(input.suggestionId);

      if (!suggestion) {
        return failure("DUPLICATE_MERGE_SUGGESTION_NOT_FOUND");
      }

      return applySuccess(
        buildAppliedPayload(suggestion, input.actorLabel?.trim() || "Verifier"),
      );
    },
  };
}

export type {
  DuplicateMergeApplyResult,
  DuplicateMergeSuggestionsResult,
};
