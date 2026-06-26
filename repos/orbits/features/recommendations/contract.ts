import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const EVENT_RECOMMENDATION_FIXTURE_SOURCE =
  "fixture:features/recommendations/fixtures.ts" as const;

export const EVENT_RECOMMENDATION_ERROR_CODES = [
  "EVENT_RECOMMENDATION_EVENT_ID_REQUIRED",
  "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
  "EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND",
  "EVENT_RECOMMENDATION_PENDING",
  "EVENT_RECOMMENDATION_MOCK_FAILED",
] as const;

export type EventRecommendationErrorCode =
  (typeof EVENT_RECOMMENDATION_ERROR_CODES)[number];

export type EventRecommendationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EventRecommendationState = "success" | "empty" | "pending";

export type EventRecommendationScoreBand = "high" | "medium" | "low";

export type EventOpeningLineStyle =
  | "warm_context"
  | "context_question"
  | "post_event_follow_up";

export interface EventRecommendationInput {
  eventId?: string | null;
  scenario?: EventRecommendationScenario | string | null;
  limit?: number | null;
}

export interface EventOpeningLineInput extends EventRecommendationInput {
  attendeeId?: string | null;
  style?: EventOpeningLineStyle | string | null;
}

export interface EventRecommendationErrorDefinition {
  code: EventRecommendationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const EVENT_RECOMMENDATION_ERROR_DEFINITIONS = {
  EVENT_RECOMMENDATION_EVENT_ID_REQUIRED: {
    code: "EVENT_RECOMMENDATION_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before ranking attendees.",
    recovery:
      "Keep the recommendation surface empty until a known local event fixture is selected.",
  },
  EVENT_RECOMMENDATION_EVENT_NOT_FOUND: {
    code: "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event recommendation fixture matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid querying databases, vector stores, calendars, email, model, notification, or network providers.",
  },
  EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND: {
    code: "EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND",
    appCode: "NOT_FOUND",
    message:
      "No ranked mock attendee matches the requested opening-line attendee.",
    recovery:
      "Select one of the attendee ids returned by the deterministic recommendation fixture.",
  },
  EVENT_RECOMMENDATION_PENDING: {
    code: "EVENT_RECOMMENDATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock event recommendation request is waiting for local attendee review.",
    recovery:
      "Render the pending state and do not call ranking providers, databases, vector search, model, calendar, email, or notification services.",
  },
  EVENT_RECOMMENDATION_MOCK_FAILED: {
    code: "EVENT_RECOMMENDATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event recommendation and opening-line boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry external network, database, model, calendar, email, notification, ranking, or vector providers.",
  },
} as const satisfies Record<
  EventRecommendationErrorCode,
  EventRecommendationErrorDefinition
>;

export type EventRecommendationSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  providerRecordId: string;
  generatedBy: "mock-event-recommendation-service";
};

export interface EventRecommendationEvent {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  source: EventRecommendationSourceReference;
  calendarProviderRequested: false;
  liveCalendarRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
}

export interface EventRecommendationAttendee {
  attendeeId: string;
  displayName: string;
  role: string;
  organization: string;
  relationshipContext: string;
  eventIntent: string;
  source: EventRecommendationSourceReference;
  evidenceIds: readonly string[];
  externalProfileRequested: false;
  databaseQueryExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventRecommendationMatchSignal {
  signalId: string;
  label: string;
  detail: string;
  weight: number;
  evidenceIds: readonly string[];
  source: EventRecommendationSourceReference;
  generatedBy: "mock-match-signal-rule";
  vectorSearchExecuted: false;
  embeddingGenerated: false;
  rankingProviderRequested: false;
  aiProviderRequested: false;
  externalNetworkRequested: false;
  databaseQueryExecuted: false;
}

export interface EventRecommendationOpeningLine {
  lineId: string;
  eventId: string;
  attendeeId: string;
  style: EventOpeningLineStyle;
  text: string;
  rationale: string;
  source: EventRecommendationSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-opening-line-rule";
  aiProviderRequested: false;
  externalNetworkRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventAttendeeRecommendation {
  recommendationId: string;
  eventId: string;
  attendee: EventRecommendationAttendee;
  rank: number;
  score: number;
  scoreBand: EventRecommendationScoreBand;
  reasons: readonly string[];
  matchSignals: readonly EventRecommendationMatchSignal[];
  openingLine: EventRecommendationOpeningLine;
  recommendedAction: string;
  source: EventRecommendationSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-ranking-rule";
  vectorSearchExecuted: false;
  embeddingGenerated: false;
  rankingProviderRequested: false;
  aiProviderRequested: false;
  databaseQueryExecuted: false;
  externalNetworkRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventRecommendationProvenance {
  source: typeof EVENT_RECOMMENDATION_FIXTURE_SOURCE;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-event-recommendation-only";
  generationMethod:
    | "fixture"
    | "rule-based-ranking"
    | "rule-based-opening-line"
    | "rule-based-state";
  vectorSearchExecuted: false;
  embeddingsGenerated: false;
  rankingProviderRequested: false;
  databaseQueryExecuted: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventRecommendationsPayload {
  state: EventRecommendationState;
  event: EventRecommendationEvent;
  recommendations: readonly EventAttendeeRecommendation[];
  summary: string;
  provenance: EventRecommendationProvenance;
  nextAction: string;
}

export interface EventOpeningLinePayload {
  state: "success";
  event: EventRecommendationEvent;
  recommendation: EventAttendeeRecommendation;
  openingLine: EventRecommendationOpeningLine;
  alternatives: readonly EventRecommendationOpeningLine[];
  summary: string;
  provenance: EventRecommendationProvenance;
  nextAction: string;
}

export interface EventRecommendationsSuccess {
  success: true;
  data: EventRecommendationsPayload;
}

export interface EventOpeningLineSuccess {
  success: true;
  data: EventOpeningLinePayload;
}

export interface EventRecommendationFailure {
  success: false;
  error: EventRecommendationErrorDefinition & {
    state: "failure";
    provenance: EventRecommendationProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventRecommendationsResult =
  | EventRecommendationsSuccess
  | EventRecommendationFailure;

export type EventOpeningLineResult =
  | EventOpeningLineSuccess
  | EventRecommendationFailure;

export function eventRecommendationErrorToAppError(
  errorCode: EventRecommendationErrorCode,
): AppError {
  const definition = EVENT_RECOMMENDATION_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function eventRecommendationFailureToAppError(
  failure: EventRecommendationFailure,
): AppError {
  return eventRecommendationErrorToAppError(failure.error.code);
}

export function eventRecommendationErrorContext(
  errorCode: EventRecommendationErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventRecommendationErrorCode: errorCode,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock event recommendation and opening-line failure came from deterministic fixture rules.",
    service: "event-recommendation-and-opening-line-mock",
  };
}

export function eventRecommendationFailureContext(
  failure: EventRecommendationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return eventRecommendationErrorContext(failure.error.code, mode);
}

export {
  mockEmptyEventRecommendationsFixture,
  mockEventRecommendationFailureProvenance,
  mockEventRecommendationProvenance,
  mockEventRecommendationsFixture,
  mockEventRecommendations,
  mockEventRecommendationEvent,
  mockOpeningLineFixture,
  mockPendingEventRecommendationsFixture,
} from "./fixtures";
