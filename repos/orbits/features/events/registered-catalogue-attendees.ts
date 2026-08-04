import { createOrbitLocalRemoteDatabase } from "../../shared/local-remote-store/orbit-database";
import { eventCodeFor } from "./public-route-code";
import { eventRegistrationRuntimeService } from "./registration/runtime";
import { createConfiguredEventOperationsRepository } from "./event-operations/repository";

export interface RegisteredCatalogueAttendee {
  displayName: string;
  organization: string | null;
  role: string | null;
}

export interface RegisteredCatalogueAttendeeContext {
  attendees: readonly RegisteredCatalogueAttendee[];
  eventId: string;
}

export async function readRegisteredCatalogueAttendees(input: {
  actorId: string;
  eventId: string;
}): Promise<RegisteredCatalogueAttendeeContext | null> {
  const actorId = input.actorId.trim();
  const eventId = input.eventId.trim();

  if (!actorId || !eventId) {
    return null;
  }

  const state = createOrbitLocalRemoteDatabase().getState();
  const event =
    state.events.find(
      (item, index) =>
        item.id === eventId || eventCodeFor(item, index) === eventId,
    ) ?? null;

  if (!event) {
    return null;
  }

  const registration = await eventRegistrationRuntimeService.get({
    eventId: event.id,
    userId: actorId,
  });

  if (registration?.status !== "rsvped") {
    return null;
  }

  const operationsRepository = createConfiguredEventOperationsRepository();
  const operationsConfiguration = operationsRepository
    ? await operationsRepository.getConfiguration(event.id)
    : null;
  if (operationsRepository && operationsConfiguration) {
    const registrations = await operationsRepository.listCanonicalRegistrations(
      event.id,
    );
    return {
      attendees: registrations
        .filter((item) => item.status === "rsvped")
        .map((item) => ({
          displayName:
            item.participantProfile.displayName?.trim() || "Orbit attendee",
          organization: null,
          role: item.participantProfile.answers.positioning?.trim() || null,
        })),
      eventId: event.id,
    };
  }

  return {
    attendees: state.attendees
      .filter((attendee) => attendee.eventId === event.id)
      .map((attendee) => ({
        displayName: attendee.displayName,
        organization: attendee.organization ?? null,
        role: attendee.role ?? null,
      })),
    eventId: event.id,
  };
}
