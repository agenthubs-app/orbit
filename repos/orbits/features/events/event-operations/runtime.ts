import { createEventCrudAndImportService } from "../service-factory";
import { eventRegistrationRuntimeService } from "../registration/runtime";
import { createEventOperationsAiProvider } from "./ai-provider";
import { createEventOperationsEngine } from "./engine";
import { createConfiguredEventOperationsRepository } from "./repository";
import {
  createEventOperationsService,
  type EventOperationsService,
} from "./service";

export function createConfiguredEventOperationsService(): EventOperationsService | null {
  const repository = createConfiguredEventOperationsRepository();
  if (!repository) return null;

  const eventService = createEventCrudAndImportService("live");
  const engine = createEventOperationsEngine({
    aiProvider: createEventOperationsAiProvider(),
    repository,
  });

  return createEventOperationsService({
    access: {
      async isOrganizer({ actorId, eventId }) {
        const result = await eventService.getEvent({ actorId, eventId });
        return result.success === true;
      },
      async isRegistered({ actorId, eventId }) {
        const registration = await eventRegistrationRuntimeService.get({
          eventId,
          userId: actorId,
        });
        return registration?.status === "rsvped";
      },
    },
    engine,
    registrationService: eventRegistrationRuntimeService,
    repository,
  });
}
