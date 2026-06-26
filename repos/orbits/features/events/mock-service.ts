import {
  EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS,
  EVENT_SOURCE_CAPTURE_METHODS,
  EVENT_STATUS_VALUES,
  type EventCaptureMethod,
  type EventCrudImportErrorCode,
  type EventCrudImportFailure,
  type EventCrudImportInput,
  type EventCrudImportScenario,
  type EventDetailInput,
  type EventDetailResult,
  type EventDetailSuccess,
  type EventListPayload,
  type EventListResult,
  type EventListSuccess,
  type EventRecord,
  type EventStatus,
  type ImportedEventRecord,
  type ManualEventCreationInput,
  type ManualEventCreationPayload,
  type ManualEventCreationResult,
  type ManualEventCreationSuccess,
} from "./contract";
import {
  buildEventDetailPayload,
  buildEventListPayload,
  buildManualEventCreationPayload,
  mockEmptyEventListFixture,
  mockEventFailureProvenance,
  mockEventListFixture,
  mockEventRecords,
  mockImportedEventRecords,
  mockManualEventCreationFixture,
  mockPendingEventListFixture,
} from "./fixtures";
import type { EventCrudAndImportService } from "./service";

const supportedScenarios = new Set<EventCrudImportScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedStatuses = new Set<EventStatus>(EVENT_STATUS_VALUES);
const supportedCaptureMethods = new Set<EventCaptureMethod>(
  EVENT_SOURCE_CAPTURE_METHODS,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function listSuccess(payload: EventListPayload): EventListSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function createSuccess(
  payload: ManualEventCreationPayload,
): ManualEventCreationSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function detailSuccess(payload: EventDetailSuccess["data"]): EventDetailSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(code: EventCrudImportErrorCode): EventCrudImportFailure {
  const definition = EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockEventFailureProvenance,
      evidenceIds: mockEventFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: EventCrudImportInput["scenario"],
): EventCrudImportScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as EventCrudImportScenario)
  ) {
    return scenario as EventCrudImportScenario;
  }

  return "success";
}

function normalizeStatusFilter(
  statusFilter?: EventCrudImportInput["statusFilter"],
): EventStatus | null {
  if (statusFilter && supportedStatuses.has(statusFilter as EventStatus)) {
    return statusFilter as EventStatus;
  }

  return null;
}

function normalizeCaptureMethod(
  sourceCaptureMethod?: EventCrudImportInput["sourceCaptureMethod"],
): EventCaptureMethod | null {
  if (
    sourceCaptureMethod &&
    supportedCaptureMethods.has(sourceCaptureMethod as EventCaptureMethod)
  ) {
    return sourceCaptureMethod as EventCaptureMethod;
  }

  return null;
}

function normalizeEventId(eventId?: string | null): string {
  return eventId?.trim() ?? "";
}

