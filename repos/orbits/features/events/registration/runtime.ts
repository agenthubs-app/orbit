import { createDeadlineGatedEventRegistrationService } from "./deadline-gated-service";
import { createConfiguredEventOperationsRepository } from "../event-operations/repository";
import { createEventRegistrationService } from "./service";
import { createConfiguredEventOperationsRegistrationWindowProvider } from "./storage/event-operations-window-provider";
import { createConfiguredEventRegistrationProvider } from "./storage/live-record-provider";

const runtimeProvider = createConfiguredEventRegistrationProvider();
const runtimeBaseService = createEventRegistrationService({
  provider: runtimeProvider,
});
const eventOperationsRepository = createConfiguredEventOperationsRepository();
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
    windowProvider:
      createConfiguredEventOperationsRegistrationWindowProvider(),
  });

export async function listRuntimeEventRegistrationsForUser(input: {
  eventIds: readonly string[];
  userId: string;
}) {
  const eventIds = [...new Set(input.eventIds.filter(Boolean))];
  if (eventIds.length === 0) return [];
  const [projected, canonical] = await Promise.all([
    runtimeProvider.listRegistrationsForUser(input.userId, eventIds),
    eventOperationsRepository
      ? eventOperationsRepository.listCanonicalRegistrationsForUser(
          input.userId,
          eventIds,
        )
      : Promise.resolve([]),
  ]);
  const byEventId = new Map(
    projected.map((registration) => [registration.eventId, registration]),
  );
  for (const registration of canonical) {
    // Canonical membership is authoritative when an enrolled event also has a
    // best-effort live-record projection.
    byEventId.set(registration.eventId, registration);
  }
  return [...byEventId.values()];
}
