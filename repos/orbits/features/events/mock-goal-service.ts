import {
  EVENT_GOAL_READINESS_ERROR_DEFINITIONS,
  mockEmptyEventGoalReadinessFixture,
  mockEventGoalReadinessEvent,
  mockEventGoalReadinessFailureProvenance,
  mockEventGoalReadinessFixture,
  mockEventGoalReadinessProvenance,
  mockEventGoalRecord,
  mockEventGoalSuggestions,
  mockPendingEventGoalReadinessFixture,
  type EventGoalAndReadinessService,
  type EventGoalFocus,
  type EventGoalReadinessPayload,
  type EventGoalReadinessErrorCode,
  type EventGoalReadinessFailure,
  type EventGoalReadinessInput,
  type EventGoalReadinessResult,
  type EventGoalReadinessScenario,
  type EventGoalSetInput,
  type EventGoalSetPayload,
  type EventGoalSetResult,
  type EventGoalSuggestionInput,
  type EventGoalSuggestionsPayload,
  type EventGoalSuggestionsResult,
  type EventGoalSuggestion,
} from "./goal-contract";

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<EventGoalReadinessScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedFocusValues = new Set<EventGoalFocus>([
  "operator_intros",
  "storage_pilot",
  "investor_context",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function readinessSuccess(
  data: EventGoalReadinessPayload,
): EventGoalReadinessResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function goalSetSuccess(data: EventGoalSetPayload): EventGoalSetResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function suggestionsSuccess(
  data: EventGoalSuggestionsPayload,
): EventGoalSuggestionsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: EventGoalReadinessErrorCode,
): EventGoalReadinessFailure {
  const definition = EVENT_GOAL_READINESS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventGoalReadinessFailureProvenance,
      evidenceIds: mockEventGoalReadinessFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventGoalReadinessInput["scenario"],
): EventGoalReadinessScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventGoalReadinessScenario)
  ) {
    return scenario as EventGoalReadinessScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function normalizeFocus(
  relationshipFocus?: EventGoalSuggestionInput["relationshipFocus"],
): EventGoalFocus | null {
  if (
    relationshipFocus &&
    supportedFocusValues.has(relationshipFocus as EventGoalFocus)
  ) {
    return relationshipFocus as EventGoalFocus;
  }

  return null;
}

function eventFailure(
  input: EventGoalReadinessInput,
): EventGoalReadinessFailure | null {
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("EVENT_GOAL_READINESS_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("EVENT_GOAL_READINESS_EVENT_NOT_FOUND");
  }

  return null;
}

function scenarioReadinessResult(
  scenario: EventGoalReadinessScenario,
): EventGoalReadinessResult | null {
  switch (scenario) {
    case "empty":
      return readinessSuccess(mockEmptyEventGoalReadinessFixture);
    case "pending":
      return readinessSuccess(mockPendingEventGoalReadinessFixture);
    case "failure":
      return failure("EVENT_GOAL_READINESS_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioSetGoalResult(
  scenario: EventGoalReadinessScenario,
): EventGoalSetResult | null {
  switch (scenario) {
    case "failure":
      return failure("EVENT_GOAL_READINESS_MOCK_FAILED");
    case "pending":
      return failure("EVENT_GOAL_READINESS_PREPARATION_PENDING");
    case "empty":
    case "success":
    default:
      return null;
  }
}

function suggestedGoalsFor(
  relationshipFocus?: EventGoalSuggestionInput["relationshipFocus"],
): readonly EventGoalSuggestion[] {
  const focus = normalizeFocus(relationshipFocus);

  if (!focus) {
    return mockEventGoalSuggestions;
  }

  return mockEventGoalSuggestions.filter((goal) => goal.focus === focus);
}

function suggestionsPayload(input: {
  suggestedGoals: readonly EventGoalSuggestion[];
  state: EventGoalReadinessScenario;
}): EventGoalSuggestionsPayload {
  const isEmpty = input.state === "empty";
  const isPending = input.state === "pending";
  const suggestedGoals = isEmpty ? [] : input.suggestedGoals;

  return {
    state: isPending ? "pending" : isEmpty ? "empty" : "success",
    event: mockEventGoalReadinessEvent,
    suggestedGoals,
    summary:
      suggestedGoals.length > 0
        ? "Local rules suggested event goals from fixture evidence without model calls."
        : "No local goal suggestions are available for this mock scenario.",
    provenance: {
      ...mockEventGoalReadinessProvenance,
      sourceLabel: isEmpty
        ? "Mock empty event goal suggestion rule"
        : isPending
          ? "Mock pending event goal suggestion rule"
          : "Mock event goal suggestion rule",
      evidenceIds:
        suggestedGoals.length > 0
          ? suggestedGoals.flatMap((goal) => goal.evidenceIds)
          : ["evidence:event-goal-empty"],
      generationMethod: "rule-based-goal-suggestion",
    },
    nextAction:
      suggestedGoals.length > 0
        ? "Choose a suggested goal or enter a concise event goal."
        : "Set a manual event goal before composing readiness.",
  };
}

function scenarioSuggestionsResult(
  scenario: EventGoalReadinessScenario,
  input: EventGoalSuggestionInput,
): EventGoalSuggestionsResult | null {
  switch (scenario) {
    case "empty":
      return suggestionsSuccess(
        suggestionsPayload({
          suggestedGoals: [],
          state: "empty",
        }),
      );
    case "pending":
      return suggestionsSuccess(
        suggestionsPayload({
          suggestedGoals: suggestedGoalsFor(input.relationshipFocus),
          state: "pending",
        }),
      );
    case "failure":
      return failure("EVENT_GOAL_READINESS_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function selectedSuggestion(
  selectedSuggestionId?: string | null,
): EventGoalSuggestion {
  return (
    mockEventGoalSuggestions.find(
      (suggestion) => suggestion.goalId === selectedSuggestionId,
    ) ?? mockEventGoalSuggestions[0]
  );
}

function buildGoalSetPayload(input: EventGoalSetInput): EventGoalSetPayload {
  const selected = selectedSuggestion(input.selectedSuggestionId);
  const goalText = input.goalText?.trim() || selected.intent;
  const goal = {
    ...mockEventGoalRecord,
    goalId:
      goalText === mockEventGoalRecord.intent
        ? mockEventGoalRecord.goalId
        : "goal:demo-event-1:custom",
    intent: goalText,
    selectedSuggestionId: selected.goalId,
    evidenceIds: selected.evidenceIds,
    generatedBy:
      goalText === selected.intent ? "mock-goal-rule" : "mock-goal-form",
  } as const;

  return {
    ...mockEventGoalReadinessFixture,
    state: "success",
    goal,
    acceptedGoalText: goalText,
    provenance: {
      ...mockEventGoalReadinessProvenance,
      evidenceIds: goal.evidenceIds,
      generationMethod: "rule-based-goal-setting",
      sourceLabel: "Mock event goal setting rule",
    },
    summary:
      "Local rules accepted the event goal and recomputed readiness from deterministic fixture evidence.",
    nextAction:
      "Use the readiness checklist to confirm the pending follow-up owner.",
  };
}

function goalValidationFailure(
  input: EventGoalSetInput,
): EventGoalReadinessFailure | null {
  if (input.goalText === undefined || input.goalText === null) {
    return null;
  }

  return input.goalText.trim()
    ? null
    : failure("EVENT_GOAL_READINESS_GOAL_REQUIRED");
}

export function createMockEventGoalAndReadinessService(): EventGoalAndReadinessService {
  return {
    suggestGoals(input = {}): EventGoalSuggestionsResult {
      const scenario = normalizeScenario(input.scenario);
      const scenarioResult = scenarioSuggestionsResult(scenario, input);

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return suggestionsSuccess(
        suggestionsPayload({
          suggestedGoals: suggestedGoalsFor(input.relationshipFocus),
          state: "success",
        }),
      );
    },

    setGoal(input = {}): EventGoalSetResult {
      const scenarioResult = scenarioSetGoalResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      const validationFailure = goalValidationFailure(input);

      if (validationFailure) {
        return validationFailure;
      }

      return goalSetSuccess(buildGoalSetPayload(input));
    },

    getReadiness(input = {}): EventGoalReadinessResult {
      const scenarioResult = scenarioReadinessResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return readinessSuccess(mockEventGoalReadinessFixture);
    },
  };
}

export type {
  EventGoalReadinessResult,
  EventGoalSetResult,
  EventGoalSuggestionsResult,
};
