import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const EVENT_ATTENDEE_IMPORT_FIXTURE_SOURCE =
  "fixture:features/acquisition/event-attendee-contract.ts" as const;

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

const fixtureCollectedAt = "2026-06-25T15:00:00.000Z";
const fixtureCreatedAt = "2026-06-25T15:07:00.000Z";

export const mockEventAttendeeSource: EventAttendeeSourceReference = {
  type: "event_import",
  id: "source:event-import:demo-event-1",
  label: "organizer roster fixture for climate founders dinner",
  eventId: "demo-event-1",
};

export const eventAttendeeRelationshipStatuses = {
  newPotentialContact: {
    code: "new_potential_contact",
    label: "New potential contact",
    rationale:
      "No existing relationship was found in the mock roster, but the event context matches current BD goals.",
    suggestedPriority: "review",
  },
  knownContact: {
    code: "known_contact",
    label: "Known contact",
    rationale:
      "The deterministic fixture marks this attendee as already known and suitable for context refresh.",
    suggestedPriority: "warm",
  },
  priorityFollowUp: {
    code: "priority_follow_up",
    label: "Priority follow-up",
    rationale:
      "Speaker role and shared event goals make this attendee a high-priority relationship review.",
    suggestedPriority: "high",
  },
  needsContext: {
    code: "needs_context",
    label: "Needs context",
    rationale:
      "The attendee can be reviewed after the operator adds relationship context.",
    suggestedPriority: "review",
  },
} as const satisfies Record<string, EventAttendeeRelationshipStatus>;

export const mockEventAttendeeImportProvenance: EventAttendeeImportProvenance =
  {
    source: EVENT_ATTENDEE_IMPORT_FIXTURE_SOURCE,
    sourceLabel: "Mock event attendee import fixture",
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-conversation-thread",
      "evidence:event-import-goal-fit",
    ],
    collectedAt: fixtureCollectedAt,
    privacy: "demo-event-attendee-import-only",
    generationMethod: "fixture",
    organizerFeedRequested: false,
    bulkDatabaseImportExecuted: false,
    externalNetworkRequested: false,
  };

export const mockEmptyEventAttendeeImportProvenance: EventAttendeeImportProvenance =
  {
    ...mockEventAttendeeImportProvenance,
    sourceLabel: "Mock empty event attendee import rule",
    evidenceIds: ["evidence:event-import-empty-roster"],
    generationMethod: "rule-based-event-attendee-import",
  };

export const mockPendingEventAttendeeImportProvenance: EventAttendeeImportProvenance =
  {
    ...mockEventAttendeeImportProvenance,
    sourceLabel: "Mock pending event attendee import rule",
    evidenceIds: ["evidence:event-import-pending-roster"],
    generationMethod: "rule-based-event-attendee-import",
  };

export const mockEventAttendeeImportFailureProvenance: EventAttendeeImportProvenance =
  {
    ...mockEventAttendeeImportProvenance,
    sourceLabel: "Mock event attendee import controlled failure rule",
    evidenceIds: ["evidence:event-import-controlled-failure"],
    generationMethod: "rule-based-event-attendee-import",
  };

export const mockEventAttendeeEvent: EventAttendeeEventSummary = {
  id: "demo-event-1",
  name: "Climate founders dinner",
  organizer: "Orbit demo events",
  venue: "Daikanyama Founders Room",
  startsAt: "2026-06-25T19:00:00.000+09:00",
  importStatus: "ready",
  source: mockEventAttendeeSource,
  organizerFeedRequested: false,
  bulkDatabaseImportExecuted: false,
};

export const mockEmptyEventAttendeeEvent: EventAttendeeEventSummary = {
  ...mockEventAttendeeEvent,
  importStatus: "empty",
};

export const mockPendingEventAttendeeEvent: EventAttendeeEventSummary = {
  ...mockEventAttendeeEvent,
  importStatus: "pending",
};

