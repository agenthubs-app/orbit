import {
  EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS,
  EVENT_SOURCE_CAPTURE_METHODS,
  EVENT_STATUS_VALUES,
  type EventCaptureMethod,
  type EventCrudImportErrorCode,
  type EventCrudImportFailure,
  type EventCrudImportInput,
  type EventCrudImportProvenance,
  type EventDetailInput,
  type EventDetailResult,
  type EventEvidence,
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
import type { SourceType } from "../../../shared/domain/source-types";
import type { EventCrudAndImportService } from "../service";

export interface LiveEventStoreSource {
  type: SourceType;
  id: string;
  label?: string;
  provider: string;
  providerRecordId: string;
  importedAt: string;
}

export interface LiveEventStoreEvidence {
  evidenceId: string;
  excerpt: string;
  capturedAt: string;
  createdBy: string;
}

export interface LiveEventStoreRecord {
  id: string;
  title: string;
  description?: string | null;
  venue?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status?: EventStatus | string | null;
  source: LiveEventStoreSource;
  evidence?: readonly LiveEventStoreEvidence[] | null;
  relationshipContext?: string | null;
  recommendedPreparation?: string | null;
  nextAction?: string | null;
}

export interface LiveEventStoreManualEventInput {
  description?: string | null;
  endsAt?: string | null;
  sourceNote: string;
  startsAt?: string | null;
  title: string;
  venue?: string | null;
}

export interface LiveEventStoreProvider {
  source: string;
  sourceLabel: string;
  listEvents: () => readonly LiveEventStoreRecord[];
  getEvent: (eventId: string) => LiveEventStoreRecord | null;
  createManualEvent: (
    input: LiveEventStoreManualEventInput,
  ) => LiveEventStoreRecord;
}

export interface LiveEventCrudAndImportServiceOptions {
  provider?: LiveEventStoreProvider | null;
  now?: () => string;
}

const supportedStatuses = new Set<EventStatus>(EVENT_STATUS_VALUES);
const supportedCaptureMethods = new Set<EventCaptureMethod>(
  EVENT_SOURCE_CAPTURE_METHODS,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function collectedAt(now?: () => string): string {
  return now ? now() : new Date().toISOString();
}

function normalizeStatus(status?: EventStatus | string | null): EventStatus {
  return status && supportedStatuses.has(status as EventStatus)
    ? (status as EventStatus)
    : "confirmed";
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

function captureMethodFor(record: LiveEventStoreRecord): EventCaptureMethod {
  if (record.source.type === "calendar_signal") {
    return "calendar_sync_fixture";
  }

  if (record.source.type === "event_import") {
    return "organizer_feed_fixture";
  }

  return "manual_form";
}

function originFor(
  record: LiveEventStoreRecord,
  liveDatabaseWriteExecuted: boolean,
): EventOriginMetadata {
  return {
    type: record.source.type,
    id: record.source.id,
    label: record.source.label ?? "Events live store",
    captureMethod: captureMethodFor(record),
    provider: record.source.provider,
    providerRecordId: record.source.providerRecordId,
    importedAt: record.source.importedAt,
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted,
    externalNetworkRequested: false,
  };
}

function fallbackEvidence(
  record: LiveEventStoreRecord,
): readonly LiveEventStoreEvidence[] {
  return [
    {
      evidenceId: `evidence:live-store:${record.id}`,
      excerpt: record.description ?? "Event loaded from the live event store.",
      capturedAt: record.startsAt ?? record.source.importedAt,
      createdBy: "events-live-store",
    },
  ];
}

function evidenceFor(
  record: LiveEventStoreRecord,
  origin: EventOriginMetadata,
): readonly EventEvidence[] {
  const evidence =
    record.evidence && record.evidence.length > 0
      ? record.evidence
      : fallbackEvidence(record);

  return evidence.map((item) => ({
    evidenceId: item.evidenceId,
    source: origin,
    excerpt: item.excerpt,
    capturedAt: item.capturedAt,
    createdBy: item.createdBy,
  }));
}

function toEventRecord(
  record: LiveEventStoreRecord,
  liveDatabaseWriteExecuted = false,
): EventRecord {
  const origin = originFor(record, liveDatabaseWriteExecuted);
  const relationshipContext =
    record.relationshipContext?.trim() ||
    record.description?.trim() ||
    "Source-backed event loaded from the Events live store.";

  return {
    id: record.id,
    title: record.title,
    description:
      record.description?.trim() ||
      "Event loaded from the Events live store.",
    venue: record.venue?.trim() || "Events live store",
    startsAt: record.startsAt?.trim() || record.source.importedAt,
    endsAt:
      record.endsAt?.trim() ||
      record.startsAt?.trim() ||
      record.source.importedAt,
    status: normalizeStatus(record.status),
    sourceMetadata: origin,
    evidence: evidenceFor(record, origin),
    relationshipContext,
    recommendedPreparation:
      record.recommendedPreparation?.trim() ||
      "Review live-store event context before relationship planning.",
    nextAction:
      record.nextAction?.trim() ||
      "Prepare relationship context for this live-store event.",
    calendarSyncRequested: false,
    calendarProviderRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function toImportedRecord(
  event: EventRecord,
  index: number,
  liveDatabaseWriteExecuted: boolean,
): ImportedEventRecord {
  return {
    id: `imported-event-record:live-store:${event.id}:${index}`,
    eventId: event.id,
    externalRecordId: event.sourceMetadata.providerRecordId,
    title: event.title,
    status: event.status,
    sourceMetadata: event.sourceMetadata,
    fieldMapping: ["title", "venue", "startsAt", "endsAt", "source"],
    skippedFields: ["calendarProviderPayload", "organizerFeedPayload"],
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted,
  };
}

function evidenceIdsFor(events: readonly EventRecord[]): readonly string[] {
  const evidenceIds = events.flatMap((event) =>
    event.evidence.map((evidence) => evidence.evidenceId),
  );

  return evidenceIds.length > 0
    ? [...new Set(evidenceIds)]
    : ["evidence:events-live-store-empty"];
}

function provenanceFor(input: {
  collectedAt: string;
  events: readonly EventRecord[];
  generationMethod: EventCrudImportProvenance["generationMethod"];
  liveDatabaseWriteExecuted: boolean;
  source: string;
  sourceLabel: string;
}): EventCrudImportProvenance {
  return {
    source: input.source,
    sourceLabel: input.sourceLabel,
    evidenceIds: evidenceIdsFor(input.events),
    collectedAt: input.collectedAt,
    privacy: "demo-event-crud-import-only",
    generationMethod: input.generationMethod,
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: input.liveDatabaseWriteExecuted,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function unconfiguredProvenance(collectedAt: string): EventCrudImportProvenance {
  return {
    source: "live-store:unconfigured",
    sourceLabel: "Unconfigured Events live store",
    evidenceIds: ["evidence:events-live-store-unconfigured"],
    collectedAt,
    privacy: "demo-event-crud-import-only",
    generationMethod: "live-store-query",
    calendarSyncRequested: false,
    organizerFeedRequested: false,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
  };
}

function failure(
  code: EventCrudImportErrorCode,
  provenance: EventCrudImportProvenance,
): EventCrudImportFailure {
  const definition = EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS[code];

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

function success<TData>(data: TData): { success: true; data: TData } {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function unconfiguredFailure(collectedAt: string): EventCrudImportFailure {
  return failure(
    "EVENTS_LIVE_STORE_UNCONFIGURED",
    unconfiguredProvenance(collectedAt),
  );
}

function listPayload(
  provider: LiveEventStoreProvider,
  records: readonly LiveEventStoreRecord[],
  input: EventCrudImportInput,
  now: string,
): EventListPayload {
  const statusFilter = normalizeStatusFilter(input.statusFilter);
  const captureMethod = normalizeCaptureMethod(input.sourceCaptureMethod);
  const events = records
    .map((record) => toEventRecord(record))
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
    importedRecords: events.map((event, index) =>
      toImportedRecord(event, index, false),
    ),
    summary:
      events.length > 0
        ? `${events.length} events were loaded from the Events live store.`
        : "No events matched the Events live store query.",
    provenance: provenanceFor({
      collectedAt: now,
      events,
      generationMethod: "live-store-query",
      liveDatabaseWriteExecuted: false,
      source: provider.source,
      sourceLabel: provider.sourceLabel,
    }),
    nextAction:
      events.length > 0
        ? "Use the live-store events for relationship preparation."
        : "Create a manual event in the Events live store.",
  };
}

function normalizeManualInput(
  input: ManualEventCreationInput,
  now: string,
): LiveEventStoreManualEventInput | EventCrudImportFailure {
  const title = input.title?.trim() ?? "";

  if (!title) {
    return failure(
      "EVENTS_TITLE_REQUIRED",
      unconfiguredProvenance(now),
    );
  }

  const sourceNote = input.sourceNote?.trim() ?? "";

  if (!sourceNote) {
    return failure(
      "EVENTS_SOURCE_NOTE_REQUIRED",
      unconfiguredProvenance(now),
    );
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
  input: LiveEventStoreManualEventInput | EventCrudImportFailure,
): input is EventCrudImportFailure {
  return "success" in input;
}

function manualPayloadFor(input: {
  event: EventRecord;
  now: string;
  provider: LiveEventStoreProvider;
}): ManualEventCreationPayload {
  return {
    state: "success",
    event: input.event,
    importedRecords: [toImportedRecord(input.event, 0, true)],
    summary: `${input.event.title} was created in the Events live store.`,
    provenance: provenanceFor({
      collectedAt: input.now,
      events: [input.event],
      generationMethod: "live-store-manual-event-creation",
      liveDatabaseWriteExecuted: true,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
    }),
    nextAction:
      "Review the live-store event before attaching attendees or reminders.",
  };
}

function detailPayloadFor(input: {
  event: EventRecord;
  now: string;
  provider: LiveEventStoreProvider;
}) {
  return {
    state: "success" as const,
    event: input.event,
    importedRecords: [toImportedRecord(input.event, 0, false)],
    summary: `${input.event.title} is available from the Events live store.`,
    provenance: provenanceFor({
      collectedAt: input.now,
      events: [input.event],
      generationMethod: "live-store-query",
      liveDatabaseWriteExecuted: false,
      source: input.provider.source,
      sourceLabel: input.provider.sourceLabel,
    }),
    nextAction: input.event.nextAction,
  };
}

export function createLiveEventCrudAndImportService(
  options: LiveEventCrudAndImportServiceOptions = {},
): EventCrudAndImportService {
  const provider = options.provider ?? null;
  const now = () => collectedAt(options.now);

  return {
    listEvents(input = {}): EventListResult {
      const currentTime = now();

      if (!provider) {
        return unconfiguredFailure(currentTime);
      }

      return success(
        listPayload(provider, provider.listEvents(), input, currentTime),
      );
    },

    createEvent(input = {}): ManualEventCreationResult {
      const currentTime = now();

      if (!provider) {
        return unconfiguredFailure(currentTime);
      }

      const manualInput = normalizeManualInput(input, currentTime);

      if (isFailure(manualInput)) {
        return manualInput;
      }

      const event = toEventRecord(
        provider.createManualEvent(manualInput),
        true,
      );

      return success(
        manualPayloadFor({
          event,
          now: currentTime,
          provider,
        }),
      );
    },

    getEvent(input: EventDetailInput): EventDetailResult {
      const currentTime = now();

      if (!provider) {
        return unconfiguredFailure(currentTime);
      }

      const eventId = input.eventId?.trim() ?? "";

      if (!eventId) {
        return failure(
          "EVENTS_EVENT_ID_REQUIRED",
          provenanceFor({
            collectedAt: currentTime,
            events: [],
            generationMethod: "live-store-query",
            liveDatabaseWriteExecuted: false,
            source: provider.source,
            sourceLabel: provider.sourceLabel,
          }),
        );
      }

      const record = provider.getEvent(eventId);

      if (!record) {
        return failure(
          "EVENTS_EVENT_NOT_FOUND",
          provenanceFor({
            collectedAt: currentTime,
            events: [],
            generationMethod: "live-store-query",
            liveDatabaseWriteExecuted: false,
            source: provider.source,
            sourceLabel: provider.sourceLabel,
          }),
        );
      }

      return success(
        detailPayloadFor({
          event: toEventRecord(record),
          now: currentTime,
          provider,
        }),
      );
    },
  };
}
