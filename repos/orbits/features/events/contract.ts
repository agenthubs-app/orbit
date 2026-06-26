import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type { SourceReferenceDTO } from "../../shared/domain/source-types";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const EVENT_CRUD_IMPORT_FIXTURE_SOURCE =
  "fixture:features/events/fixtures.ts" as const;

export const EVENT_STATUS_VALUES = [
  "draft",
  "confirmed",
  "imported",
  "pending_import",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUS_VALUES)[number];

export const EVENT_SOURCE_CAPTURE_METHODS = [
  "manual_form",
  "calendar_sync_fixture",
  "organizer_feed_fixture",
] as const;

export type EventCaptureMethod =
  (typeof EVENT_SOURCE_CAPTURE_METHODS)[number];

export const EVENT_CRUD_AND_IMPORT_ERROR_CODES = [
  "EVENTS_EVENT_ID_REQUIRED",
  "EVENTS_EVENT_NOT_FOUND",
  "EVENTS_REQUEST_BODY_INVALID",
  "EVENTS_TITLE_REQUIRED",
  "EVENTS_SOURCE_NOTE_REQUIRED",
  "EVENTS_IMPORT_PENDING",
  "EVENTS_IMPORT_MOCK_FAILED",
] as const;

export type EventCrudImportErrorCode =
  (typeof EVENT_CRUD_AND_IMPORT_ERROR_CODES)[number];

export type EventCrudImportScenario =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export type EventCrudImportState = "success" | "empty" | "pending";

export interface EventCrudImportInput {
  scenario?: EventCrudImportScenario | string | null;
  statusFilter?: EventStatus | string | null;
  sourceCaptureMethod?: EventCaptureMethod | string | null;
}

export interface ManualEventCreationInput {
  title?: string | null;
  description?: string | null;
  venue?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sourceNote?: string | null;
  scenario?: EventCrudImportScenario | string | null;
}

export interface EventDetailInput {
  eventId?: string | null;
  scenario?: EventCrudImportScenario | string | null;
}

export interface EventCrudImportErrorDefinition {
  code: EventCrudImportErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS = {
  EVENTS_EVENT_ID_REQUIRED: {
    code: "EVENTS_EVENT_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "An event id is required before reading the mock event.",
    recovery:
      "Keep the event detail in the empty state until the operator selects a known mock event.",
  },
  EVENTS_EVENT_NOT_FOUND: {
    code: "EVENTS_EVENT_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No mock event matches that event id.",
    recovery:
      "Render the missing-event failure envelope and avoid querying calendars, organizer feeds, or databases.",
  },
  EVENTS_REQUEST_BODY_INVALID: {
    code: "EVENTS_REQUEST_BODY_INVALID",
    appCode: "VALIDATION_ERROR",
    message:
      "The manual event request body must be valid JSON before staging the mock event.",
    recovery:
      "Return the validation envelope and do not stage a manual event or write to a live event database.",
  },
  EVENTS_TITLE_REQUIRED: {
    code: "EVENTS_TITLE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A manual event title is required before staging the mock event.",
    recovery:
      "Ask for a title before building a manual event fixture and do not write to a live event database.",
  },
  EVENTS_SOURCE_NOTE_REQUIRED: {
    code: "EVENTS_SOURCE_NOTE_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message:
      "A source note is required before staging a manual event in the mock.",
    recovery:
      "Ask the operator why the event belongs in Orbit before staging the manual event fixture.",
  },
  EVENTS_IMPORT_PENDING: {
    code: "EVENTS_IMPORT_PENDING",
    appCode: "CONFLICT",
    message:
      "The mock event import boundary is waiting for local fixture review.",
    recovery:
      "Render the pending state and do not run calendar sync, organizer feed, database, or notification work.",
  },
  EVENTS_IMPORT_MOCK_FAILED: {
    code: "EVENTS_IMPORT_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message:
      "The mock event CRUD and import boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry calendar sync, organizer feed, live database, email, AI, or notification providers.",
  },
} as const satisfies Record<
  EventCrudImportErrorCode,
  EventCrudImportErrorDefinition
>;

export interface EventOriginMetadata extends SourceReferenceDTO {
  label: string;
  captureMethod: EventCaptureMethod;
  provider: string;
  providerRecordId: string;
  importedAt: string;
  calendarSyncRequested: false;
  organizerFeedRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
}

export interface EventEvidence {
  evidenceId: string;
  source: EventOriginMetadata;
  excerpt: string;
  capturedAt: string;
  createdBy: "mock-event-crud-and-import-service";
}

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  status: EventStatus;
  sourceMetadata: EventOriginMetadata;
  evidence: readonly EventEvidence[];
  relationshipContext: string;
  recommendedPreparation: string;
  nextAction: string;
  calendarSyncRequested: false;
  calendarProviderRequested: false;
  organizerFeedRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface ImportedEventRecord {
  id: string;
  eventId: string;
  externalRecordId: string;
  title: string;
  status: EventStatus;
  sourceMetadata: EventOriginMetadata;
  fieldMapping: readonly string[];
  skippedFields: readonly string[];
  calendarSyncRequested: false;
  organizerFeedRequested: false;
  liveDatabaseWriteExecuted: false;
}

export interface EventCrudImportProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-event-crud-import-only";
  generationMethod:
    | "fixture"
    | "rule-based-event-filter"
    | "rule-based-manual-event-creation";
  calendarSyncRequested: false;
  organizerFeedRequested: false;
  liveDatabaseWriteExecuted: false;
  externalNetworkRequested: false;
  aiProviderRequested: false;
  emailProviderRequested: false;
  notificationDelivered: false;
}

