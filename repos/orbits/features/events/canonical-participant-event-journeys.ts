import type { PublishedCanonicalEvent } from "./core/contract";
import { createConfiguredEventCoreService } from "./core/runtime";
import type { EventCoreService } from "./core/service";
import { createConfiguredEventOperationsRepository } from "./event-operations/repository";
import type { EventOperationsRepository } from "./event-operations/repository";
import type { LiveDatabaseEnv } from "../../shared/storage/live-database-config";

export interface CanonicalParticipantEventJourneyReader {
  listRegisteredPublishedEvents(
    rawSubject: string,
  ): Promise<readonly PublishedCanonicalEvent[]>;
}

export interface CanonicalParticipantEventJourneyDependencies {
  eventCoreService: Pick<EventCoreService, "listPublishedEvents">;
  now?: () => Date;
  operationsRepository: Pick<
    EventOperationsRepository,
    "listCanonicalRegistrationsForUser"
  >;
}

export interface ConfiguredCanonicalParticipantEventJourneyOptions {
  env?: LiveDatabaseEnv;
  max?: number;
}

/**
 * Reads the participant's own canonical memberships without changing the
 * actor-scoped legacy Events Live Store query.
 *
 * `rawSubject` is intentional here: canonical membership_head.actor_id is the
 * authenticated subject used by registration, while Home's `actor.id` is the
 * canonical account id used for owned/private legacy event reads.
 */
export function createCanonicalParticipantEventJourneyReader(
  dependencies: CanonicalParticipantEventJourneyDependencies,
): CanonicalParticipantEventJourneyReader {
  return {
    async listRegisteredPublishedEvents(rawSubject) {
      const normalizedRawSubject = rawSubject.trim();
      if (!normalizedRawSubject) return [];

      const now = dependencies.now?.() ?? new Date();
      const publishedEvents =
        await dependencies.eventCoreService.listPublishedEvents(now);
      const eventIds = [
        ...new Set(
          publishedEvents
            .map((event) => event.eventId.trim())
            .filter(Boolean),
        ),
      ];
      if (eventIds.length === 0) return [];

      const registrations =
        await dependencies.operationsRepository.listCanonicalRegistrationsForUser(
          normalizedRawSubject,
          eventIds,
        );
      const registeredEventIds = new Set(
        registrations
          .filter(
            (registration) =>
              registration.status === "rsvped" &&
              registration.userId === normalizedRawSubject,
          )
          .map((registration) => registration.eventId.trim())
          .filter(Boolean),
      );

      const seenEventIds = new Set<string>();
      return publishedEvents.filter((event) => {
        const eventId = event.eventId.trim();
        if (!eventId || !registeredEventIds.has(eventId)) return false;
        if (seenEventIds.has(eventId)) return false;
        seenEventIds.add(eventId);
        return true;
      });
    },
  };
}

export function createConfiguredCanonicalParticipantEventJourneyReader(
  options: ConfiguredCanonicalParticipantEventJourneyOptions = {},
): CanonicalParticipantEventJourneyReader | null {
  const eventCoreService = createConfiguredEventCoreService(options);
  const operationsRepository = createConfiguredEventOperationsRepository(options);
  if (!eventCoreService || !operationsRepository) return null;

  return createCanonicalParticipantEventJourneyReader({
    eventCoreService,
    operationsRepository,
  });
}

export async function readConfiguredCanonicalParticipantEventJourneys(
  rawSubject: string,
  options: ConfiguredCanonicalParticipantEventJourneyOptions = {},
): Promise<readonly PublishedCanonicalEvent[]> {
  const reader = createConfiguredCanonicalParticipantEventJourneyReader(options);
  return reader ? reader.listRegisteredPublishedEvents(rawSubject) : [];
}
