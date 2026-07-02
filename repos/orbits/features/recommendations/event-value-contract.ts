import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Event Value Recommendation contract 描述“哪些活动值得参加”的推荐模型。
// 当前基于 fixture/rule 评分，不调用实时活动发现 feed、日历同步或 AI。
export const EVENT_VALUE_RECOMMENDATION_ERROR_CODES = [
  "EVENT_VALUE_RECOMMENDATION_EVENT_ID_REQUIRED",
  "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
  "EVENT_VALUE_RECOMMENDATION_PENDING",
  "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
  "EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
] as const;

export type EventValueRecommendationErrorCode =
  (typeof EVENT_VALUE_RECOMMENDATION_ERROR_CODES)[number];

export type EventValueRecommendationScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EventValueRecommendationState = "success" | "empty" | "pending";

export type EventValueRecommendationScoreBand = "high" | "medium" | "low";

export type EventValueRecommendationCalendarFit =
  | "open"
  | "tight"
  | "conflict";

// recommendation 输入用 profile 目标、地点、行业和 calendar fit 过滤/评分活动。
export interface EventValueRecommendationInput {
  profileGoal?: string | null;
  location?: string | null;
  industryPreference?: string | null;
  calendarFit?: EventValueRecommendationCalendarFit | string | null;
  scenario?: EventValueRecommendationScenario | string | null;
  limit?: number | null;
}

export interface AcceptEventValueRecommendationInput {
  eventId?: string | null;
  scenario?: EventValueRecommendationScenario | string | null;
}

export interface EventValueRecommendationErrorDefinition {
  code: EventValueRecommendationErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 错误定义确保接受推荐前必须有 eventId，pending 时不访问真实 feed/provider。
export const EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS = {
  EVENT_VALUE_RECOMMENDATION_EVENT_ID_REQUIRED: {
    code: "EVENT_VALUE_RECOMMENDATION_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before accepting an event recommendation.",
    recovery:
      "Keep the accept action disabled until a known local event value fixture is selected.",
  },
  EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND: {
    code: "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event value recommendation fixture matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid querying databases, calendars, email, AI providers, notifications, feeds, or external networks.",
  },
  EVENT_VALUE_RECOMMENDATION_PENDING: {
    code: "EVENT_VALUE_RECOMMENDATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock event value recommendation request is waiting for local calendar-fit review.",
    recovery:
      "Render the pending state and do not call calendar, email, notification, database, event feed, network, or AI provider services.",
  },
  EVENT_VALUE_RECOMMENDATION_MOCK_FAILED: {
    code: "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event value recommendation boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry external network, database, AI provider, calendar, email, notification, or live event discovery feed services.",
  },
  EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED: {
    code: "EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live event value recommendation store is not configured.",
    recovery:
      "Configure an event value live-store provider before running live event value recommendations, or switch the capability back to mock or hybrid mode.",
  },
} as const satisfies Record<
  EventValueRecommendationErrorCode,
  EventValueRecommendationErrorDefinition
>;

export type EventValueRecommendationSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  providerRecordId: string;
  generatedBy: "mock-event-value-service" | "live-store-query";
};

// Factors 和 Signal 解释活动分数由哪些维度贡献。
export interface EventValueRecommendationProfile {
  profileId: string;
  goal: string;
  location: string;
  industryPreference: string;
  calendarFit: EventValueRecommendationCalendarFit;
  source: EventValueRecommendationSourceReference;
  evidenceIds: readonly string[];
}

export interface EventValueRecommendationFactors {
  profileGoal: number;
  location: number;
  industryPreference: number;
  attendeeDensity: number;
  calendarFit: number;
}

export interface EventValueRecommendationSignal {
  signalId: string;
  label: string;
  detail: string;
  factor: keyof EventValueRecommendationFactors;
  weight: number;
  evidenceIds: readonly string[];
  source: EventValueRecommendationSourceReference;
  generatedBy: "mock-event-value-rule" | "live-event-value-rule";
  liveEventDiscoveryFeedRequested: false;
  calendarProviderRequested: false;
  databaseQueryExecuted: boolean;
  aiProviderRequested: false;
  externalNetworkRequested: false;
}

