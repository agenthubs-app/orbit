import type {
  ExternalCalendarEventSummary,
  ExternalRelationshipSignal,
  OrbitIntegrationProvider,
} from "../../integrations/contract";
import type { OrbitIntegrationService } from "../../integrations/service";
import { createConfiguredOrbitIntegrationService } from "../../integrations/service-factory";
import type { EventRecord } from "../../events/event-crud-and-import/contract";
import type { EventCrudAndImportService } from "../../events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../events/service-factory";
import type { PublishedCanonicalEvent } from "../../events/core/contract";
import { createConfiguredEventCoreService } from "../../events/core/runtime";
import type { RelationshipNaturalSearchResultItem } from "../../search/contract";
import type { RelationshipNaturalSearchService } from "../../search/service";
import { createRelationshipNaturalSearchService } from "../../search/service-factory";
import type { ModuleMode } from "../../../shared/services/module-mode";
import type { PreEventBriefPerson } from "./contract";
import type { ScheduledBriefCandidate } from "./scheduler";

const ONE_DAY_MS = 24 * 60 * 60_000;
const RELATIONSHIP_LOOKBACK_MS = 180 * ONE_DAY_MS;

export interface PreEventBriefCollectionContext {
  actorId: string;
  now: string;
  timeMax: string;
}

export interface PreEventBriefOrbitDataAdapter {
  listEvents: (
    context: PreEventBriefCollectionContext,
  ) => Promise<readonly PreEventBriefOrbitEvent[]>;
  listRelationships: (
    event: PreEventBriefOrbitEvent,
    context: PreEventBriefCollectionContext,
  ) => Promise<readonly RelationshipNaturalSearchResultItem[]>;
}

export interface PreEventBriefOrbitEvent extends EventRecord {
  canonicalEventRevision?: string;
  canonicalEventVersion?: number;
  canonicalTimeZone?: string;
}

/**
 * This read-only boundary deliberately exposes metadata DTOs only. It has no
 * message-body or send method, so the Brief pipeline cannot persist mail bodies
 * or send outbound communication.
 */
export interface PreEventBriefExternalDataAdapter {
  listCalendarEvents: (
    context: PreEventBriefCollectionContext,
  ) => Promise<readonly ExternalCalendarEventSummary[]>;
  listRelationshipSignals: (
    context: PreEventBriefCollectionContext,
  ) => Promise<readonly ExternalRelationshipSignal[]>;
}

export interface PreEventBriefDeliveryProfile {
  costlyMiss: boolean;
  pushEnabled: boolean;
  pushToken?: string;
}

export interface PreEventBriefDeliveryAdapter {
  getDeliveryProfile: (
    eventId: string,
    context: PreEventBriefCollectionContext,
  ) => Promise<PreEventBriefDeliveryProfile>;
}

