import type { EventDTO } from "../../../shared/domain/contracts";
import type { EventRecord } from "../event-crud-and-import/contract";
import type { EventOperationsCatalogueSummary } from "../event-operations/repository";
import {
  EventCoreDataError,
  type PublishedCanonicalEvent,
} from "./contract";
import type { EventCoreService } from "./service";

export type CanonicalParticipantSummaryReader = (
  eventIds: readonly string[],
) => Promise<readonly EventOperationsCatalogueSummary[]>;

export interface PublicEventCatalogueSnapshot {
  events: readonly EventDTO[];
  evidenceSummaries: Readonly<Record<string, string>>;
  generatedAt: string;
  participantCounts: Readonly<Record<string, number>>;
  publicCodes: Readonly<Record<string, string>>;
}

export interface CanonicalPublicEventCatalogueDependencies {
  eventCoreService: EventCoreService;
  now: Date;
  readParticipantSummaries: CanonicalParticipantSummaryReader;
}

export interface CanonicalPublicEventCatalogue {
  read(): Promise<PublicEventCatalogueSnapshot>;
  readRecord(routeId: string): Promise<EventRecord | null>;
}

function invalid(eventId: string, field: string): never {
  throw new EventCoreDataError(
    "EVENT_CORE_INVALID_PUBLISHED_EVENT",
    `Published event ${eventId} has invalid ${field}.`,
  );
}

function requiredText(
  value: string | null | undefined,
  field: string,
  eventId: string,
): string {
  const normalized = value?.trim() ?? "";
  return normalized || invalid(eventId, field);
}

function timestamp(value: string, field: string, eventId: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) invalid(eventId, field);
  return new Date(parsed).toISOString();
}

function evidenceArray(value: unknown, eventId: string): readonly string[] {
  if (!Array.isArray(value)) invalid(eventId, "sourcePayload.evidenceIds");
  const normalized = value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      invalid(eventId, "sourcePayload.evidenceIds");
    }
    return item.trim();
  });
  return normalized;
}

function sourcePayloadEvidenceIds(event: PublishedCanonicalEvent): readonly string[] {
  const payload: unknown = event.sourcePayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    invalid(event.eventId, "sourcePayload");
  }
  const object = payload as Record<string, unknown>;
  const evidenceIds: string[] = [];
  if (object.evidenceIds !== undefined) {
    evidenceIds.push(...evidenceArray(object.evidenceIds, event.eventId));
  }
  if (object.legacyEvidenceId !== undefined) {
    if (
      typeof object.legacyEvidenceId !== "string" ||
      !object.legacyEvidenceId.trim()
    ) {
      invalid(event.eventId, "sourcePayload.legacyEvidenceId");
    }
    evidenceIds.push(object.legacyEvidenceId.trim());
  }
  if (object.sources !== undefined) {
    if (!Array.isArray(object.sources)) {
      invalid(event.eventId, "sourcePayload.sources");
    }
    for (const source of object.sources) {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        invalid(event.eventId, "sourcePayload.sources");
      }
      const sourcePayload = (source as Record<string, unknown>).payload;
      if (sourcePayload === undefined) continue;
      if (
        !sourcePayload ||
        typeof sourcePayload !== "object" ||
        Array.isArray(sourcePayload)
      ) {
        invalid(event.eventId, "sourcePayload.sources.payload");
      }
      const nestedEvidenceIds = (sourcePayload as Record<string, unknown>)
        .evidenceIds;
      if (nestedEvidenceIds !== undefined) {
        evidenceIds.push(
          ...evidenceArray(nestedEvidenceIds, event.eventId),
        );
      }
    }
  }
  const unique = [...new Set(evidenceIds)].sort((left, right) =>
    left.localeCompare(right),
  );
  return unique.length > 0
    ? unique
    : [`evidence:event-core:${event.eventId}:v${event.eventVersion}`];
}

function canonicalSource(event: PublishedCanonicalEvent) {
  return {
    id: `event-core-postgres:${event.eventId}:v${event.eventVersion}`,
    label: "event-core-postgres",
    type: "event_import" as const,
  };
}

export function publishedCanonicalEventToEventDTO(
  event: PublishedCanonicalEvent,
): EventDTO {
  const publicCode = requiredText(event.publicCode, "publicCode", event.eventId);
  const description = event.description?.trim() || undefined;
  const venue = requiredText(event.venue, "venue", event.eventId);
  const startsAt = timestamp(event.startsAt, "startsAt", event.eventId);
  const endsAt = timestamp(event.endsAt, "endsAt", event.eventId);
  if (Date.parse(startsAt) >= Date.parse(endsAt)) {
    invalid(event.eventId, "time range");
  }
  // Reading publicCode here is intentional: it is validated at the canonical
  // boundary and exposed by the snapshot without deriving a route code.
  void publicCode;
  return {
    ...(description ? { description } : {}),
    endsAt,
    evidenceIds: sourcePayloadEvidenceIds(event) as EventDTO["evidenceIds"],
    id: event.eventId,
    location: venue,
    name: event.title,
    organizerId: event.organizerActorId,
    source: canonicalSource(event),
    startsAt,
  };
}