// Recommendation 是可复核建议，不代表自动报名或写日历。
export interface EventValueRecommendation {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  venue: string;
  industry: string;
  attendeeDensity: number;
  calendarFit: EventValueRecommendationCalendarFit;
  valueScore: number;
  scoreBand: EventValueRecommendationScoreBand;
  factors: EventValueRecommendationFactors;
  signals: readonly EventValueRecommendationSignal[];
  recommendedAction: string;
  source: EventValueRecommendationSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-event-value-rule" | "live-store-event-value";
  calendarAvailabilitySynced: false;
  liveEventDiscoveryFeedRequested: false;
  externalNetworkRequested: false;
  databaseQueryExecuted: boolean;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// provenance 记录没有日历同步、活动发现 feed 或 AI 调用；live 模式只允许数据库查询。
export interface EventValueRecommendationProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy:
    | "demo-event-value-recommendation-only"
    | "live-event-value-recommendation-only";
  generationMethod:
    | "fixture"
    | "rule-based-event-value"
    | "rule-based-acceptance"
    | "rule-based-state"
    | "live-store-event-value"
    | "live-store-acceptance";
  calendarProviderRequested: false;
  calendarAvailabilitySynced: false;
  liveEventDiscoveryFeedRequested: false;
  databaseQueryExecuted: boolean;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
  externalNetworkRequested: false;
  deviceRequested: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventValueRecommendationsPayload {
  state: EventValueRecommendationState;
  profile: EventValueRecommendationProfile;
  recommendations: readonly EventValueRecommendation[];
  summary: string;
  provenance: EventValueRecommendationProvenance;
  nextAction: string;
}

export interface EventValueRecommendationAcceptanceAction {
  actionId: string;
  label: string;
  generatedBy: "mock-event-value-service" | "live-event-value-service";
  evidenceIds: readonly string[];
  source: EventValueRecommendationSourceReference;
  externalNetworkRequested: false;
  calendarProviderRequested: false;
  notificationDelivered: false;
  databaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
}

export interface EventValueRecommendationAcceptancePayload {
  state: "accepted";
  acceptedEvent: EventValueRecommendation;
  action: EventValueRecommendationAcceptanceAction;
  summary: string;
  provenance: EventValueRecommendationProvenance;
  nextAction: string;
}

export interface EventValueRecommendationsSuccess {
  success: true;
  data: EventValueRecommendationsPayload;
}

export interface EventValueRecommendationAcceptanceSuccess {
  success: true;
  data: EventValueRecommendationAcceptancePayload;
}

export interface EventValueRecommendationFailure {
  success: false;
  error: EventValueRecommendationErrorDefinition & {
    state: "failure";
    provenance: EventValueRecommendationProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventValueRecommendationsResult =
  | EventValueRecommendationsSuccess
  | EventValueRecommendationFailure;

export type EventValueRecommendationAcceptanceResult =
  | EventValueRecommendationAcceptanceSuccess
  | EventValueRecommendationFailure;

export type EventValueRecommendationServiceResult<TResult> =
  | TResult
  | Promise<TResult>;

export interface EventValueRecommendationService {
  listRecommendedEvents: (
    input?: EventValueRecommendationInput,
  ) => EventValueRecommendationServiceResult<EventValueRecommendationsResult>;
  acceptRecommendedEvent: (
    input?: AcceptEventValueRecommendationInput,
  ) => EventValueRecommendationServiceResult<EventValueRecommendationAcceptanceResult>;
}

export function eventValueRecommendationErrorToAppError(
  errorCode: EventValueRecommendationErrorCode,
): AppError {
  const definition = EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function eventValueRecommendationFailureToAppError(
  failure: EventValueRecommendationFailure,
): AppError {
  return eventValueRecommendationErrorToAppError(failure.error.code);
}

export function eventValueRecommendationErrorContext(
  errorCode: EventValueRecommendationErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  const isLiveStoreError =
    errorCode === "EVENT_VALUE_RECOMMENDATION_LIVE_STORE_UNCONFIGURED";

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventValueRecommendationErrorCode: errorCode,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      isLiveStoreError
        ? "Live event value recommendation failure came from the configured live provider boundary."
        : "Mock event value recommendation failure came from deterministic fixture rules.",
    service: isLiveStoreError
      ? "event-value-recommendation"
      : "event-value-recommendation-mock",
  };
}

export function eventValueRecommendationFailureContext(
  failure: EventValueRecommendationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return eventValueRecommendationErrorContext(failure.error.code, mode);
}
