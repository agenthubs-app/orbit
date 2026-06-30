import {
  EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS,
  EVENT_SOURCE_CAPTURE_METHODS,
  EVENT_STATUS_VALUES,
  type EventCaptureMethod,
  type EventCrudImportErrorCode,
  type EventCrudImportFailure,
  type EventCrudImportInput,
  type EventCrudImportProvenance,
  type EventCrudImportScenario,
  type EventDetailInput,
  type EventDetailResult,
  type EventListPayload,
  type EventListResult,
  type EventOriginMetadata,
  type EventRecord,
  type EventStatus,
  type ImportedEventRecord,
  type ManualEventCreationInput,
  type ManualEventCreationPayload,
  type ManualEventCreationResult,
} from "../contract";
import type {
  EventDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import {
  createOrbitLocalRemoteDatabase,
  ORBIT_LOCAL_REMOTE_DATABASE_KEY,
  type OrbitLocalRemoteDatabase,
} from "../../../shared/local-remote-store/orbit-database";
import type { MockRuntimeFixtures } from "../../../shared/mock/fixtures";
import type { EventCrudAndImportService } from "../service";

interface LocalRemoteEventGraph {
  events: readonly EventDTO[];
  evidence: readonly RelationshipEvidenceDTO[];
  generatedAt: string;
}

interface EventLocalRemoteRepository {
  readEventGraph: () => LocalRemoteEventGraph;
  createManualEvent: (input: RequiredManualEventInput) => LocalRemoteEventGraph;
}

interface HybridEventCrudAndImportServiceOptions {
  database?: OrbitLocalRemoteDatabase;
  repository?: EventLocalRemoteRepository;
}

interface RequiredManualEventInput {
  description?: string | null;
  endsAt?: string | null;
  sourceNote: string;
  startsAt?: string | null;
  title: string;
  venue?: string | null;
}

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

function localRemoteSource(): string {
  return `local-remote-store:${ORBIT_LOCAL_REMOTE_DATABASE_KEY}`;
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
  return statusFilter && supportedStatuses.has(statusFilter as EventStatus)
    ? (statusFilter as EventStatus)
    : null;
}

function normalizeCaptureMethod(
  sourceCaptureMethod?: EventCrudImportInput["sourceCaptureMethod"],
): EventCaptureMethod | null {
  return sourceCaptureMethod &&
    supportedCaptureMethods.has(sourceCaptureMethod as EventCaptureMethod)
    ? (sourceCaptureMethod as EventCaptureMethod)
    : null;
}

function captureMethodFor(event: EventDTO): EventCaptureMethod {
  if (event.source.type === "calendar_signal") {
    return "calendar_sync_fixture";
  }

  if (event.source.type === "event_import") {
    return "organizer_feed_fixture";
  }

  return "manual_form";
}

function statusFor(event: EventDTO): EventStatus {
  if (event.source.type === "event_import") {
    return "imported";
  }

  return "confirmed";
}

function originFor(event: EventDTO, graph: LocalRemoteEventGraph): EventOriginMetadata {
  const captureMethod = captureMethodFor(event);

  return {
    ...event.source,
    label: event.source.label ?? "Hybrid local remote event source",
    captureMethod,
    provider: "hybrid-local-remote-store",
    providerRecordId: event.source.id,
    importedAt: graph.generatedAt,
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
  };
}

function evidenceFor(
  event: EventDTO,
  origin: EventOriginMetadata,
  graph: LocalRemoteEventGraph,
) {
  const evidenceById = new Map(graph.evidence.map((item) => [item.id, item]));

  return event.evidenceIds.map((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);

    return {
      evidenceId,
      source: origin,
      excerpt:
        evidence?.summary ??
        "Hybrid local remote event evidence is present without a summary.",
      capturedAt: evidence?.occurredAt ?? graph.generatedAt,
      createdBy: evidence?.createdBy ?? "hybrid-event-crud-and-import-service",
    };
  });
}

function relationshipContextFor(
  event: EventDTO,
  graph: LocalRemoteEventGraph,
): string {
  const evidenceById = new Map(graph.evidence.map((item) => [item.id, item]));
  const summary = event.evidenceIds
    .map((evidenceId) => evidenceById.get(evidenceId)?.summary)
    .find((value): value is string => Boolean(value?.trim()));

  return summary ?? "Source-backed event loaded from the local remote database.";
}

