import type { EventAccessService } from "../../../features/events/event-access/service";
import { createConfiguredEventAccessService } from "../../../features/events/event-access/runtime";
import type { EventOperationsCatalogueSummary } from "../../../features/events/event-operations/repository";
import { readEventOperationsCatalogueSummary } from "../../../features/events/event-operations/catalogue-summary";
import {
  publishedCanonicalEventToEventDTO,
} from "../../../features/events/core/public-catalogue";
import { createConfiguredEventCoreService } from "../../../features/events/core/runtime";
import type { EventCoreService } from "../../../features/events/core/service";
import { createEventCrudAndImportService } from "../../../features/events/service-factory";
import {
  readRegisteredCatalogueAttendees,
  type RegisteredCatalogueAttendeeContext,
} from "../../../features/events/registered-catalogue-attendees";
import type { EventRegistrationAvailability } from "../../../features/events/registration/deadline-gated-service";
import { readRuntimeEventRegistrationAvailability } from "../../../features/events/registration/runtime";
import { getOrbitLandingEventView, type OrbitLandingEventView } from "./orbit-landing-route-view-model";
import { getOrbitRegisteredEventViewModel } from "./orbit-registered-event-route-view-model";

export type CanonicalEventDetailResolution =
  | { state: "authentication_required" }
  | { state: "forbidden" }
  | { state: "not_found" }
  | { state: "unavailable" }
  | {
      canOpenOperations: boolean;
      event: OrbitLandingEventView;
      registrationAvailability: EventRegistrationAvailability;
      registered: boolean;
      state: "success";
      workspaceAvailable: boolean;
    };

export interface CanonicalEventDetailDependencies {
  accessService: EventAccessService | null;
  coreService: EventCoreService;
  now: Date;
  readOperationsSummary: (
    eventId: string,
  ) => Promise<EventOperationsCatalogueSummary | null>;
  readRegistrationAvailability: (
    eventId: string,
  ) => Promise<EventRegistrationAvailability>;
  readRegisteredContext: (input: {
    actorId: string;
    eventId: string;
  }) => Promise<RegisteredCatalogueAttendeeContext | null>;
  resolveActorEventCanonicalId?: (input: {
    actorId: string;
    eventId: string;
  }) => Promise<string | null>;
}

export async function resolveConfiguredActorEventCanonicalIds(input: {
  actorId: string;
  eventIds: readonly string[];
}): Promise<Record<string, string>> {
  const routeIds = new Set(input.eventIds.map((eventId) => eventId.trim()).filter(Boolean));
  if (routeIds.size === 0) return {};

  const result = await createEventCrudAndImportService("live").listEvents({
    actorId: input.actorId,
  });
  if (result.success === false) return {};

  return Object.fromEntries(
    result.data.events
      .filter((event) => routeIds.has(event.id))
      .map((event) => {
        const canonicalId = event.sourceMetadata.providerRecordId.trim();
        return [event.id, canonicalId || event.id];
      }),
  );
}

export async function resolveConfiguredActorEventCanonicalId(input: {
  actorId: string;
  eventId: string;
}): Promise<string | null> {
  const resolved = await resolveConfiguredActorEventCanonicalIds({
    actorId: input.actorId,
    eventIds: [input.eventId],
  });
  const canonicalId = resolved[input.eventId];
  return canonicalId && canonicalId !== input.eventId ? canonicalId : null;
}

export async function resolveCanonicalEventDetailView(
  input: { actorId?: string | null; routeId: string },
  dependencies: CanonicalEventDetailDependencies,
): Promise<CanonicalEventDetailResolution> {
  const routeId = input.routeId.trim();
  if (!routeId) return { state: "not_found" };

  const actorId = input.actorId?.trim() || null;
  let canonicalEvent = await dependencies.coreService.getPublishedEvent(
    routeId,
    dependencies.now,
  );
  if (
    !canonicalEvent &&
    actorId &&
    dependencies.resolveActorEventCanonicalId
  ) {
    const canonicalId = await dependencies.resolveActorEventCanonicalId({
      actorId,
      eventId: routeId,
    });
    if (canonicalId) {
      canonicalEvent = await dependencies.coreService.getPublishedEvent(
        canonicalId,
        dependencies.now,
      );
    }
  }
  if (!canonicalEvent) return { state: "not_found" };

  const publiclyVisible = Boolean(canonicalEvent.publicCode?.trim());
  if (!publiclyVisible && !actorId) {
    return { state: "authentication_required" };
  }

  const operationSummaryPromise = dependencies.readOperationsSummary(
    canonicalEvent.eventId,
  );
  const registrationAvailabilityPromise =
    dependencies.readRegistrationAvailability(canonicalEvent.eventId);
  const registeredContextPromise = actorId
    ? dependencies.readRegisteredContext({
        actorId,
        eventId: canonicalEvent.eventId,
      })
    : Promise.resolve(null);
  const accessPromise = actorId && dependencies.accessService
    ? dependencies.accessService.get({
        eventId: canonicalEvent.eventId,
        subjectActorId: actorId,
      })
    : Promise.resolve(null);
  const [operationSummary, registrationAvailability, registeredContext, access] = await Promise.all([
    operationSummaryPromise,
    registrationAvailabilityPromise,
    registeredContextPromise,
    accessPromise,
  ]);

  const owner = actorId === canonicalEvent.organizerActorId || access?.owner === true;
  const activeEventRole = access?.state === "active" && access.role !== null;
  const registered = registeredContext !== null;
  if (!publiclyVisible && !owner && !activeEventRole && !registered) {
    // A missing access runtime makes private authorization indeterminate; keep
    // the boundary unavailable rather than pretending that the event is absent.
    if (actorId && !dependencies.accessService) return { state: "unavailable" };
    return { state: "forbidden" };
  }

  const participantCount = operationSummary?.activeRegistrationCount ?? 0;
  const event = getOrbitLandingEventView({
    event: publishedCanonicalEventToEventDTO(canonicalEvent),
    evidenceSummary:
      canonicalEvent.description?.trim() ||
      "Source-backed event loaded from canonical Event Core.",
    generatedAt: dependencies.now.toISOString(),
    participantCount,
    routeCode: canonicalEvent.publicCode?.trim() || canonicalEvent.eventId,
  });
  const registeredEvent = actorId && registered
    ? await getOrbitRegisteredEventViewModel({
        actorId,
        event,
        registeredContext,
      })
    : null;

  return {
    canOpenOperations: owner || activeEventRole,
    event: registeredEvent ?? {
      ...event,
      stats: {
        ...event.stats,
        authed: Boolean(actorId),
      },
    },
    registrationAvailability,
    registered,
    state: "success",
    workspaceAvailable: operationSummary !== null,
  };
}

export async function resolveConfiguredCanonicalEventDetailView(input: {
  actorId?: string | null;
  routeId: string;
}): Promise<CanonicalEventDetailResolution> {
  const coreService = createConfiguredEventCoreService();
  if (!coreService) return { state: "unavailable" };
  return resolveCanonicalEventDetailView(input, {
    accessService: createConfiguredEventAccessService(),
    coreService,
    now: new Date(),
    readOperationsSummary: readEventOperationsCatalogueSummary,
    readRegistrationAvailability: readRuntimeEventRegistrationAvailability,
    readRegisteredContext: readRegisteredCatalogueAttendees,
    resolveActorEventCanonicalId: resolveConfiguredActorEventCanonicalId,
  });
}
