import {
  EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS,
  mockAcceptedEventValueRecommendationFixture,
  mockEmptyEventValueRecommendationsFixture,
  mockEventValueRecommendationFailureProvenance,
  mockEventValueRecommendationProvenance,
  mockEventValueRecommendations,
  mockEventValueRecommendationsFixture,
  mockEventValueRecommendationSource,
  mockPendingEventValueRecommendationsFixture,
  type AcceptEventValueRecommendationInput,
  type EventValueRecommendation,
  type EventValueRecommendationAcceptancePayload,
  type EventValueRecommendationAcceptanceResult,
  type EventValueRecommendationErrorCode,
  type EventValueRecommendationFailure,
  type EventValueRecommendationInput,
  type EventValueRecommendationScenario,
  type EventValueRecommendationService,
  type EventValueRecommendationsPayload,
  type EventValueRecommendationsResult,
} from "./event-value-contract";

const supportedScenarios = new Set<EventValueRecommendationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function recommendationsSuccess(
  data: EventValueRecommendationsPayload,
): EventValueRecommendationsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function acceptanceSuccess(
  data: EventValueRecommendationAcceptancePayload,
): EventValueRecommendationAcceptanceResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: EventValueRecommendationErrorCode,
): EventValueRecommendationFailure {
  const definition = EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventValueRecommendationFailureProvenance,
      evidenceIds: mockEventValueRecommendationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventValueRecommendationInput["scenario"],
): EventValueRecommendationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventValueRecommendationScenario)
  ) {
    return scenario as EventValueRecommendationScenario;
  }

  return "success";
}

function hasRankingInput(input: EventValueRecommendationInput): boolean {
  return Boolean(
    input.profileGoal?.trim() ||
      input.location?.trim() ||
      input.industryPreference?.trim() ||
      input.calendarFit?.trim(),
  );
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function normalizeText(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => term.length > 2 && value.includes(term));
}

function goalTerms(goal: string): readonly string[] {
  return goal.split(/\s+/).filter(Boolean);
}

function scoreForInput(
  recommendation: EventValueRecommendation,
  input: EventValueRecommendationInput,
): number {
  const profileGoal = normalizeText(input.profileGoal);
  const location = normalizeText(input.location);
  const industry = normalizeText(input.industryPreference);
  const calendarFit = normalizeText(input.calendarFit);
  const searchText = [
    recommendation.title,
    recommendation.industry,
    recommendation.recommendedAction,
    ...recommendation.signals.map((signal) => signal.detail),
  ]
    .join(" ")
    .toLowerCase();
  const goalScore =
    !profileGoal || includesAny(searchText, goalTerms(profileGoal)) ? 25 : 8;
  const locationScore =
    !location || recommendation.location.toLowerCase() === location ? 20 : 4;
  const industryScore =
    !industry || recommendation.industry.toLowerCase().includes(industry)
      ? 20
      : 6;
  const densityScore = Math.round((recommendation.attendeeDensity / 42) * 15);
  const calendarScore =
    !calendarFit || recommendation.calendarFit === calendarFit ? 10 : 2;

  return Math.min(
    99,
    Math.max(
      0,
      Math.round(
        20 + goalScore + locationScore + industryScore + densityScore + calendarScore,
      ),
    ),
  );
}

function scoreBand(score: number): EventValueRecommendation["scoreBand"] {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  return "low";
}

function rankedRecommendations(
  input: EventValueRecommendationInput,
): readonly EventValueRecommendation[] {
  if (!hasRankingInput(input)) {
    return mockEventValueRecommendations;
  }

  return [...mockEventValueRecommendations]
    .map((recommendation) => {
      const valueScore = scoreForInput(recommendation, input);

      return {
        ...recommendation,
        valueScore,
        scoreBand: scoreBand(valueScore),
      };
    })
    .sort((left, right) => right.valueScore - left.valueScore);
}

function recommendationsForInput(
  input: EventValueRecommendationInput,
): readonly EventValueRecommendation[] {
  const resolvedLimit = normalizedLimit(input.limit);
  const recommendations = rankedRecommendations(input);

  if (resolvedLimit === null) {
    return recommendations;
  }

  return recommendations.slice(0, resolvedLimit);
}

