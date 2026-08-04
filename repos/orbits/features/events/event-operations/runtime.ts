import { createEventCrudAndImportService } from "../service-factory";
import { requireEventCapability } from "../event-access/guard";
import { createConfiguredEventAccessService } from "../event-access/runtime";
import { eventRegistrationRuntimeService } from "../registration/runtime";
import { createConfiguredEventOperationsAiProvider } from "./ai-provider";
import { createEventOperationsEngine } from "./engine";
import { createConfiguredEventOperationsRepository } from "./repository";
import {
  createEventOperationsService,
  type EventOperationsService,
} from "./service";

export function createConfiguredEventOperationsService(): EventOperationsService | null {
  const repository = createConfiguredEventOperationsRepository();
  const eventAccess = createConfiguredEventAccessService();
  if (!repository || !eventAccess) return null;

  const eventService = createEventCrudAndImportService("live");
  const engine = createEventOperationsEngine({
    aiProvider: createConfiguredEventOperationsAiProvider(),
    repository,
  });

  return createEventOperationsService({
    access: {
      async requireCapability({ actorId, capability, eventId }) {
        await requireEventCapability({
          actorId,
          capability,
          eventId,
          service: eventAccess,
        });
      },
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