export function publishedCanonicalEventToEventRecord(
  event: PublishedCanonicalEvent,
  generatedAt: string,
): EventRecord {
  const dto = publishedCanonicalEventToEventDTO(event);
  const importedAt = timestamp(generatedAt, "generatedAt", event.eventId);
  const sourceMetadata = {
    ...dto.source,
    calendarSyncRequested: false as const,
    captureMethod: "organizer_feed" as const,
    externalNetworkRequested: false as const,
    importedAt,
    label: "event-core-postgres",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false as const,
    provider: "event-core-postgres",
    providerRecordId: event.eventId,
  };
  return {
    aiProviderRequested: false,
    calendarProviderRequested: false,
    calendarSyncRequested: false,
    description: dto.description ?? "",
    emailProviderRequested: false,
    endsAt: dto.endsAt ?? dto.startsAt,
    evidence: dto.evidenceIds.map((evidenceId) => ({
      capturedAt: importedAt,
      createdBy: "event-core-postgres",
      evidenceId,
      excerpt: dto.description ?? `Canonical event ${event.eventId}.`,
      source: sourceMetadata,
    })),
    externalNetworkRequested: false,
    id: dto.id,
    liveDatabaseWriteExecuted: false,
    nextAction: "Sign in and register before viewing the attendee list.",
    notificationDelivered: false,
    organizerFeedRequested: false,
    recommendedPreparation:
      "Review the event details and complete the event-scoped registration profile.",
    relationshipContext: dto.description ?? "Published event context.",
    sourceMetadata,
    startsAt: dto.startsAt,
    status: event.phase === "ended" ? "cancelled" : "imported",
    title: dto.name,
    venue: dto.location ?? "",
  };
}

function summaryCount(
  summary: EventOperationsCatalogueSummary,
): number {
  const count = summary.activeRegistrationCount;
  if (!Number.isSafeInteger(count) || count < 0) {
    invalid(summary.eventId, "participant summary count");
  }
  return count;
}

interface CanonicalPublicEventCatalogueItem {
  event: EventDTO;
  eventRecord: EventRecord;
  participantCount: number;
  publicCode: string;
}

async function itemsFor(
  events: readonly PublishedCanonicalEvent[],
  input: CanonicalPublicEventCatalogueDependencies,
  generatedAt: string,
): Promise<readonly CanonicalPublicEventCatalogueItem[]> {
  const ordered = [...events].sort(
    (left, right) =>
      Date.parse(right.startsAt) - Date.parse(left.startsAt) ||
      left.eventId.localeCompare(right.eventId),
  );
  const eventIds = new Set<string>();
  const publicCodes = new Set<string>();
  for (const event of ordered) {
    if (eventIds.has(event.eventId)) invalid(event.eventId, "duplicate eventId");
    eventIds.add(event.eventId);
    const publicCode = requiredText(event.publicCode, "publicCode", event.eventId);
    const normalizedCode = publicCode.toLocaleLowerCase("en-US");
    if (publicCodes.has(normalizedCode)) invalid(event.eventId, "duplicate publicCode");
    publicCodes.add(normalizedCode);
  }
  const summaries = await input.readParticipantSummaries([...eventIds]);
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    if (!eventIds.has(summary.eventId) || counts.has(summary.eventId)) {
      invalid(summary.eventId, "participant summary");
    }
    counts.set(summary.eventId, summaryCount(summary));
  }
  for (const eventId of eventIds) {
    if (!counts.has(eventId)) {
      invalid(eventId, "missing participant summary");
    }
  }
  return ordered.map((event) => ({
    event: publishedCanonicalEventToEventDTO(event),
    eventRecord: publishedCanonicalEventToEventRecord(event, generatedAt),
    participantCount: counts.get(event.eventId)!,
    publicCode: requiredText(event.publicCode, "publicCode", event.eventId),
  }));
}

async function readCanonicalPublicEventCatalogue(
  input: CanonicalPublicEventCatalogueDependencies,
): Promise<PublicEventCatalogueSnapshot> {
  const generatedAt = timestamp(input.now.toISOString(), "generatedAt", "catalogue");
  const published = await input.eventCoreService.listPublishedEvents(input.now);
  for (const event of published) {
    if (event.lifecycleState !== "published") {
      invalid(event.eventId, "lifecycleState");
    }
  }
  const items = await itemsFor(
    published.filter((event) => Boolean(event.publicCode?.trim())),
    input,
    generatedAt,
  );
  return {
    events: items.map((item) => item.event),
    evidenceSummaries: Object.fromEntries(
      items.map((item) => [item.event.id, item.event.description ?? ""]),
    ),
    generatedAt,
    participantCounts: Object.fromEntries(
      items.map((item) => [item.event.id, item.participantCount]),
    ),
    publicCodes: Object.fromEntries(
      items.map((item) => [item.event.id, item.publicCode]),
    ),
  };
}

async function readCanonicalPublicEventRecord(
  input: CanonicalPublicEventCatalogueDependencies,
  routeId: string,
): Promise<EventRecord | null> {
  if (!routeId.trim()) return null;
  const event = await input.eventCoreService.getPublishedEvent(
    routeId,
    input.now,
  );
  if (!event) return null;
  if (event.lifecycleState !== "published") {
    invalid(event.eventId, "lifecycleState");
  }
  if (!event.publicCode?.trim()) return null;
  return publishedCanonicalEventToEventRecord(event, input.now.toISOString());
}

export function createCanonicalPublicEventCatalogue(
  input: CanonicalPublicEventCatalogueDependencies,
): CanonicalPublicEventCatalogue {
  return {
    read: () => readCanonicalPublicEventCatalogue(input),
    readRecord: (routeId) => readCanonicalPublicEventRecord(input, routeId),
  };
}
