import {
  createDeadlineGatedEventRegistrationService,
  resolveEventRegistrationAvailability,
  resolveEventRegistrationWindowState,
  type EventRegistrationWindowState,
  type EventRegistrationAvailability,
} from "./deadline-gated-service";
import { createConfiguredEventCoreService } from "../core/runtime";
import { createConfiguredEventOperationsRepository } from "../event-operations/repository";
import { createEventRegistrationService } from "./service";
import { createConfiguredEventOperationsRegistrationWindowProvider } from "./storage/event-operations-window-provider";
import { createConfiguredEventRegistrationProvider } from "./storage/live-record-provider";
import type {
  EventRegistration,
  EventRegistrationRosterEntry,
  EventRegistrationRosterFields,
  EventRegistrationStatusRecord,
} from "./contract";

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
    const event = await createConfiguredEventCoreService()?.getPublishedEvent(eventId);
    if (!event) return "unavailable";
    if (event.phase !== "upcoming") return "registration_closed";
    return resolveEventRegistrationAvailability(await runtimeWindowProvider.getEnrollment(event.eventId));
  } catch {
    return "unavailable";
  }
}

// Unlike the legacy availability reader, read failures must reach the GET
// boundary as 503 rather than becoming a successful configuration diagnosis.
export async function readRuntimeEventRegistrationWindow(
  eventId: string,
): Promise<EventRegistrationWindowState> {
  const event = await createConfiguredEventCoreService()?.getPublishedEvent(eventId);
  if (!event) return { availability: "unavailable", blockingReason: "temporarily_unavailable" };
  if (event.phase !== "upcoming") return { availability: "registration_closed" };
  return resolveEventRegistrationWindowState(await runtimeWindowProvider.getEnrollment(event.eventId));
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

/**
 * Lightweight counterpart of `listRuntimeEventRegistrationsForUser` (W0028):
 * the same three reads and enrollment routing, but storage returns only the
 * event id and status. Used wherever only "is this actor registered" matters.
 */
export async function listRuntimeEventRegistrationStatusesForUser(input: {
  eventIds: readonly string[];
  userId: string;
}): Promise<EventRegistrationStatusRecord[]> {
  const eventIds = [...new Set(input.eventIds.filter(Boolean))];
  if (eventIds.length === 0) return [];
  const [projected, canonical, enrollmentEntries] = await Promise.all([
    runtimeProvider.listRegistrationStatusesForUser(input.userId, eventIds),
    eventOperationsRepository
      ? eventOperationsRepository.listCanonicalRegistrationStatusesForUser(
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
  const projectedByEventId = new Map<string, EventRegistrationStatusRecord>(
    projected.map((registration) => [registration.eventId, registration] as const),
  );
  const canonicalByEventId = new Map<string, EventRegistrationStatusRecord>(
    canonical.map((registration) => [registration.eventId, registration] as const),
  );
  const enrollmentByEventId = new Map(enrollmentEntries);
  const registrations: EventRegistrationStatusRecord[] = [];
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

/**
 * Lightweight counterpart of `eventRegistrationRuntimeService.get` (W0028):
 * the same routing (one enrollment read, then one storage read), returning
 * only the event id and status.
 */
export async function readRuntimeEventRegistrationStatus(input: {
  eventId: string;
  userId: string;
}): Promise<EventRegistrationStatusRecord | null> {
  if (!eventOperationsRepository) {
    return runtimeProvider.getRegistrationStatus(input.eventId, input.userId);
  }
  const enrollment = await runtimeWindowProvider.getEnrollment(input.eventId);
  return enrollment.state === "legacy_unenrolled" ||
    enrollment.state === "legacy_importing"
    ? runtimeProvider.getRegistrationStatus(input.eventId, input.userId)
    : eventOperationsRepository.getCanonicalRegistrationStatus(
        input.eventId,
        input.userId,
      );
}

/**
 * Trimmed counterpart of `eventRegistrationRuntimeService.list` (W0029): the
 * same routing (no canonical repository → legacy; otherwise one enrollment
 * read, then legacy or canonical), returning only what the roster or the
 * anonymous preview reads.
 */
export async function listRuntimeEventRosterEntries(input: {
  eventId: string;
  fields: EventRegistrationRosterFields;
}): Promise<readonly EventRegistrationRosterEntry[]> {
  if (!eventOperationsRepository) {
    return runtimeProvider.listRegistrationRosterEntries(input.eventId, input.fields);
  }
  const enrollment = await runtimeWindowProvider.getEnrollment(input.eventId);
  return enrollment.state === "legacy_unenrolled" ||
    enrollment.state === "legacy_importing"
    ? runtimeProvider.listRegistrationRosterEntries(input.eventId, input.fields)
    : eventOperationsRepository.listCanonicalRosterEntries(
        input.eventId,
        input.fields,
      );
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
      ? listRuntimeEventRegistrationStatusesForUser({
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
