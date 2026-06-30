import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Event Goal Readiness contract 描述活动前目标、准备清单和 readiness 状态。
// 当前不会调用 AI、日历、邮件或通知，只生成可复核准备建议。
export const EVENT_GOAL_READINESS_ERROR_CODES = [
  "EVENT_GOAL_READINESS_EVENT_ID_REQUIRED",
  "EVENT_GOAL_READINESS_EVENT_NOT_FOUND",
  "EVENT_GOAL_READINESS_GOAL_REQUIRED",
  "EVENT_GOAL_READINESS_PREPARATION_PENDING",
  "EVENT_GOAL_READINESS_MOCK_FAILED",
] as const;

export type EventGoalReadinessErrorCode =
  (typeof EVENT_GOAL_READINESS_ERROR_CODES)[number];

export type EventGoalReadinessScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EventGoalReadinessState = "success" | "empty" | "pending";

export type EventGoalFocus =
  | "operator_intros"
  | "storage_pilot"
  | "investor_context";

export type EventReadinessChecklistStatus = "ready" | "pending" | "blocked";

// readiness 读取、goal suggestion 和 goal set 输入分开，避免混淆读/写语义。
export interface EventGoalReadinessInput {
  eventId?: string | null;
  scenario?: EventGoalReadinessScenario | string | null;
}

export interface EventGoalSuggestionInput extends EventGoalReadinessInput {
  relationshipFocus?: EventGoalFocus | string | null;
}

export interface EventGoalSetInput extends EventGoalReadinessInput {
  goalText?: string | null;
  selectedSuggestionId?: string | null;
}

export interface EventGoalReadinessErrorDefinition {
  code: EventGoalReadinessErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// readiness 错误定义覆盖缺 event、缺 goal、准备 pending 和受控失败。
export const EVENT_GOAL_READINESS_ERROR_DEFINITIONS = {
  EVENT_GOAL_READINESS_EVENT_ID_REQUIRED: {
    code: "EVENT_GOAL_READINESS_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before reading goal readiness.",
    recovery:
      "Keep the event goal and readiness surface empty until a known local event fixture is selected.",
  },
  EVENT_GOAL_READINESS_EVENT_NOT_FOUND: {
    code: "EVENT_GOAL_READINESS_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event goal and readiness fixture matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid querying calendars, databases, email, notification, or model services.",
  },
  EVENT_GOAL_READINESS_GOAL_REQUIRED: {
    code: "EVENT_GOAL_READINESS_GOAL_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A non-empty event goal is required before updating readiness.",
    recovery:
      "Ask for a concise relationship goal before updating the local mock readiness fixture.",
  },
  EVENT_GOAL_READINESS_PREPARATION_PENDING: {
    code: "EVENT_GOAL_READINESS_PREPARATION_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock event preparation checklist is waiting for local review.",
    recovery:
      "Render the pending state and do not send reminders, query live calendars, run AI calls, or write readiness state.",
  },
  EVENT_GOAL_READINESS_MOCK_FAILED: {
    code: "EVENT_GOAL_READINESS_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event goal and readiness boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry AI, calendar, email, notification, database, or external network work.",
  },
} as const satisfies Record<
  EventGoalReadinessErrorCode,
  EventGoalReadinessErrorDefinition
>;

export type EventGoalReadinessSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  providerRecordId: string;
  generatedBy: "mock-event-goal-readiness-service";
};

// EventGoalReadinessEvent 是准备状态里的活动摘要，不触碰真实日历。
export interface EventGoalReadinessEvent {
  id: string;
  title: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  source: EventGoalReadinessSourceReference;
  calendarProviderRequested: false;
  liveCalendarRequested: false;
  liveDatabaseWriteExecuted: false;
}

// EventGoalSuggestion 是基于关系焦点的目标建议，不来自 live AI。
export interface EventGoalSuggestion {
  goalId: string;
  focus: EventGoalFocus;
  label: string;
  intent: string;
  rationale: string;
  suggestedPreparation: readonly string[];
  source: EventGoalReadinessSourceReference;
  evidenceIds: readonly string[];
  generatedBy: "mock-goal-rule";
  aiProviderRequested: false;
  externalNetworkRequested: false;
}

// EventGoalRecord 是当前活动目标的 staged 记录。
export interface EventGoalRecord {
  goalId: string;
  eventId: string;
  intent: string;
  selectedSuggestionId: string | null;
  priority: "primary";
  source: EventGoalReadinessSourceReference;
  evidenceIds: readonly string[];
  createdAt: string;
  updatedAt: string;
  generatedBy: "mock-goal-rule" | "mock-goal-form";
  aiProviderRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
}