function toEventRecord(
  event: EventDTO,
  graph: LocalRemoteEventGraph,
): EventRecord {
  const origin = originFor(event, graph);

  return {
    id: event.id,
    title: event.name,
    description: relationshipContextFor(event, graph),
    venue: event.location ?? "Local remote database",
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? event.startsAt,
    status: statusFor(event),
    sourceMetadata: origin,
    evidence: evidenceFor(event, origin, graph),
    relationshipContext: relationshipContextFor(event, graph),
    recommendedPreparation:
      "Review local remote database evidence before agent event planning.",
    nextAction: "Use this source-backed event for hybrid agent workflow tests.",
    calendarSyncRequested: false,
    calendarProviderRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function toImportedRecord(
  event: EventRecord,
  index: number,
): ImportedEventRecord {
  return {
    id: `imported-event-record:hybrid:${event.id}:${index}`,
    eventId: event.id,
    externalRecordId: event.sourceMetadata.providerRecordId,
    title: event.title,
    status: event.status,
    sourceMetadata: event.sourceMetadata,
    fieldMapping: ["name", "location", "startsAt", "endsAt", "source"],
    skippedFields: ["liveCalendarProvider", "organizerFeedPayload"],
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function evidenceIdsFor(events: readonly EventRecord[]): readonly string[] {
  const evidenceIds = events.flatMap((event) =>
    event.evidence.map((evidence) => evidence.evidenceId),
  );

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:events-local-remote-empty"];
}

function provenanceFor(input: {
  collectedAt: string;
  events: readonly EventRecord[];
  sourceLabel: string;
}): EventCrudImportProvenance {
  return {
    source: localRemoteSource(),
    sourceLabel: input.sourceLabel,
    evidenceIds: evidenceIdsFor(input.events),
    collectedAt: input.collectedAt,
    privacy: "demo-event-crud-import-only",
    generationMethod: "local-remote-store-query",
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function listPayload(
  graph: LocalRemoteEventGraph,
  input: EventCrudImportInput = {},
): EventListPayload {
  const statusFilter = normalizeStatusFilter(input.statusFilter);
  const captureMethod = normalizeCaptureMethod(input.sourceCaptureMethod);
  const events = graph.events
    .map((event) => toEventRecord(event, graph))
    .filter((event) => {
      const statusMatches = statusFilter ? event.status === statusFilter : true;
      const sourceMatches = captureMethod
        ? event.sourceMetadata.captureMethod === captureMethod
        : true;

      return statusMatches && sourceMatches;
    });

  return {
    state: events.length > 0 ? "success" : "empty",
    events,
    importedRecords: events.map(toImportedRecord),
    summary:
      events.length > 0
        ? `${events.length} events were loaded from the hybrid local remote database.`
        : "No events matched the hybrid local remote database query.",
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      events,
      sourceLabel: "Hybrid local remote events database",
    }),
    nextAction:
      events.length > 0
        ? "Use the local database events for agent workflow testing."
        : "Add events to the local remote database or clear event filters.",
  };
}

function success<TData>(data: TData): { success: true; data: TData } {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: EventCrudImportErrorCode,
  collectedAt: string,
): EventCrudImportFailure {
  const definition = EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS[code];
  const provenance = provenanceFor({
    collectedAt,
    events: [],
    sourceLabel: "Hybrid local remote events database failure",
  });

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

function scenarioListResult(
  graph: LocalRemoteEventGraph,
  scenario: EventCrudImportScenario,
): EventListResult | null {
  switch (scenario) {
    case "empty":
      return success({
        ...listPayload(graph),
        events: [],
        importedRecords: [],
        state: "empty",
        summary: "The hybrid local remote events database returned no rows.",
      });
    case "pending":
      return success({
        ...listPayload(graph),
        events: [],
        importedRecords: [],
        state: "pending",
        summary:
          "The hybrid local remote events database is waiting for seed review.",
      });
    case "failure":
      return failure("EVENTS_IMPORT_MOCK_FAILED", graph.generatedAt);
    case "success":
    default:
      return null;
  }
}

function normalizeManualInput(
  input: ManualEventCreationInput,
): RequiredManualEventInput | EventCrudImportFailure {
  const title = input.title?.trim() ?? "";

  if (!title) {
    return failure("EVENTS_TITLE_REQUIRED", new Date(0).toISOString());
  }

  const sourceNote = input.sourceNote?.trim() ?? "";

  if (!sourceNote) {
    return failure("EVENTS_SOURCE_NOTE_REQUIRED", new Date(0).toISOString());
  }

  return {
    description: input.description,
    endsAt: input.endsAt,
    sourceNote,
    startsAt: input.startsAt,
    title,
    venue: input.venue,
  };
}

function isFailure(
  input: RequiredManualEventInput | EventCrudImportFailure,
): input is EventCrudImportFailure {
  return "success" in input;
}

function manualPayloadFor(
  graph: LocalRemoteEventGraph,
  eventId: string,
): ManualEventCreationPayload {
  const event = graph.events.find((item) => item.id === eventId) ?? graph.events[0];
  const eventRecord = toEventRecord(event, graph);

  return {
    state: "success",
    event: eventRecord,
    importedRecords: [toImportedRecord(eventRecord, 0)],
    summary: `${eventRecord.title} was staged in the hybrid local remote database.`,
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      events: [eventRecord],
      sourceLabel: "Hybrid local remote manual event creation",
    }),
    nextAction:
      "Review the locally staged event before attaching attendees or reminders.",
  };
}

function detailPayloadFor(
  graph: LocalRemoteEventGraph,
  eventId: string,
) {
  const event = graph.events.find((item) => item.id === eventId);

  if (!event) {
    return null;
  }

  const eventRecord = toEventRecord(event, graph);

  return {
    state: "success" as const,
    event: eventRecord,
    importedRecords: [toImportedRecord(eventRecord, 0)],
    summary: `${eventRecord.title} is available from the hybrid local remote database.`,
    provenance: provenanceFor({
      collectedAt: graph.generatedAt,
      events: [eventRecord],
      sourceLabel: eventRecord.sourceMetadata.label,
    }),
    nextAction: eventRecord.nextAction,
  };
}

function slugFromTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createEventLocalRemoteRepository(
  database = createOrbitLocalRemoteDatabase(),
): EventLocalRemoteRepository {
  return {
    readEventGraph() {
      const state = database.getState();

      return {
        events: state.events,
        evidence: state.evidence,
        generatedAt: state.generatedAt,
      };
    },
    createManualEvent(input) {
      const eventId = `event:manual:${slugFromTitle(input.title)}`;
      const evidenceId = `evidence:events-manual:${slugFromTitle(input.title)}`;

      const nextState = database.updateState((draft: MockRuntimeFixtures) => {
        const generatedAt = draft.generatedAt;
        const createdBy =
          draft.profiles[0]?.id ?? "hybrid-event-crud-and-import-service";

        draft.evidence = [
          ...draft.evidence.filter((evidence) => evidence.id !== evidenceId),
          {
            id: evidenceId,
            sourceType: "manual",
            sourceId: eventId,
            summary:
              input.description?.trim() ||
              input.sourceNote ||
              "Manual event staged in the hybrid local remote database.",
            occurredAt: input.startsAt?.trim() || generatedAt,
            confidence: 0.9,
            createdBy,
          },
        ];
        draft.events = [
          ...draft.events.filter((event) => event.id !== eventId),
          {
            id: eventId,
            name: input.title,
            location: input.venue?.trim() || "Local remote database",
            startsAt: input.startsAt?.trim() || generatedAt,
            endsAt: input.endsAt?.trim() || input.startsAt?.trim() || generatedAt,
            source: {
              type: "manual",
              id: `source:events:manual:${slugFromTitle(input.title)}`,
              label: input.sourceNote,
            },
            evidenceIds: [evidenceId],
          },
        ];
      });

      return {
        events: nextState.events,
        evidence: nextState.evidence,
        generatedAt: nextState.generatedAt,
      };
    },
  };
}

export function createHybridEventCrudAndImportService(
  options: HybridEventCrudAndImportServiceOptions = {},
): EventCrudAndImportService {
  const repository =
    options.repository ?? createEventLocalRemoteRepository(options.database);

  return {
    listEvents(input = {}): EventListResult {
      const graph = repository.readEventGraph();
      const scenario = scenarioListResult(
        graph,
        normalizeScenario(input.scenario),
      );

      if (scenario) {
        return scenario;
      }

      return success(listPayload(graph, input));
    },

    createEvent(input = {}): ManualEventCreationResult {
      const graph = repository.readEventGraph();

      if (normalizeScenario(input.scenario) === "failure") {
        return failure("EVENTS_IMPORT_MOCK_FAILED", graph.generatedAt);
      }

      if (normalizeScenario(input.scenario) === "pending") {
        return failure("EVENTS_IMPORT_PENDING", graph.generatedAt);
      }

      const manualInput = normalizeManualInput(input);

      if (isFailure(manualInput)) {
        return manualInput;
      }

      const nextGraph = repository.createManualEvent(manualInput);
      const eventId = `event:manual:${slugFromTitle(manualInput.title)}`;

      return success(manualPayloadFor(nextGraph, eventId));
    },

    getEvent(input: EventDetailInput): EventDetailResult {
      const graph = repository.readEventGraph();

      if (normalizeScenario(input.scenario) === "failure") {
        return failure("EVENTS_IMPORT_MOCK_FAILED", graph.generatedAt);
      }

      const eventId = input.eventId?.trim() ?? "";

      if (!eventId) {
        return failure("EVENTS_EVENT_ID_REQUIRED", graph.generatedAt);
      }

      const payload = detailPayloadFor(graph, eventId);

      if (!payload) {
        return failure("EVENTS_EVENT_NOT_FOUND", graph.generatedAt);
      }

      return success(payload);
    },
  };
}
