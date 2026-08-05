import { createEventCrudAndImportService } from "../service-factory";
import { requireEventCapability } from "../event-access/guard";
import { createConfiguredEventAccessService } from "../event-access/runtime";
import { loadEventForRegistration } from "../registration/event-loader";
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
        const registration = await repository.getCanonicalRegistration(
          eventId,
          actorId,
        );
        return registration?.status === "rsvped";
      },
    },
    engine,
    eventSchedule: {
      async getCanonicalSchedule({ actorId, eventId }) {
        const event = await loadEventForRegistration(eventId, actorId);
        return event
          ? { endsAt: event.endsAt ?? event.startsAt, startsAt: event.startsAt }
          : null;
      },
    },
    registrationService: eventRegistrationRuntimeService,
    repository,
  });
}
