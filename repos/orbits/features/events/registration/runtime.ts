import {
  createDeadlineGatedEventRegistrationService,
  resolveEventRegistrationAvailability,
  type EventRegistrationAvailability,
} from "./deadline-gated-service";
import { createConfiguredEventOperationsRepository } from "../event-operations/repository";
import { createEventRegistrationService } from "./service";
import { createConfiguredEventOperationsRegistrationWindowProvider } from "./storage/event-operations-window-provider";
import { createConfiguredEventRegistrationProvider } from "./storage/live-record-provider";
import type { EventRegistration } from "./contract";

const runtimeProvider = createConfiguredEventRegistrationProvider();
const runtimeBaseService = createEventRegistrationService({
  provider: runtimeProvider,
});
const eventOperationsRepository = createConfiguredEventOperationsRepository();
const runtimeWindowProvider =
  createConfiguredEventOperationsRegistrationWindowProvider();
const canonicalService = eventOperationsRepository
  ? {
      cancel: eventOperationsRepository.cancelCanonicalRegistration.bind(
        eventOperationsRepository,
      ),
      get: ({ eventId, userId }: { eventId: string; userId: string }) =>
        eventOperationsRepository.getCanonicalRegistration(eventId, userId),
      list: ({ eventId }: { eventId: string }) =>
        eventOperationsRepository.listCanonicalRegistrations(eventId),
      register: eventOperationsRepository.registerCanonicalParticipant.bind(
        eventOperationsRepository,
      ),
    }
  : null;

export const eventRegistrationRuntimeService =
  createDeadlineGatedEventRegistrationService({
    baseService: runtimeBaseService,
    canonicalService,
    projectionProvider: runtimeProvider,
    windowProvider: runtimeWindowProvider,
  });

export async function readRuntimeEventRegistrationAvailability(
  eventId: string,
): Promise<EventRegistrationAvailability> {
  try {
    return resolveEventRegistrationAvailability(
      await runtimeWindowProvider.getEnrollment(eventId),
    );
  } catch {
    return "unavailable";
  }
}

export async function listRuntimeEventRegistrationsForUser(input: {
  eventIds: readonly string[];
  userId: string;
}) {
  const eventIds = [...new Set(input.eventIds.filter(Boolean))];
  if (eventIds.length === 0) return [];
  const [projected, canonical, enrollmentEntries] = await Promise.all([
    runtimeProvider.listRegistrationsForUser(input.userId, eventIds),
    eventOperationsRepository
      ? eventOperationsRepository.listCanonicalRegistrationsForUser(
          input.userId,
          eventIds,
        )
      : Promise.resolve([]),
    Promise.all(
      eventIds.map(async (eventId) => [
        eventId,
        await runtimeWindowProvider.getEnrollment(eventId),
      ] as const),
    ),
  ]);
  const projectedByEventId = new Map<string, EventRegistration>(
    projected.map((registration) => [registration.eventId, registration] as const),
  );
  const canonicalByEventId = new Map<string, EventRegistration>(
    canonical.map((registration: EventRegistration) => [
      registration.eventId,
      registration,
    ] as const),
  );
  const enrollmentByEventId = new Map(enrollmentEntries);
  const registrations: EventRegistration[] = [];
  for (const eventId of eventIds) {
    const enrollment = enrollmentByEventId.get(eventId);
    const registration =
      enrollment?.state === "legacy_unenrolled" ||
      enrollment?.state === "legacy_importing"
        ? projectedByEventId.get(eventId)
        : canonicalByEventId.get(eventId);
    if (registration) registrations.push(registration);
  }
  return registrations;
}

export interface RuntimeEventRegistrationState {
  availability: EventRegistrationAvailability;
  registered: boolean;
}

/**
 * Read the per-user registration truth used by every event surface.
 *
 * Keeping availability and membership in one snapshot prevents callers from
 * combining a canonical registration with a guessed/default window state (or
 * vice versa). An unavailable window remains explicit instead of being
 * presented as open.
 */
export async function readRuntimeEventRegistrationStates(input: {
  eventIds: readonly string[];
  userId?: string | null;
}): Promise<Record<string, RuntimeEventRegistrationState>> {
  const eventIds = [...new Set(input.eventIds.filter(Boolean))];
  const [registrations, availabilityEntries] = await Promise.all([
    input.userId
      ? listRuntimeEventRegistrationsForUser({
          eventIds,
          userId: input.userId,
        })
      : Promise.resolve([]),
    Promise.all(
      eventIds.map(async (eventId) => [
        eventId,
        await readRuntimeEventRegistrationAvailability(eventId),
      ] as const),
    ),
  ]);
  const registeredEventIds = new Set(
    registrations
      .filter((registration) => registration.status === "rsvped")
      .map((registration) => registration.eventId),
  );

  return Object.fromEntries(
    availabilityEntries.map(([eventId, availability]) => [
      eventId,
      {
        availability,
        registered: registeredEventIds.has(eventId),
      },
    ]),
  );
}
