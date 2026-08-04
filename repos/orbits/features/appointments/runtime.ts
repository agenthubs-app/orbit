import { createConfiguredAppointmentRepository, resolveAcceptedEventContactContext } from "./postgres-repository";
import { createAppointmentService, type AppointmentService } from "./service";

export function createConfiguredAppointmentService(): AppointmentService | null {
  const repository = createConfiguredAppointmentRepository();
  return repository ? createAppointmentService({
    authorityVerifier: {
      async resolveAcceptedBilateralContact(input) {
        if (!input.eventId) return null;
        return resolveAcceptedEventContactContext({
          actorId: input.actorId,
          eventId: input.eventId,
          requestId: input.authorityReference,
        });
      },
    },
    repository,
  }) : null;
}