export interface EventListPayload {
  state: EventCrudImportState;
  events: readonly EventRecord[];
  importedRecords: readonly ImportedEventRecord[];
  summary: string;
  provenance: EventCrudImportProvenance;
  nextAction: string;
}

export interface ManualEventCreationPayload {
  state: "success";
  event: EventRecord;
  importedRecords: readonly ImportedEventRecord[];
  summary: string;
  provenance: EventCrudImportProvenance;
  nextAction: string;
}

export interface EventDetailPayload {
  state: "success";
  event: EventRecord;
  importedRecords: readonly ImportedEventRecord[];
  summary: string;
  provenance: EventCrudImportProvenance;
  nextAction: string;
}

export interface EventListSuccess {
  success: true;
  data: EventListPayload;
}

export interface ManualEventCreationSuccess {
  success: true;
  data: ManualEventCreationPayload;
}

export interface EventDetailSuccess {
  success: true;
  data: EventDetailPayload;
}

export interface EventCrudImportFailure {
  success: false;
  error: EventCrudImportErrorDefinition & {
    state: "failure";
    provenance: EventCrudImportProvenance;
    evidenceIds: readonly string[];
  };
}

export type EventListResult = EventListSuccess | EventCrudImportFailure;
export type ManualEventCreationResult =
  | ManualEventCreationSuccess
  | EventCrudImportFailure;
export type EventDetailResult = EventDetailSuccess | EventCrudImportFailure;

export function eventCrudImportErrorToAppError(
  errorCode: EventCrudImportErrorCode,
): AppError {
  const definition = EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS[errorCode];

  return new AppError(definition.appCode, definition.message);
}

export function eventCrudImportFailureToAppError(
  failure: EventCrudImportFailure,
): AppError {
  return eventCrudImportErrorToAppError(failure.error.code);
}

export function eventCrudImportErrorContext(
  errorCode: EventCrudImportErrorCode,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    eventCrudImportErrorCode: errorCode,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock event CRUD and import failure came from deterministic fixture rules.",
    service: "event-crud-and-import-mock",
  };
}

export function eventCrudImportFailureContext(
  failure: EventCrudImportFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return eventCrudImportErrorContext(failure.error.code, mode);
}
