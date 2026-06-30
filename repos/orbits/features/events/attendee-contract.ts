import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Event Attendee Roster contract 描述活动参会人名单的只读/筛选模型。
// 当前名单来自 fixture，不请求 organizer API，也不做真实推荐写入。
export const EVENT_ATTENDEE_ROSTER_ERROR_CODES = [
  "EVENT_ATTENDEE_ROSTER_EVENT_ID_REQUIRED",
  "EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND",
  "EVENT_ATTENDEE_ROSTER_ACCESS_PENDING",
  "EVENT_ATTENDEE_ROSTER_MOCK_FAILED",
] as const;

export type EventAttendeeRosterErrorCode =
  (typeof EVENT_ATTENDEE_ROSTER_ERROR_CODES)[number];

export const EVENT_ATTENDEE_TAG_CODES = [
  "climate_operator",
  "investor_context",
  "known_contact",
  "partner_path",
  "speaker",
  "storage_pilot",
] as const;

export type EventAttendeeTagCode = (typeof EVENT_ATTENDEE_TAG_CODES)[number];

export type EventAttendeeRosterScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EventAttendeeRosterState = "success" | "empty" | "pending";
export type EventAttendeeCheckInStatus =
  | "registered"
  | "checked_in"
  | "pending";
export type EventAttendeeRole = "attendee" | "speaker" | "organizer";
export type EventAttendeeRosterAccessStatus = "available" | "empty" | "pending";

// 输入支持按 tag、known contact 和 recommendation eligibility 过滤名单。
export interface EventAttendeeRosterInput {
  eventId?: string | null;
  scenario?: EventAttendeeRosterScenario | string | null;
  tagFilter?: EventAttendeeTagCode | string | null;
  knownContactOnly?: boolean | string | null;
  eligibleOnly?: boolean | string | null;
}

export interface EventAttendeeRosterErrorDefinition {
  code: EventAttendeeRosterErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 参会人名单错误定义强调隐私/访问 pending 时不生成推荐。
export const EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS = {
  EVENT_ATTENDEE_ROSTER_EVENT_ID_REQUIRED: {
    code: "EVENT_ATTENDEE_ROSTER_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before reading the attendee roster.",
    recovery:
      "Keep the roster in the empty state until the operator selects a known local event fixture.",
  },
  EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND: {
    code: "EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event attendee roster matches that event id.",
    recovery:
      "Render the missing-event envelope and avoid querying organizer attendee APIs, databases, or external lookup providers.",
  },
  EVENT_ATTENDEE_ROSTER_ACCESS_PENDING: {
    code: "EVENT_ATTENDEE_ROSTER_ACCESS_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock attendee roster is waiting for privacy-gated access review.",
    recovery:
      "Render the pending state and do not recommend attendees until the local fixture is approved.",
  },
  EVENT_ATTENDEE_ROSTER_MOCK_FAILED: {
    code: "EVENT_ATTENDEE_ROSTER_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event attendee roster boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry organizer attendee APIs, live database writes, AI scoring, calendar, email, or notification providers.",
  },
} as const satisfies Record<
  EventAttendeeRosterErrorCode,
  EventAttendeeRosterErrorDefinition
>;

export type EventAttendeeSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  attendeeId?: string;
};

// provenance 记录名单读取没有访问 organizer feed、数据库或 AI。
export interface EventAttendeeRosterProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-event-attendee-roster-only";
  generationMethod:
    | "fixture"
    | "rule-based-roster-filter"
    | "rule-based-roster-import";
  organizerFeedRequested: false;
  privacyRosterAccessRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

// tag/known marker/eligibility 用于解释“为什么这个人出现在名单里以及能否推荐”。
export interface EventAttendeeTag {
  code: EventAttendeeTagCode;
  label: string;
  rationale: string;
}

export interface EventAttendeeKnownContactMarker {
  attendeeId: string;
  isKnownContact: boolean;
  contactId: string | null;
  matchSource: "existing-contact-fixture" | "no-known-contact-match";
  confidence: "high" | "none";
  rationale: string;
}

export interface EventAttendeeRecommendationEligibility {
  attendeeId: string;
  isEligible: boolean;
  recommendationCandidateId: string | null;
  reasons: readonly string[];
  blockedByKnownContact: boolean;
  generatedBy: "mock-attendee-roster-rules";
}

