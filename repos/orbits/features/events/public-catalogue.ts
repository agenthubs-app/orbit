import type { EventDTO } from "../../shared/domain/contracts";
import { createOrbitLocalRemoteDatabase } from "../../shared/local-remote-store/orbit-database";
import type { EventRecord } from "./event-crud-and-import/contract";

export interface PublicEventCatalogueSnapshot {
  events: readonly EventDTO[];
  generatedAt: string;
}

/**
 * Feature-owned read boundary for the approved public event catalogue.
 *
 * The current local/remote database is seeded with the approved test catalogue.
 * Callers depend on this boundary rather than importing fixture files directly,
 * so a live catalogue provider can replace the backing store without changing
 * registration or route authorization.
 */
export function readPublicEventCatalogue(): PublicEventCatalogueSnapshot {
  const state = createOrbitLocalRemoteDatabase().getState();

  return {
    events: state.events,
    generatedAt: state.generatedAt,
  };
}

export function publicEventCatalogueRecord(
  event: EventDTO,
  generatedAt: string,
  now = Date.now(),
): EventRecord {
  const endsAt = event.endsAt ?? event.startsAt;
  const endsAtMs = Date.parse(endsAt);
  const registrationClosed = Number.isFinite(endsAtMs) && endsAtMs < now;
  const sourceMetadata = {
    type: "event_import" as const,
    id: event.source.id,
    label: event.source.label ?? event.name,
    captureMethod: "organizer_feed" as const,
    provider: "orbit-public-event-catalogue",
    providerRecordId: event.id,
    importedAt: generatedAt,
    calendarSyncRequested: false as const,
    organizerFeedRequested: false as const,
    liveDatabaseWriteExecuted: false,
    externalNetworkRequested: false as const,
  };

  return {
    id: event.id,
    title: event.name,
    description: event.description ?? "",
    venue: event.location ?? "",
    startsAt: event.startsAt,
    endsAt,
    status: registrationClosed ? "cancelled" : "imported",
    sourceMetadata,
    evidence: event.evidenceIds.map((evidenceId) => ({
      evidenceId,
      source: sourceMetadata,
      excerpt:
        event.description ??
        `Published event catalogue record for ${event.name}.`,
      capturedAt: generatedAt,
      createdBy: "orbit-public-event-catalogue",
    })),
    relationshipContext:
      event.description ?? "Published event catalogue context.",
    recommendedPreparation:
      "Review the event details and complete the event-scoped registration profile.",
    nextAction: "Sign in and register before viewing the attendee list.",
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

export function readPublicEventCatalogueRecords(
  now = Date.now(),
): readonly EventRecord[] {
  const catalogue = readPublicEventCatalogue();

  return catalogue.events.map((event) =>
    publicEventCatalogueRecord(event, catalogue.generatedAt, now),
  );
}
