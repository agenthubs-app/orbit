import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const EVENT_GOAL_READINESS_FIXTURE_SOURCE =
  "fixture:features/events/goal-contract.ts" as const;

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

const fixtureCollectedAt = "2026-06-25T19:10:00.000Z";
const fixtureUpdatedAt = "2026-06-25T19:18:00.000Z";

export const mockEventGoalReadinessSource: EventGoalReadinessSourceReference = {
  type: "event_import",
  id: "source:event-goal-readiness:demo-event-1",
  label: "local event goal and readiness fixture",
  eventId: "demo-event-1",
  providerRecordId: "mock-event-goal-readiness:climate-founders-dinner",
  generatedBy: "mock-event-goal-readiness-service",
};

export const mockEventGoalReadinessEvent: EventGoalReadinessEvent = {
  id: "demo-event-1",
  title: "Climate founders dinner",
  venue: "Kanda Founders Table",
  startsAt: "2026-06-28T10:30:00.000Z",
  endsAt: "2026-06-28T13:00:00.000Z",
  source: mockEventGoalReadinessSource,
  calendarProviderRequested: false,
  liveCalendarRequested: false,
  liveDatabaseWriteExecuted: false,
};

export const mockEventGoalSuggestions: readonly EventGoalSuggestion[] = [
  {
    goalId: "goal-suggestion:operator-intros",
    focus: "operator_intros",
    label: "Meet two climate operators",
    intent:
      "Meet two climate operators who can validate storage-pilot partnerships.",
    rationale:
      "The event fixture overlaps with operator attendees and the active storage pilot relationship context.",
    suggestedPreparation: [
      "Review known operator relationships before arrival.",
      "Prepare a partner-path question for each new operator conversation.",
    ],
    source: mockEventGoalReadinessSource,
    evidenceIds: [
      "evidence:event-goal-attendee-overlap",
      "evidence:event-goal-storage-context",
    ],
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
  {
    goalId: "goal-suggestion:storage-pilot",
    focus: "storage_pilot",
    label: "Storage pilot validation",
    intent:
      "Validate one storage pilot pain point with a founder or operator before the follow-up window closes.",
    rationale:
      "Local fixture rules connect the dinner to storage pilot operators and partner-path contacts.",
    suggestedPreparation: [
      "Carry the storage pilot case note into the event brief.",
      "Mark one follow-up owner before leaving the venue.",
    ],
    source: mockEventGoalReadinessSource,
    evidenceIds: ["evidence:event-goal-storage-context"],
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
  {
    goalId: "goal-suggestion:investor-context",
    focus: "investor_context",
    label: "Investor context mapping",
    intent:
      "Map which investor introductions should wait until there is stronger operator evidence.",
    rationale:
      "The event fixture includes operator investors, but the recommended preparation keeps evidence before outreach.",
    suggestedPreparation: [
      "Review current investor relationship context.",
      "Capture source notes before recommending introductions.",
    ],
    source: mockEventGoalReadinessSource,
    evidenceIds: ["evidence:event-goal-investor-context"],
    generatedBy: "mock-goal-rule",
    aiProviderRequested: false,
    externalNetworkRequested: false,
  },
];

export const mockEventGoalRecord: EventGoalRecord = {
  goalId: "goal:demo-event-1:operator-intros",
  eventId: "demo-event-1",
  intent:
    "Meet two climate operators who can validate storage-pilot partnerships.",
  selectedSuggestionId: "goal-suggestion:operator-intros",
  priority: "primary",
  source: mockEventGoalReadinessSource,
  evidenceIds: [
    "evidence:event-goal-attendee-overlap",
    "evidence:event-goal-storage-context",
  ],
  createdAt: fixtureUpdatedAt,
  updatedAt: fixtureUpdatedAt,
  generatedBy: "mock-goal-rule",
  aiProviderRequested: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
};

export const mockEventReadinessChecklist: readonly EventReadinessChecklistItem[] =
  [
    {
      itemId: "readiness:relationship-brief",
      label: "Relationship brief reviewed",
      status: "ready",
      owner: "operator",
      rationale:
        "Local evidence includes the operator context needed before new introductions.",
      evidenceIds: ["evidence:event-goal-attendee-overlap"],
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
    {
      itemId: "readiness:event-goal",
      label: "Event goal selected",
      status: "ready",
      owner: "operator",
      rationale:
        "A primary event goal is set from deterministic local suggestions.",
      evidenceIds: mockEventGoalRecord.evidenceIds,
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
    {
      itemId: "readiness:follow-up-owner",
      label: "Follow-up owner confirmed",
      status: "pending",
      owner: "operator",
      rationale:
        "The mock keeps follow-up ownership pending so the operator can confirm it before the event.",
      evidenceIds: ["evidence:event-goal-follow-up-owner"],
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
    {
      itemId: "readiness:calendar-conflict",
      label: "Calendar conflict checked locally",
      status: "ready",
      owner: "orbit",
      rationale:
        "A deterministic local rule says the fixture has no time conflict.",
      evidenceIds: ["evidence:event-goal-calendar-rule"],
      source: mockEventGoalReadinessSource,
      aiProviderRequested: false,
      calendarProviderRequested: false,
      emailProviderRequested: false,
      notificationDelivered: false,
      liveDatabaseWriteExecuted: false,
    },
  ];

export const mockEventPreparationState: EventPreparationState = {
  readinessScore: 75,
  relationshipBriefStatus: "ready",
  calendarConflictCheck: {
    hasConflict: false,
    checkedWindow: "2026-06-28T10:30:00.000Z/2026-06-28T13:00:00.000Z",
    checkedBy: "mock-calendar-rule",
    rationale:
      "The mock calendar rule checks only the local fixture window and finds no conflict.",
    liveCalendarRequested: false,
    calendarProviderRequested: false,
    externalNetworkRequested: false,
  },
  preEventBriefReady: true,
  nextPreparationStep:
    "Confirm the follow-up owner before using this goal in product event prep.",
  source: mockEventGoalReadinessSource,
  aiProviderRequested: false,
  calendarProviderRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEventGoalReadinessProvenance: EventGoalReadinessProvenance = {
  source: EVENT_GOAL_READINESS_FIXTURE_SOURCE,
  sourceLabel: "Mock event goal and readiness fixture",
  evidenceIds: [
    "evidence:event-goal-attendee-overlap",
    "evidence:event-goal-storage-context",
    "evidence:event-goal-calendar-rule",
    "evidence:event-goal-follow-up-owner",
  ],
  collectedAt: fixtureCollectedAt,
  privacy: "demo-event-goal-readiness-only",
  generationMethod: "fixture",
  aiProviderRequested: false,
  calendarProviderRequested: false,
  liveCalendarRequested: false,
  liveDatabaseWriteExecuted: false,
  externalNetworkRequested: false,
  emailProviderRequested: false,
  notificationDelivered: false,
};

export const mockEmptyEventGoalReadinessProvenance: EventGoalReadinessProvenance =
  {
    ...mockEventGoalReadinessProvenance,
    sourceLabel: "Mock empty event goal and readiness rule",
    evidenceIds: ["evidence:event-goal-empty"],
    generationMethod: "rule-based-readiness-check",
  };

export const mockPendingEventGoalReadinessProvenance: EventGoalReadinessProvenance =
  {
    ...mockEventGoalReadinessProvenance,
    sourceLabel: "Mock pending event goal and readiness rule",
    evidenceIds: ["evidence:event-goal-pending"],
    generationMethod: "rule-based-readiness-check",
  };

export const mockEventGoalReadinessFailureProvenance: EventGoalReadinessProvenance =
  {
    ...mockEventGoalReadinessProvenance,
    sourceLabel: "Mock event goal and readiness controlled failure rule",
    evidenceIds: ["evidence:event-goal-controlled-failure"],
    generationMethod: "rule-based-readiness-check",
  };

export const mockEventGoalReadinessFixture: EventGoalReadinessPayload = {
  state: "success",
  event: mockEventGoalReadinessEvent,
  goal: mockEventGoalRecord,
  suggestedGoals: mockEventGoalSuggestions,
  readinessChecklist: mockEventReadinessChecklist,
  preparationState: mockEventPreparationState,
  summary:
    "Local rules produce event goals, readiness items, and preparation state for the climate dinner without live provider calls.",
  provenance: mockEventGoalReadinessProvenance,
  nextAction:
    "Confirm the pending follow-up owner before using this goal in product event prep.",
};

export const mockEmptyEventGoalReadinessFixture: EventGoalReadinessPayload = {
  state: "empty",
  event: mockEventGoalReadinessEvent,
  goal: null,
  suggestedGoals: [],
  readinessChecklist: [],
  preparationState: {
    ...mockEventPreparationState,
    readinessScore: 0,
    relationshipBriefStatus: "pending",
    preEventBriefReady: false,
    nextPreparationStep:
      "Set a local mock goal before composing pre-event preparation.",
  },
  summary:
    "No event goal has been selected in the local mock readiness scenario.",
  provenance: mockEmptyEventGoalReadinessProvenance,
  nextAction:
    "Set a local mock goal before composing pre-event preparation.",
};

export const mockPendingEventGoalReadinessFixture: EventGoalReadinessPayload = {
  state: "pending",
  event: mockEventGoalReadinessEvent,
  goal: mockEventGoalRecord,
  suggestedGoals: mockEventGoalSuggestions,
  readinessChecklist: mockEventReadinessChecklist.map((item) =>
    item.itemId === "readiness:follow-up-owner"
      ? item
      : {
          ...item,
          status: "pending",
        },
  ),
  preparationState: {
    ...mockEventPreparationState,
    readinessScore: 40,
    relationshipBriefStatus: "pending",
    preEventBriefReady: false,
    nextPreparationStep:
      "Review the local event brief before confirming readiness.",
  },
  summary:
    "The local readiness fixture is waiting for operator review before event preparation is ready.",
  provenance: mockPendingEventGoalReadinessProvenance,
  nextAction:
    "Review the local event brief before confirming readiness.",
};

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
