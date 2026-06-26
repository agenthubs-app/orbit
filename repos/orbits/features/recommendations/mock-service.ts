import {
  EVENT_RECOMMENDATION_ERROR_DEFINITIONS,
  type EventAttendeeRecommendation,
  type EventOpeningLineInput,
  type EventOpeningLinePayload,
  type EventOpeningLineResult,
  type EventOpeningLineStyle,
  type EventRecommendationErrorCode,
  type EventRecommendationFailure,
  type EventRecommendationInput,
  type EventRecommendationScenario,
  type EventRecommendationsPayload,
  type EventRecommendationsResult,
} from "./contract";
import {
  mockEmptyEventRecommendationsFixture,
  mockEventRecommendationFailureProvenance,
  mockEventRecommendationProvenance,
  mockEventRecommendations,
  mockEventRecommendationsFixture,
  mockOpeningLineFixture,
  mockPendingEventRecommendationsFixture,
} from "./fixtures";
import type { EventRecommendationService } from "./service";

const defaultEventId = "demo-event-1";

const supportedScenarios = new Set<EventRecommendationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedOpeningLineStyles = new Set<EventOpeningLineStyle>([
  "warm_context",
  "context_question",
  "post_event_follow_up",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function recommendationsSuccess(
  data: EventRecommendationsPayload,
): EventRecommendationsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function openingLineSuccess(
  data: EventOpeningLinePayload,
): EventOpeningLineResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: EventRecommendationErrorCode,
): EventRecommendationFailure {
  const definition = EVENT_RECOMMENDATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventRecommendationFailureProvenance,
      evidenceIds: mockEventRecommendationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventRecommendationInput["scenario"],
): EventRecommendationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventRecommendationScenario)
  ) {
    return scenario as EventRecommendationScenario;
  }

  return "success";
}

function normalizeEventId(eventId?: string | null): string {
  if (eventId === undefined) {
    return defaultEventId;
  }

  return eventId?.trim() ?? "";
}

function eventFailure(
  input: EventRecommendationInput,
): EventRecommendationFailure | null {
  const eventId = normalizeEventId(input.eventId);

  if (!eventId) {
    return failure("EVENT_RECOMMENDATION_EVENT_ID_REQUIRED");
  }

  if (eventId !== defaultEventId) {
    return failure("EVENT_RECOMMENDATION_EVENT_NOT_FOUND");
  }

  return null;
}

