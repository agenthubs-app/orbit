import { readRuntimeEventRegistrationStatus } from "./registration/runtime";
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

  // Only "is this actor registered" is needed here: read event id and status,
  // not the whole registration (W0028). A read failure propagates.
  const registration = await readRuntimeEventRegistrationStatus({
    eventId,
    userId: actorId,
  });

  if (registration?.status !== "rsvped") {
    return null;
  }

  const operationsRepository = createConfiguredEventOperationsRepository();
  if (!operationsRepository) return null;
  const registrations = await operationsRepository.listCanonicalRegistrations(
    eventId,
  );
  return {
    attendees: registrations
      .filter((item) => item.status === "rsvped")
      .map((attendee) => ({
        displayName:
          attendee.participantProfile.displayName?.trim() || "Orbit attendee",
        organization: null,
        role: attendee.participantProfile.answers.positioning?.trim() || null,
      })),
    eventId,
  };
}
