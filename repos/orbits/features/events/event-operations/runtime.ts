import { requireEventCapability } from "../event-access/guard";
import { createConfiguredEventAccessService } from "../event-access/runtime";
import { createConfiguredEventCoreService } from "../core/runtime";
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
  const eventCore = createConfiguredEventCoreService();
  if (!repository || !eventAccess || !eventCore) return null;

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
        const event = await eventCore.getEvent(eventId);
        return event?.organizerActorId === actorId.trim();
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
        void actorId;
        const event = await eventCore.getPublishedEvent(eventId);
        return event
          ? { endsAt: event.endsAt, startsAt: event.startsAt }
          : null;
      },
    },
    registrationService: eventRegistrationRuntimeService,
    repository,
  });
}
