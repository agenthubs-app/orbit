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