export interface EventAttendeeEventSummary {
  id: string;
  name: string;
  organizer: string;
  venue: string;
  startsAt: string;
  rosterAccessStatus: EventAttendeeRosterAccessStatus;
  source: EventAttendeeSourceReference;
  organizerFeedRequested: false;
  privacyRosterAccessRequested: false;
  liveDatabaseWriteExecuted: false;
}

export interface EventAttendeeEvidence {
  evidenceId: string;
  source: EventAttendeeSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-event-attendee-roster-service";
}

// RosterRecord 是参会人列表中的单条记录。
export interface EventAttendeeRosterRecord {
  attendeeId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  eventRole: EventAttendeeRole;
  checkInStatus: EventAttendeeCheckInStatus;
  attendeeTags: readonly EventAttendeeTag[];
  knownContactMarker: EventAttendeeKnownContactMarker;
  eligibleRecommendation: EventAttendeeRecommendationEligibility;
  relationshipContext: string;
  suggestedNextAction: string;
  source: EventAttendeeSourceReference;
  evidenceIds: readonly string[];
  organizerFeedRequested: false;
  privacyRosterAccessRequested: false;
  externalLookupExecuted: false;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventAttendeeRecommendationCandidate {
  attendeeId: string;
  recommendationCandidateId: string;
  displayName: string;
  organization: string;
  tags: readonly EventAttendeeTag[];
  reasons: readonly string[];
  source: EventAttendeeSourceReference;
  evidenceIds: readonly string[];
  aiProviderRequested: false;
  liveDatabaseWriteExecuted: false;
}

export interface EventAttendeeRosterImportBatch {
  id: string;
  eventId: string;
  stagedAt: string;
  attendeeIds: readonly string[];
  recommendationCandidateIds: readonly string[];
  organizerFeedRequested: false;
  privacyRosterAccessRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventAttendeeRosterPayload {
  state: EventAttendeeRosterState;
  event: EventAttendeeEventSummary;
  attendees: readonly EventAttendeeRosterRecord[];
  attendeeTags: readonly EventAttendeeTag[];
  knownContactMarkers: readonly EventAttendeeKnownContactMarker[];
  eligibleRecommendationPool: readonly EventAttendeeRecommendationCandidate[];
  summary: string;
  provenance: EventAttendeeRosterProvenance;
  nextAction: string;
}

export interface EventAttendeeRosterImportPayload
  extends EventAttendeeRosterPayload {
  importBatch: EventAttendeeRosterImportBatch;
}

export interface EventAttendeeRosterSuccess {
  success: true;
  data: EventAttendeeRosterPayload;
}

export interface EventAttendeeRosterImportSuccess {
  success: true;
  data: EventAttendeeRosterImportPayload;
}

export interface EventAttendeeRosterFailure {
  success: false;
  error: EventAttendeeRosterErrorDefinition & {
    state: "failure";
    provenance: EventAttendeeRosterProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventAttendeeRosterResult =
  | EventAttendeeRosterSuccess
  | EventAttendeeRosterFailure;

export type EventAttendeeRosterImportResult =
  | EventAttendeeRosterImportSuccess
  | EventAttendeeRosterFailure;

export interface EventAttendeeRosterService {
  getAttendeeRoster: (
    input?: EventAttendeeRosterInput,
  ) => EventAttendeeRosterResult;
  importAttendeeRoster: (
    input?: EventAttendeeRosterInput,
  ) => EventAttendeeRosterImportResult;
}

export function eventAttendeeRosterErrorToAppError(
  errorCode: EventAttendeeRosterErrorCode,
): AppError {
  const definition = EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function eventAttendeeRosterFailureToAppError(
  failure: EventAttendeeRosterFailure,
): AppError {
  return eventAttendeeRosterErrorToAppError(failure.error.code);
}

export function eventAttendeeRosterErrorContext(
  errorCode: EventAttendeeRosterErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventAttendeeRosterErrorCode: errorCode,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock event attendee roster failure came from deterministic fixture rules.",
    service: "event-attendee-roster-mock",
  };
}

export function eventAttendeeRosterFailureContext(
  failure: EventAttendeeRosterFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return eventAttendeeRosterErrorContext(failure.error.code, mode);
}