export const mockEventAttendeeEvidence: readonly EventAttendeeEvidence[] = [
  {
    evidenceId: "evidence:event-import-roster",
    source: mockEventAttendeeSource,
    sourceLabel: "Organizer roster fixture",
    excerpt:
      "Local fixture lists Aiko Mori, Luis Ortega, and Priya Shah as demo attendees.",
    capturedFields: ["displayName", "role", "organization", "eventRole"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-event-attendee-import-service",
  },
  {
    evidenceId: "evidence:event-import-conversation-thread",
    source: mockEventAttendeeSource,
    sourceLabel: "Event conversation context",
    excerpt:
      "The dinner context is climate BD, distribution partnerships, and storage pilot introductions.",
    capturedFields: ["relationshipContext", "suggestedNextAction"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-event-attendee-import-service",
  },
  {
    evidenceId: "evidence:event-import-goal-fit",
    source: mockEventAttendeeSource,
    sourceLabel: "Event goal fit",
    excerpt:
      "Mock rules label attendee relationship status from local goals and existing-contact hints.",
    capturedFields: ["relationshipStatus", "existingContactId"],
    createdAt: fixtureCreatedAt,
    createdBy: "mock-event-attendee-import-service",
  },
];

export const mockEventAttendees: readonly EventAttendeeRecord[] = [
  {
    attendeeId: "attendee:demo-1",
    displayName: "Aiko Mori",
    role: "VP Partnerships",
    organization: "Blue Harbor Climate",
    email: "aiko.mori@blueharbor.example",
    eventRole: "attendee",
    checkInStatus: "checked_in",
    relationshipStatus: eventAttendeeRelationshipStatuses.newPotentialContact,
    relationshipContext:
      "Aiko joined the climate founders dinner to discuss channel partnerships for grid resilience pilots.",
    suggestedNextAction:
      "Review Aiko as a new potential contact and ask about pilot partner coverage.",
    source: {
      ...mockEventAttendeeSource,
      attendeeId: "attendee:demo-1",
    },
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-goal-fit",
    ],
    existingContactId: null,
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  },
  {
    attendeeId: "attendee:demo-2",
    displayName: "Luis Ortega",
    role: "Partner",
    organization: "Catalyst Ventures",
    email: "luis.ortega@catalyst.example",
    eventRole: "attendee",
    checkInStatus: "registered",
    relationshipStatus: eventAttendeeRelationshipStatuses.knownContact,
    relationshipContext:
      "Luis is already known from a prior climate investor salon and appears in this roster for context refresh.",
    suggestedNextAction:
      "Refresh Luis with the dinner context before deciding whether to add a follow-up task.",
    source: {
      ...mockEventAttendeeSource,
      attendeeId: "attendee:demo-2",
    },
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-conversation-thread",
    ],
    existingContactId: "contact:luis-ortega",
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  },
  {
    attendeeId: "attendee:demo-3",
    displayName: "Priya Shah",
    role: "CEO",
    organization: "Solace Battery",
    email: "priya.shah@solace.example",
    eventRole: "speaker",
    checkInStatus: "checked_in",
    relationshipStatus: eventAttendeeRelationshipStatuses.priorityFollowUp,
    relationshipContext:
      "Priya spoke about storage reliability and maps to the current storage pilot follow-up goal.",
    suggestedNextAction:
      "Draft a post-event follow-up asking Priya about storage pilot operator introductions.",
    source: {
      ...mockEventAttendeeSource,
      attendeeId: "attendee:demo-3",
    },
    evidenceIds: [
      "evidence:event-import-roster",
      "evidence:event-import-goal-fit",
    ],
    existingContactId: null,
    importEligible: true,
    organizerFeedRequested: false,
    externalLookupExecuted: false,
    databaseWriteExecuted: false,
  },
];

export const mockEventAttendeeContactDrafts: readonly EventAttendeeContactDraft[] =
  mockEventAttendees.map((attendee, index) => ({
    id: `event-draft:demo-${index + 1}`,
    attendeeId: attendee.attendeeId,
    displayName: attendee.displayName,
    role: attendee.role,
    organization: attendee.organization,
    email: attendee.email,
    relationshipStatus: attendee.relationshipStatus,
    relationshipContext: attendee.relationshipContext,
    suggestedNextAction: attendee.suggestedNextAction,
    source: attendee.source,
    evidence: mockEventAttendeeEvidence.filter((evidence) =>
      attendee.evidenceIds.includes(evidence.evidenceId),
    ),
    provenance: mockEventAttendeeImportProvenance,
    readyForReview: true,
    contactWriteExecuted: false,
    bulkDatabaseImportExecuted: false,
    notificationDelivered: false,
  }));

export const mockEventAttendeeRosterFixture: EventAttendeeRosterPayload = {
  state: "success",
  event: mockEventAttendeeEvent,
  attendees: mockEventAttendees,
  summary:
    "Three event attendees are available from deterministic local roster fixtures with relationship status labels.",
  provenance: mockEventAttendeeImportProvenance,
  nextAction:
    "Review status labels before staging attendee-sourced contact drafts.",
};

export const mockEventAttendeeImportFixture: EventAttendeeImportPayload = {
  ...mockEventAttendeeRosterFixture,
  contactDrafts: mockEventAttendeeContactDrafts,
  summary:
    "Three attendee-sourced potential contact drafts are staged from deterministic fixtures with provenance attached.",
  nextAction:
    "Review each relationship status label before confirming any contact write.",
};

export const mockEmptyEventAttendeeRosterFixture: EventAttendeeRosterPayload = {
  state: "empty",
  event: mockEmptyEventAttendeeEvent,
  attendees: [],
  summary: "No attendees are available in the local roster fixture.",
  provenance: mockEmptyEventAttendeeImportProvenance,
  nextAction:
    "Wait for a local attendee roster fixture before staging contact drafts.",
};

export const mockEmptyEventAttendeeImportFixture: EventAttendeeImportPayload = {
  ...mockEmptyEventAttendeeRosterFixture,
  contactDrafts: [],
};

export const mockPendingEventAttendeeRosterFixture: EventAttendeeRosterPayload =
  {
    state: "pending",
    event: mockPendingEventAttendeeEvent,
    attendees: [],
    summary:
      "The mock attendee roster is pending local review before import candidates can be staged.",
    provenance: mockPendingEventAttendeeImportProvenance,
    nextAction:
      "Wait for mock roster review before importing event attendee drafts.",
  };

export const mockPendingEventAttendeeImportFixture: EventAttendeeImportPayload =
  {
    ...mockPendingEventAttendeeRosterFixture,
    contactDrafts: [],
  };

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