function buildRecommendationsPayload(
  input: EventValueRecommendationInput,
): EventValueRecommendationsPayload {
  const recommendations = recommendationsForInput(input);
  const evidenceIds =
    recommendations.length > 0
      ? recommendations.flatMap((recommendation) => recommendation.evidenceIds)
      : ["evidence:event-value-empty-limit"];

  return {
    ...mockEventValueRecommendationsFixture,
    state: recommendations.length > 0 ? "success" : "empty",
    recommendations,
    provenance: {
      ...mockEventValueRecommendationProvenance,
      evidenceIds: [...new Set(evidenceIds)],
      generationMethod: "rule-based-event-value",
      sourceLabel: "Mock event value scoring rule",
    },
    summary:
      recommendations.length > 0
        ? "Local rules ranked recommended events by profile goal, location, industry preference, attendee density, and calendar fit without live feeds."
        : "The local event value rule produced no event recommendations.",
    nextAction:
      recommendations.length > 0
        ? "Accept one event recommendation only after reviewing its source evidence."
        : "Adjust local mock filters before recommending events.",
  };
}

function scenarioRecommendationsResult(
  scenario: EventValueRecommendationScenario,
): EventValueRecommendationsResult | null {
  switch (scenario) {
    case "empty":
      return recommendationsSuccess(mockEmptyEventValueRecommendationsFixture);
    case "pending":
      return recommendationsSuccess(mockPendingEventValueRecommendationsFixture);
    case "failure":
      return failure("EVENT_VALUE_RECOMMENDATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioAcceptanceResult(
  scenario: EventValueRecommendationScenario,
): EventValueRecommendationAcceptanceResult | null {
  switch (scenario) {
    case "failure":
      return failure("EVENT_VALUE_RECOMMENDATION_MOCK_FAILED");
    case "pending":
      return failure("EVENT_VALUE_RECOMMENDATION_PENDING");
    case "empty":
      return failure("EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND");
    case "success":
    default:
      return null;
  }
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function findRecommendation(eventId: string): EventValueRecommendation | null {
  return (
    mockEventValueRecommendations.find(
      (recommendation) => recommendation.eventId === eventId,
    ) ?? null
  );
}

function buildAcceptancePayload(
  recommendation: EventValueRecommendation,
): EventValueRecommendationAcceptancePayload {
  if (recommendation.eventId === "demo-event-1") {
    return mockAcceptedEventValueRecommendationFixture;
  }

  return {
    state: "accepted",
    acceptedEvent: recommendation,
    action: {
      actionId: `event-value-action:${recommendation.eventId}:accept`,
      label: "Accept event value recommendation",
      generatedBy: "mock-event-value-service",
      evidenceIds: recommendation.evidenceIds,
      source: mockEventValueRecommendationSource,
      externalNetworkRequested: false,
      calendarProviderRequested: false,
      notificationDelivered: false,
      databaseWriteExecuted: false,
      productionAuditLogWriteExecuted: false,
    },
    summary:
      "The accept action records a local mock decision without writing calendars, notifications, databases, or external messages.",
    provenance: {
      ...mockEventValueRecommendationProvenance,
      sourceLabel: "Mock event value accept action",
      evidenceIds: recommendation.evidenceIds,
      generationMethod: "rule-based-acceptance",
    },
    nextAction:
      "Keep the accepted event source-backed until a live action sandbox is explicitly wired.",
  };
}

export function createMockEventValueRecommendationService(): EventValueRecommendationService {
  return {
    listRecommendedEvents(input = {}): EventValueRecommendationsResult {
      const scenarioResult = scenarioRecommendationsResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      return recommendationsSuccess(buildRecommendationsPayload(input));
    },

    acceptRecommendedEvent(
      input = {},
    ): EventValueRecommendationAcceptanceResult {
      const scenarioResult = scenarioAcceptanceResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("EVENT_VALUE_RECOMMENDATION_EVENT_ID_REQUIRED");
      }

      const recommendation = findRecommendation(eventId);

      if (!recommendation) {
        return failure("EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND");
      }

      return acceptanceSuccess(buildAcceptancePayload(recommendation));
    },
  };
}

export type {
  EventValueRecommendationAcceptanceResult,
  EventValueRecommendationsResult,
};