function scenarioListResult(
  scenario: EventCrudImportScenario,
): EventListResult | null {
  switch (scenario) {
    case "empty":
      return listSuccess(mockEmptyEventListFixture);
    case "pending":
      return listSuccess(mockPendingEventListFixture);
    case "failure":
      return failure("EVENTS_IMPORT_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function scenarioCreateResult(
  scenario: EventCrudImportScenario,
): ManualEventCreationResult | null {
  switch (scenario) {
    case "failure":
      return failure("EVENTS_IMPORT_MOCK_FAILED");
    case "pending":
      return failure("EVENTS_IMPORT_PENDING");
    case "empty":
    case "success":
    default:
      return null;
  }
}

function filterImportedRecords(
  events: readonly EventRecord[],
): readonly ImportedEventRecord[] {
  const eventIds = new Set(events.map((event) => event.id));

  return mockImportedEventRecords.filter((record) =>
    eventIds.has(record.eventId),
  );
}

function filteredEventList(input: EventCrudImportInput): EventListPayload {
  const statusFilter = normalizeStatusFilter(input.statusFilter);
  const captureMethod = normalizeCaptureMethod(input.sourceCaptureMethod);
  const events = mockEventRecords.filter((event) => {
    const statusMatches = statusFilter ? event.status === statusFilter : true;
    const sourceMatches = captureMethod
      ? event.sourceMetadata.captureMethod === captureMethod
      : true;

    return statusMatches && sourceMatches;
  });
  const importedRecords = filterImportedRecords(events);
  const filters = [
    statusFilter ? `status ${statusFilter}` : "",
    captureMethod ? `source ${captureMethod}` : "",
  ].filter(Boolean);

  if (filters.length === 0) {
    return mockEventListFixture;
  }

  return buildEventListPayload({
    events,
    importedRecords,
    summary:
      events.length > 0
        ? `Local mock rules filtered events by ${filters.join(" and ")}.`
        : `No local events matched ${filters.join(" and ")}.`,
    evidenceIds:
      events.length > 0
        ? events.flatMap((event) =>
            event.evidence.map((evidence) => evidence.evidenceId),
          )
        : ["evidence:events-empty-list"],
  });
}

function manualInputOrDefault(
  input: ManualEventCreationInput,
): ManualEventCreationInput | "default" | EventCrudImportFailure {
  if (input.title === undefined || input.title === null) {
    return "default";
  }

  const title = input.title.trim();

  if (!title) {
    return failure("EVENTS_TITLE_REQUIRED");
  }

  const sourceNote = input.sourceNote?.trim() ?? "";

  if (!sourceNote) {
    return failure("EVENTS_SOURCE_NOTE_REQUIRED");
  }

  return {
    ...input,
    sourceNote,
    title,
  };
}

function isEventCrudImportFailure(
  value: ManualEventCreationInput | "default" | EventCrudImportFailure,
): value is EventCrudImportFailure {
  return typeof value === "object" && value !== null && "success" in value;
}

function buildManualPayload(
  input: ManualEventCreationInput,
): ManualEventCreationPayload {
  const normalized = manualInputOrDefault(input);

  if (normalized === "default" || isEventCrudImportFailure(normalized)) {
    return mockManualEventCreationFixture;
  }

  return buildManualEventCreationPayload({
    title: normalized.title ?? mockManualEventCreationFixture.event.title,
    description: normalized.description,
    sourceNote: normalized.sourceNote,
    venue:
      normalized.venue?.trim() ||
      mockManualEventCreationFixture.event.venue,
    startsAt:
      normalized.startsAt?.trim() ||
      mockManualEventCreationFixture.event.startsAt,
    endsAt:
      normalized.endsAt?.trim() ||
      mockManualEventCreationFixture.event.endsAt,
  });
}

function getManualValidationFailure(
  input: ManualEventCreationInput,
): EventCrudImportFailure | null {
  const normalized = manualInputOrDefault(input);

  return isEventCrudImportFailure(normalized) ? normalized : null;
}

export function createMockEventCrudAndImportService(): EventCrudAndImportService {
  return {
    listEvents(input = {}): EventListResult {
      const scenarioResult = scenarioListResult(normalizeScenario(input.scenario));

      if (scenarioResult) {
        return scenarioResult;
      }

      return listSuccess(filteredEventList(input));
    },

    createEvent(input = {}): ManualEventCreationResult {
      const scenarioResult = scenarioCreateResult(
        normalizeScenario(input.scenario),
      );

      if (scenarioResult) {
        return scenarioResult;
      }

      const validationFailure = getManualValidationFailure(input);

      if (validationFailure) {
        return validationFailure;
      }

      return createSuccess(buildManualPayload(input));
    },

    getEvent(input: EventDetailInput): EventDetailResult {
      if (normalizeScenario(input.scenario) === "failure") {
        return failure("EVENTS_IMPORT_MOCK_FAILED");
      }

      const eventId = normalizeEventId(input.eventId);

      if (!eventId) {
        return failure("EVENTS_EVENT_ID_REQUIRED");
      }

      const event = mockEventRecords.find((record) => record.id === eventId);

      if (!event) {
        return failure("EVENTS_EVENT_NOT_FOUND");
      }

      return detailSuccess(buildEventDetailPayload(event));
    },
  };
}

export type {
  EventDetailResult,
  EventListResult,
  ManualEventCreationResult,
};