export interface PreEventBriefCandidateCollector {
  collect: (input?: {
    now?: string;
  }) => Promise<readonly ScheduledBriefCandidate[]>;
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

function eventInWindow(
  startsAt: string,
  context: PreEventBriefCollectionContext,
): boolean {
  const timestamp = Date.parse(startsAt);
  return (
    Number.isFinite(timestamp) &&
    timestamp > Date.parse(context.now) &&
    timestamp <= Date.parse(context.timeMax)
  );
}

function normalizedTitle(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function calendarMatch(
  event: EventRecord,
  calendar: ExternalCalendarEventSummary,
): boolean {
  return (
    normalizedTitle(event.title) === normalizedTitle(calendar.title) &&
    Math.abs(Date.parse(event.startsAt) - Date.parse(calendar.startsAt)) <=
      12 * 60 * 60_000
  );
}

function unique(values: readonly (string | undefined)[]): string[] {
  return [
    ...new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  ];
}

function domainFor(organization: string): string | null {
  const normalized = organization
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  return normalized || null;
}

function signalsForRelationship(
  relationship: RelationshipNaturalSearchResultItem,
  signals: readonly ExternalRelationshipSignal[],
): readonly ExternalRelationshipSignal[] {
  const organizationDomain = domainFor(relationship.organization);
  if (!organizationDomain) return [];
  return signals.filter((signal) => {
    const signalDomain = domainFor(signal.counterpartDomain ?? "");
    return Boolean(
      signalDomain &&
      (signalDomain.includes(organizationDomain) ||
        organizationDomain.includes(signalDomain)),
    );
  });
}

function latestOccurredAt(
  evidence: RelationshipNaturalSearchResultItem["evidence"],
  signals: readonly ExternalRelationshipSignal[],
): string | undefined {
  return [
    ...evidence.map((item) => item.capturedAt),
    ...signals.map((item) => item.occurredAt),
  ]
    .filter(validDate)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function personFor(
  relationship: RelationshipNaturalSearchResultItem,
  externalSignals: readonly ExternalRelationshipSignal[],
): PreEventBriefPerson {
  const signals = signalsForRelationship(relationship, externalSignals);
  const orbitEvidenceIds = relationship.evidence.map(
    (evidence) => evidence.evidenceId,
  );
  const externalEvidenceIds = signals.map((signal) => signal.evidenceId);
  return {
    contactId: relationship.contactId,
    displayName: relationship.displayName,
    organization: relationship.organization || undefined,
    whyWorthMeeting:
      relationship.value.rationale || relationship.relationshipContext,
    lastInteraction: latestOccurredAt(relationship.evidence, signals),
    // Orbit relationship evidence is intentionally ordered before authorized
    // provider metadata. The workflow preserves this priority in its artifact.
    evidenceIds: unique([...orbitEvidenceIds, ...externalEvidenceIds]),
    evidenceSummaries: unique([
      ...relationship.evidence.map((evidence) => evidence.excerpt),
      ...signals.map((signal) => signal.subjectHint),
    ]),
    suggestedTopics: unique([
      ...relationship.matchScore.matchedFields,
      relationship.recommendedAction,
    ]).slice(0, 3),
    openCommitments:
      relationship.followUpStatus === "needs_follow_up" ||
      relationship.followUpStatus === "waiting_on_them"
        ? [relationship.recommendedAction]
        : [],
  };
}

function externalEventRecord(event: ExternalCalendarEventSummary): PreEventBriefOrbitEvent {
  return {
    id: `external-calendar:${event.providerRecordId}`,
    title: event.title,
    description: "Authorized calendar event metadata.",
    venue: event.location ?? "",
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? event.startsAt,
    status: "imported",
    sourceMetadata: {
      type: "calendar_signal",
      id: `source:calendar:${event.providerRecordId}`,
      label: "Authorized calendar metadata",
      captureMethod: "calendar_sync",
      provider: "authorized-calendar",
      providerRecordId: event.providerRecordId,
      importedAt: event.startsAt,
      calendarSyncRequested: false,
      organizerFeedRequested: false,
      liveDatabaseWriteExecuted: false,
      externalNetworkRequested: false,
    },
    evidence: [
      {
        evidenceId: event.evidenceId,
        source: {
          type: "calendar_signal",
          id: `source:calendar:${event.providerRecordId}`,
          label: "Authorized calendar metadata",
          captureMethod: "calendar_sync",
          provider: "authorized-calendar",
          providerRecordId: event.providerRecordId,
          importedAt: event.startsAt,
          calendarSyncRequested: false,
          organizerFeedRequested: false,
          liveDatabaseWriteExecuted: false,
          externalNetworkRequested: false,
        },
        excerpt: `${event.title} · ${event.startsAt}`,
        capturedAt: event.startsAt,
        createdBy: "authorized-calendar-metadata",
      },
    ],
    relationshipContext: event.title,
    recommendedPreparation: "Review the calendar metadata before the event.",
    nextAction: "Open the generated pre-event Brief.",
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

function mergeEvents(
  orbitEvents: readonly PreEventBriefOrbitEvent[],
  calendarEvents: readonly ExternalCalendarEventSummary[],
  context: PreEventBriefCollectionContext,
): readonly {
  event: PreEventBriefOrbitEvent;
  calendarEvidenceIds: readonly string[];
}[] {
  const orbit = orbitEvents
    .filter((event) => eventInWindow(event.startsAt, context))
    .map((event) => ({
      event,
      calendarEvidenceIds: calendarEvents
        .filter((calendar) => calendarMatch(event, calendar))
        .map((calendar) => calendar.evidenceId),
    }));
  const unmatchedCalendar = calendarEvents
    .filter((calendar) => eventInWindow(calendar.startsAt, context))
    .filter(
      (calendar) =>
        !orbitEvents.some((event) => calendarMatch(event, calendar)),
    )
    .map((calendar) => ({
      event: externalEventRecord(calendar),
      calendarEvidenceIds: [calendar.evidenceId],
    }));
  // Orbit-owned events always precede calendar-only events.
  return [...orbit, ...unmatchedCalendar];
}

export function createPreEventBriefCandidateCollector(input: {
  actorId: string;
  delivery?: PreEventBriefDeliveryAdapter;
  external: PreEventBriefExternalDataAdapter;
  now?: () => string;
  orbit: PreEventBriefOrbitDataAdapter;
}): PreEventBriefCandidateCollector {
  const actorId = input.actorId.trim();
  if (!actorId) {
    throw new Error(
      "Pre-event Brief collection requires an authenticated actor.",
    );
  }

  return {
    async collect(request = {}) {
      const now = request.now ?? input.now?.() ?? new Date().toISOString();
      const context: PreEventBriefCollectionContext = {
        actorId,
        now,
        timeMax: new Date(Date.parse(now) + ONE_DAY_MS).toISOString(),
      };

      // This order is deliberate and mirrors the product requirement:
      // Orbit events/relationships → authorized calendar → authorized
      // mail/calendar metadata signals.
      const orbitEvents = await input.orbit.listEvents(context);
      const relationshipsByEvent = new Map<
        string,
        readonly RelationshipNaturalSearchResultItem[]
      >();
      for (const event of orbitEvents.filter((candidate) =>
        eventInWindow(candidate.startsAt, context),
      )) {
        relationshipsByEvent.set(
          event.id,
          await input.orbit.listRelationships(event, context),
        );
      }
      const calendarEvents = await input.external.listCalendarEvents(context);
      const mergedEvents = mergeEvents(orbitEvents, calendarEvents, context);
      for (const { event } of mergedEvents) {
        if (!relationshipsByEvent.has(event.id)) {
          relationshipsByEvent.set(
            event.id,
            await input.orbit.listRelationships(event, context),
          );
        }
      }
      const externalSignals =
        await input.external.listRelationshipSignals(context);
      const candidates: ScheduledBriefCandidate[] = [];

      for (const { event, calendarEvidenceIds } of mergedEvents) {
        const relationships = relationshipsByEvent.get(event.id) ?? [];
        const delivery = input.delivery
          ? await input.delivery.getDeliveryProfile(event.id, context)
          : { costlyMiss: false, pushEnabled: false };
        const people = relationships.map((relationship) =>
          personFor(relationship, externalSignals),
        );
        candidates.push({
          eventId: event.id,
          eventRevision: event.canonicalEventRevision,
          eventVersion: event.canonicalEventVersion,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: validDate(event.endsAt) ? event.endsAt : undefined,
          location: event.venue || undefined,
          attendees: people,
          preparationGaps: unique([event.recommendedPreparation]),
          evidenceIds: unique([
            ...event.evidence.map((evidence) => evidence.evidenceId),
            ...calendarEvidenceIds,
            ...people.flatMap((person) => person.evidenceIds),
          ]),
          costlyMiss: delivery.costlyMiss,
          pushEnabled: delivery.pushEnabled,
          pushToken: delivery.pushToken,
          timeZone: event.canonicalTimeZone,
        });
      }

      return candidates;
    },
  };
}

function successfulEvents(
  result: Awaited<ReturnType<EventCrudAndImportService["listEvents"]>>,
): readonly EventRecord[] {
  return result.success ? result.data.events : [];
}

function successfulRelationships(
  result: Awaited<
    ReturnType<RelationshipNaturalSearchService["queryRelationships"]>
  >,
): readonly RelationshipNaturalSearchResultItem[] {
  return result.success ? result.data.results : [];
}

export function createDomainPreEventBriefOrbitAdapter(input: {
  events: EventCrudAndImportService;
  relationships: RelationshipNaturalSearchService;
}): PreEventBriefOrbitDataAdapter {
  return {
    async listEvents() {
      return successfulEvents(await input.events.listEvents());
    },
    async listRelationships(event) {
      return successfulRelationships(
        await input.relationships.queryRelationships({
          query: [event.title, event.relationshipContext]
            .filter(Boolean)
            .join(" "),
          limit: 12,
        }),
      );
    },
  };
}

function canonicalEvidenceIds(event: PublishedCanonicalEvent): readonly string[] {
  const sourcePayload = event.sourcePayload;
  const evidenceIds =
    sourcePayload &&
    typeof sourcePayload === "object" &&
    !Array.isArray(sourcePayload)
      ? (sourcePayload as Record<string, unknown>).evidenceIds
      : undefined;
  const normalized = Array.isArray(evidenceIds)
    ? evidenceIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];
  return normalized.length > 0
    ? [...new Set(normalized)]
    : [`evidence:event-core:${event.eventId}:v${event.eventVersion}`];
}

function canonicalEventToBriefEvent(
  event: PublishedCanonicalEvent,
  generatedAt: string,
): PreEventBriefOrbitEvent {
  const evidenceIds = canonicalEvidenceIds(event);
  const importedAt = new Date(generatedAt).toISOString();
  const sourceMetadata = {
    captureMethod: "organizer_feed" as const,
    calendarSyncRequested: false as const,
    externalNetworkRequested: false as const,
    id: `event-core-postgres:${event.eventId}:v${event.eventVersion}`,
    importedAt,
    label: "event-core-postgres",
    liveDatabaseWriteExecuted: false,
    organizerFeedRequested: false as const,
    provider: "event-core-postgres",
    providerRecordId: event.eventId,
    type: "event_import" as const,
  };
  return {
    aiProviderRequested: false,
    calendarProviderRequested: false,
    calendarSyncRequested: false,
    canonicalEventRevision: `${event.eventVersion}:${event.startsAt}:${event.endsAt}:${event.timezone}`,
    canonicalEventVersion: event.eventVersion,
    canonicalTimeZone: event.timezone,
    description: event.description?.trim() ?? "",
    emailProviderRequested: false,
    endsAt: event.endsAt,
    evidence: evidenceIds.map((evidenceId) => ({
      capturedAt: importedAt,
      createdBy: "event-core-postgres",
      evidenceId,
      excerpt: event.description?.trim() || `Canonical event ${event.eventId}.`,
      source: sourceMetadata,
    })),
    externalNetworkRequested: false,
    id: event.eventId,
    liveDatabaseWriteExecuted: false,
    nextAction: "Sign in and register before viewing the attendee list.",
    notificationDelivered: false,
    organizerFeedRequested: false,
    recommendedPreparation:
      "Review the canonical event details and complete the event-scoped registration profile.",
    relationshipContext: event.description?.trim() || "Published event context.",
    sourceMetadata,
    startsAt: event.startsAt,
    status: "imported",
    title: event.title,
    venue: event.venue?.trim() ?? "",
  };
}

export function createCanonicalEventCorePreEventBriefOrbitAdapter(input: {
  eventCore: NonNullable<ReturnType<typeof createConfiguredEventCoreService>>;
  relationships: RelationshipNaturalSearchService;
}): PreEventBriefOrbitDataAdapter {
  return {
    async listEvents(context) {
      const published = await input.eventCore.listPublishedEvents(
        new Date(context.now),
      );
      return published
        .filter((event) => eventInWindow(event.startsAt, context))
        .map((event) => canonicalEventToBriefEvent(event, context.now));
    },
    async listRelationships(event) {
      return successfulRelationships(
        await input.relationships.queryRelationships({
          query: [event.title, event.relationshipContext]
            .filter(Boolean)
            .join(" "),
          limit: 12,
        }),
      );
    },
  };
}

async function activeProviders(
  integrations: OrbitIntegrationService,
  now: string,
): Promise<readonly OrbitIntegrationProvider[]> {
  return (await integrations.listAuthorizations(now))
    .filter((authorization) => authorization.status === "active")
    .map((authorization) => authorization.provider);
}

export function createIntegrationPreEventBriefExternalAdapter(
  integrations: OrbitIntegrationService | null,
): PreEventBriefExternalDataAdapter {
  if (!integrations) {
    return {
      async listCalendarEvents() {
        return [];
      },
      async listRelationshipSignals() {
        return [];
      },
    };
  }

  return {
    async listCalendarEvents(context) {
      const providers = await activeProviders(integrations, context.now);
      const calendarProviders = providers.filter(
        (provider): provider is "google_calendar" | "microsoft_graph" =>
          provider === "google_calendar" || provider === "microsoft_graph",
      );
      const events: ExternalCalendarEventSummary[] = [];
      for (const provider of calendarProviders) {
        try {
          events.push(
            ...(await integrations.listCalendarEvents({
              provider,
              timeMin: context.now,
              timeMax: context.timeMax,
            })),
          );
        } catch {
          // A single unavailable provider must not suppress Orbit-owned data.
        }
      }
      return events;
    },
    async listRelationshipSignals(context) {
      const providers = await activeProviders(integrations, context.now);
      const signals: ExternalRelationshipSignal[] = [];
      const since = new Date(
        Date.parse(context.now) - RELATIONSHIP_LOOKBACK_MS,
      ).toISOString();
      for (const provider of providers) {
        try {
          signals.push(
            ...(await integrations.listRelationshipSignals({
              provider,
              since,
            })),
          );
        } catch {
          // Relationship signals enrich a Brief; they never block it.
        }
      }
      return signals.filter((signal) => signal.messageBodyPersisted === false);
    },
  };
}

export function createConfiguredPreEventBriefCandidateCollector(input: {
  actorId: string;
  delivery?: PreEventBriefDeliveryAdapter;
  mode?: ModuleMode | string;
  now?: () => string;
}): PreEventBriefCandidateCollector {
  const mode = input.mode;
  const integrations =
    mode === "live"
      ? createConfiguredOrbitIntegrationService({ actorId: input.actorId })
      : null;
  const relationships = createRelationshipNaturalSearchService(mode);
  const orbit =
    mode === "live"
      ? (() => {
          const eventCore = createConfiguredEventCoreService();
          if (!eventCore) {
            throw new Error(
              "Canonical Event Core is required for live pre-event reminders.",
            );
          }
          return createCanonicalEventCorePreEventBriefOrbitAdapter({
            eventCore,
            relationships,
          });
        })()
      : createDomainPreEventBriefOrbitAdapter({
          events: createEventCrudAndImportService(mode),
          relationships,
        });
  return createPreEventBriefCandidateCollector({
    actorId: input.actorId,
    delivery: input.delivery,
    external: createIntegrationPreEventBriefExternalAdapter(integrations),
    now: input.now,
    orbit,
  });
}