// ReadinessChecklistItem 是可展示的准备事项，owner 表示谁负责。
export interface EventReadinessChecklistItem {
  itemId: string;
  label: string;
  status: EventReadinessChecklistStatus;
  owner: "operator" | "orbit";
  rationale: string;
  evidenceIds: readonly string[];
  source: EventGoalReadinessSourceReference;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
  liveDatabaseWriteExecuted: false;
}

// CalendarConflictCheck 是 mock 规则检查，不访问真实日历。
export interface EventCalendarConflictCheck {
  hasConflict: boolean;
  checkedWindow: string;
  checkedBy: "mock-calendar-rule";
  rationale: string;
  liveCalendarRequested: false;
  calendarProviderRequested: false;
  externalNetworkRequested: false;
}

export interface EventPreparationState {
  readinessScore: number;
  relationshipBriefStatus: "ready" | "pending";
  calendarConflictCheck: EventCalendarConflictCheck;
  preEventBriefReady: boolean;
  nextPreparationStep: string;
  source: EventGoalReadinessSourceReference;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventGoalReadinessProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-event-goal-readiness-only";
  generationMethod:
    | "fixture"
    | "rule-based-goal-suggestion"
    | "rule-based-goal-setting"
    | "rule-based-readiness-check";
  aiProviderRequested: false;
  calendarProviderRequested: false;
  liveCalendarRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventGoalReadinessPayload {
  state: EventGoalReadinessState;
  event: EventGoalReadinessEvent;
  goal: EventGoalRecord | null;
  suggestedGoals: readonly EventGoalSuggestion[];
  readinessChecklist: readonly EventReadinessChecklistItem[];
  preparationState: EventPreparationState;
  summary: string;
  provenance: EventGoalReadinessProvenance;
  nextAction: string;
}

export interface EventGoalSetPayload extends EventGoalReadinessPayload {
  state: "success";
  goal: EventGoalRecord;
  acceptedGoalText: string;
}

export interface EventGoalSuggestionsPayload {
  state: EventGoalReadinessState;
  event: EventGoalReadinessEvent;
  suggestedGoals: readonly EventGoalSuggestion[];
  summary: string;
  provenance: EventGoalReadinessProvenance;
  nextAction: string;
}

export interface EventGoalReadinessSuccess {
  success: true;
  data: EventGoalReadinessPayload;
}

export interface EventGoalSetSuccess {
  success: true;
  data: EventGoalSetPayload;
}

export interface EventGoalSuggestionsSuccess {
  success: true;
  data: EventGoalSuggestionsPayload;
}

export interface EventGoalReadinessFailure {
  success: false;
  error: EventGoalReadinessErrorDefinition & {
    state: "failure";
    provenance: EventGoalReadinessProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventGoalReadinessResult =
  | EventGoalReadinessSuccess
  | EventGoalReadinessFailure;

export type EventGoalSetResult =
  | EventGoalSetSuccess
  | EventGoalReadinessFailure;

export type EventGoalSuggestionsResult =
  | EventGoalSuggestionsSuccess
  | EventGoalReadinessFailure;

export interface EventGoalAndReadinessService {
  suggestGoals: (
    input?: EventGoalSuggestionInput,
  ) => EventGoalSuggestionsResult;
  setGoal: (input?: EventGoalSetInput) => EventGoalSetResult;
  getReadiness: (
    input?: EventGoalReadinessInput,
  ) => EventGoalReadinessResult;
}

export function eventGoalReadinessErrorToAppError(
  errorCode: EventGoalReadinessErrorCode,
): AppError {
  const definition = EVENT_GOAL_READINESS_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function eventGoalReadinessFailureToAppError(
  failure: EventGoalReadinessFailure,
): AppError {
  return eventGoalReadinessErrorToAppError(failure.error.code);
}

export function eventGoalReadinessErrorContext(
  errorCode: EventGoalReadinessErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventGoalReadinessErrorCode: errorCode,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock event goal and readiness failure came from deterministic fixture rules.",
    service: "event-goal-and-readiness-mock",
  };
}

export function eventGoalReadinessFailureContext(
  failure: EventGoalReadinessFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return eventGoalReadinessErrorContext(failure.error.code, mode);
}