function scenarioRecommendationsResult(
  scenario: EventRecommendationScenario,
): EventRecommendationsResult | null {
  switch (scenario) {
    case "empty":
      return recommendationsSuccess(mockEmptyEventRecommendationsFixture);
    case "pending":
      return recommendationsSuccess(mockPendingEventRecommendationsFixture);
    case "failure":
      return failure("EVENT_RECOMMENDATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioOpeningLineResult(
  scenario: EventRecommendationScenario,
): EventOpeningLineResult | null {
  switch (scenario) {
    case "failure":
      return failure("EVENT_RECOMMENDATION_MOCK_FAILED");
    case "pending":
      return failure("EVENT_RECOMMENDATION_PENDING");
    case "empty":
      return failure("EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND");
    case "success":
    default:
      return null;
  }
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function recommendationsForLimit(
  limit?: number | null,
): readonly EventAttendeeRecommendation[] {
  const resolvedLimit = normalizedLimit(limit);

  if (resolvedLimit === null) {
    return mockEventRecommendations;
  }

  return mockEventRecommendations.slice(0, resolvedLimit);
}

function buildRecommendationsPayload(
  input: EventRecommendationInput,
): EventRecommendationsPayload {
  const recommendations = recommendationsForLimit(input.limit);
  const evidenceIds =
    recommendations.length > 0
      ? recommendations.flatMap((recommendation) => recommendation.evidenceIds)
      : ["evidence:event-recommendation-empty-limit"];

  return {
    ...mockEventRecommendationsFixture,
    state: recommendations.length > 0 ? "success" : "empty",
    recommendations,
    provenance: {
      ...mockEventRecommendationProvenance,
      evidenceIds: [...new Set(evidenceIds)],
      generationMethod: "rule-based-ranking",
      sourceLabel: "Mock event recommendation ranking rule",
    },
    summary:
      recommendations.length > 0
        ? "Local ranking rules returned source-backed attendee recommendations without live ranking, vector, or model calls."
        : "The local ranking limit produced no attendee recommendations.",
    nextAction:
      recommendations.length > 0
        ? "Review the top recommendation before using its opening line."
        : "Increase the local mock limit or review attendees before composing recommendations.",
  };
}

function defaultRecommendation(): EventAttendeeRecommendation {
  return mockEventRecommendations[0];
}

function findRecommendation(
  attendeeId?: string | null,
): EventAttendeeRecommendation | null {
  const normalizedAttendeeId = attendeeId?.trim();

  if (!normalizedAttendeeId) {
    return defaultRecommendation();
  }

  return (
    mockEventRecommendations.find(
      (recommendation) =>
        recommendation.attendee.attendeeId === normalizedAttendeeId,
    ) ?? null
  );
}

function normalizeOpeningLineStyle(
  style: EventOpeningLineInput["style"],
  recommendation: EventAttendeeRecommendation,
): EventOpeningLineStyle {
  if (style && supportedOpeningLineStyles.has(style as EventOpeningLineStyle)) {
    return style as EventOpeningLineStyle;
  }

  return recommendation.openingLine.style;
}

function firstName(displayName: string): string {
  return displayName.split(" ")[0] ?? displayName;
}

function openingLineText(
  recommendation: EventAttendeeRecommendation,
  style: EventOpeningLineStyle,
): string {
  const name = firstName(recommendation.attendee.displayName);

  if (style === "context_question") {
    return `${name}, I saw your work at ${recommendation.attendee.organization} in the climate dinner context. What would make a founder intro worth doing after this event?`;
  }

  if (style === "post_event_follow_up") {
    return `${name}, after the climate dinner I want to keep the follow-up source-backed. Which event note would make this conversation useful to revisit?`;
  }

  return recommendation.openingLine.text;
}

function buildOpeningLinePayload(
  input: EventOpeningLineInput,
): EventOpeningLineResult {
  const recommendation = findRecommendation(input.attendeeId);

  if (!recommendation) {
    return failure("EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND");
  }

  const style = normalizeOpeningLineStyle(input.style, recommendation);

  if (
    recommendation.recommendationId ===
      mockOpeningLineFixture.recommendation.recommendationId &&
    style === mockOpeningLineFixture.openingLine.style
  ) {
    return openingLineSuccess(mockOpeningLineFixture);
  }

  const openingLine = {
    ...recommendation.openingLine,
    lineId: `${recommendation.openingLine.lineId}:${style}`,
    style,
    text: openingLineText(recommendation, style),
  };

  return openingLineSuccess({
    state: "success",
    event: mockOpeningLineFixture.event,
    recommendation: {
      ...recommendation,
      openingLine,
    },
    openingLine,
    alternatives: mockEventRecommendations
      .filter((item) => item.recommendationId !== recommendation.recommendationId)
      .map((item) => item.openingLine),
    summary:
      "The opening line is assembled by deterministic rules from the selected attendee recommendation.",
    provenance: {
      ...mockEventRecommendationProvenance,
      evidenceIds: openingLine.evidenceIds,
      generationMethod: "rule-based-opening-line",
      sourceLabel: "Mock event opening-line rule",
    },
    nextAction:
      "Review the line and keep evidence attached before any external message action.",
  });
}

export function createMockEventRecommendationService(): EventRecommendationService {
  return {
    listEventRecommendations(input = {}): EventRecommendationsResult {
      const scenarioResult = scenarioRecommendationsResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return recommendationsSuccess(buildRecommendationsPayload(input));
    },

    composeOpeningLine(input = {}): EventOpeningLineResult {
      const scenarioResult = scenarioOpeningLineResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const eventFailureResult = eventFailure(input);

      if (eventFailureResult) {
        return eventFailureResult;
      }

      return buildOpeningLinePayload(input);
    },
  };
}

export type { EventOpeningLineResult, EventRecommendationsResult };
