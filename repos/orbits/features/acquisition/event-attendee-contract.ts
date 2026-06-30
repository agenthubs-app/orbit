import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

// Event Attendee Import contract 描述从活动名单生成联系人候选人的 mock 流程。
// 它不会查询真实 organizer feed，也不会批量写入联系人数据库。
export const EVENT_ATTENDEE_IMPORT_ERROR_CODES = [
  "EVENT_ATTENDEE_EVENT_ID_REQUIRED",
  "EVENT_ATTENDEE_EVENT_NOT_FOUND",
  "EVENT_ATTENDEE_IMPORT_PENDING",
  "EVENT_ATTENDEE_IMPORT_MOCK_FAILED",
] as const;

export type EventAttendeeImportErrorCode =
  (typeof EVENT_ATTENDEE_IMPORT_ERROR_CODES)[number];

export const EVENT_ATTENDEE_RELATIONSHIP_STATUS_CODES = [
  "new_potential_contact",
  "known_contact",
  "priority_follow_up",
  "needs_context",
] as const;

export type EventAttendeeRelationshipStatusCode =
  (typeof EVENT_ATTENDEE_RELATIONSHIP_STATUS_CODES)[number];

export type EventAttendeeImportScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EventAttendeeImportState = "success" | "empty" | "pending";
export type EventAttendeeCheckInStatus =
  | "registered"
  | "checked_in"
  | "pending";
export type EventAttendeeRole = "attendee" | "speaker" | "organizer";
export type EventAttendeeImportStatus = "ready" | "empty" | "pending";

// 输入以 eventId 为中心，可按关系状态过滤候选人。
export interface EventAttendeeImportInput {
  eventId?: string | null;
  scenario?: EventAttendeeImportScenario | string | null;
  relationshipStatusFilter?: EventAttendeeRelationshipStatusCode | string | null;
}

export interface EventAttendeeImportErrorDefinition {
  code: EventAttendeeImportErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

// 活动名单导入失败必须停留在 fixture 边界，不触发真实导入或外部查询。
export const EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS = {
  EVENT_ATTENDEE_EVENT_ID_REQUIRED: {
    code: "EVENT_ATTENDEE_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before importing event attendees.",
    recovery:
      "Keep the import in the empty state until the operator chooses a known event roster.",
  },
  EVENT_ATTENDEE_EVENT_NOT_FOUND: {
    code: "EVENT_ATTENDEE_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event attendee roster matches that event id.",
    recovery:
      "Show the missing-event failure envelope and avoid querying organizer systems or databases.",
  },
  EVENT_ATTENDEE_IMPORT_PENDING: {
    code: "EVENT_ATTENDEE_IMPORT_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock event attendee roster is still pending local fixture review.",
    recovery:
      "Render the pending state and do not stage contact drafts until the mock roster is ready.",
  },
  EVENT_ATTENDEE_IMPORT_MOCK_FAILED: {
    code: "EVENT_ATTENDEE_IMPORT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event attendee import boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the failure state and avoid retrying organizer feeds, live imports, databases, AI, calendar, email, or notification work.",
  },
} as const satisfies Record<
  EventAttendeeImportErrorCode,
  EventAttendeeImportErrorDefinition
>;

export type EventAttendeeSourceReference = SourceReferenceDTO & {
  type: "event_import";
  label: string;
  eventId: string;
  attendeeId?: string;
};

// provenance 说明没有 organizer feed 请求、没有 bulk database import。
export interface EventAttendeeImportProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-event-attendee-import-only";
  generationMethod: "fixture" | "rule-based-event-attendee-import";
  organizerFeedRequested: false;
  bulkDatabaseImportExecuted: false;
  externalNetworkRequested: false;
}

// relationship status 用于解释参会人为什么值得导入或优先跟进。
export interface EventAttendeeRelationshipStatus {
  code: EventAttendeeRelationshipStatusCode;
  label: string;
  rationale: string;
  suggestedPriority: "review" | "warm" | "high";
}

export interface EventAttendeeEventSummary {
  id: string;
  name: string;
  organizer: string;
  venue: string;
  startsAt: string;
  importStatus: EventAttendeeImportStatus;
  source: EventAttendeeSourceReference;
  organizerFeedRequested: false;
  bulkDatabaseImportExecuted: false;
}

export interface EventAttendeeEvidence {
  evidenceId: string;
  source: EventAttendeeSourceReference;
  sourceLabel: string;
  excerpt: string;
  capturedFields: readonly string[];
  createdAt: string;
  createdBy: "mock-event-attendee-import-service";
}

// EventAttendeeRecord 是单个参会人候选 DTO，importEligible 只表示可进入复核。
export interface EventAttendeeRecord {
  attendeeId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  eventRole: EventAttendeeRole;
  checkInStatus: EventAttendeeCheckInStatus;
  relationshipStatus: EventAttendeeRelationshipStatus;
  relationshipContext: string;
  suggestedNextAction: string;
  source: EventAttendeeSourceReference;
  evidenceIds: readonly string[];
  existingContactId: string | null;
  importEligible: true;
  organizerFeedRequested: false;
  externalLookupExecuted: false;
  databaseWriteExecuted: false;
}

export interface EventAttendeeContactDraft {
  id: string;
  attendeeId: string;
  displayName: string;
  role: string;
  organization: string;
  email: string;
  relationshipStatus: EventAttendeeRelationshipStatus;
  relationshipContext: string;
  suggestedNextAction: string;
  source: EventAttendeeSourceReference;
  evidence: readonly EventAttendeeEvidence[];
  provenance: EventAttendeeImportProvenance;
  readyForReview: true;
  contactWriteExecuted: false;
  bulkDatabaseImportExecuted: false;
  notificationDelivered: false;
}

export interface EventAttendeeRosterPayload {
  state: EventAttendeeImportState;
  event: EventAttendeeEventSummary;
  attendees: readonly EventAttendeeRecord[];
  summary: string;
  provenance: EventAttendeeImportProvenance;
  nextAction: string;
}

export interface EventAttendeeImportPayload
  extends EventAttendeeRosterPayload {
  contactDrafts: readonly EventAttendeeContactDraft[];
}

export interface EventAttendeeRosterSuccess {
  success: true;
  data: EventAttendeeRosterPayload;
}

export interface EventAttendeeImportSuccess {
  success: true;
  data: EventAttendeeImportPayload;
}

export interface EventAttendeeImportFailure {
  success: false;
  error: EventAttendeeImportErrorDefinition & {
    state: "failure";
    provenance: EventAttendeeImportProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventAttendeeRosterResult =
  | EventAttendeeRosterSuccess
  | EventAttendeeImportFailure;

export type EventAttendeeImportResult =
  | EventAttendeeImportSuccess
  | EventAttendeeImportFailure;

export interface EventAttendeeImportService {
  listEventAttendees: (
    input?: EventAttendeeImportInput,
  ) => EventAttendeeRosterResult;
  importEventAttendees: (
    input?: EventAttendeeImportInput,
  ) => EventAttendeeImportResult;
}

export function eventAttendeeImportFailureToAppError(
  failure: EventAttendeeImportFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function eventAttendeeImportFailureContext(
  failure: EventAttendeeImportFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventAttendeeImportErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock event attendee import failure came from deterministic fixture rules.",
    service: "event-attendee-import-mock",
  };
}
