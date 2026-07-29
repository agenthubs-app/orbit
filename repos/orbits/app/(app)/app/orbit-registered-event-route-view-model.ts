import {
  readRegisteredCatalogueAttendees,
  type RegisteredCatalogueAttendee,
} from "../../../features/events/registered-catalogue-attendees";
import { initialFor } from "./orbit-event-view-helpers";
import {
  getOrbitLandingViewModel,
  type OrbitEventAttendeeView,
  type OrbitLandingEventView,
} from "./orbit-landing-route-view-model";

function registeredAttendeeViews(
  attendees: readonly RegisteredCatalogueAttendee[],
): OrbitEventAttendeeView[] {
  return attendees.map((attendee) => ({
    initial: initialFor(attendee.displayName),
    name: attendee.displayName,
    role: [attendee.role, attendee.organization].filter(Boolean).join(" · "),
  }));
}

export async function getOrbitRegisteredEventViewModel(input: {
  actorId: string;
  eventId: string;
}): Promise<OrbitLandingEventView | null> {
  const actorId = input.actorId.trim();
  const eventId = input.eventId.trim();

  if (!actorId || !eventId) {
    return null;
  }

  const event =
    getOrbitLandingViewModel().events.find(
      (item) => item.id === eventId || item.code === eventId,
    ) ?? null;

  if (!event) {
    return null;
  }

  const registeredContext = await readRegisteredCatalogueAttendees({
    actorId,
    eventId: event.id,
  });

  if (!registeredContext || registeredContext.eventId !== event.id) {
    return null;
  }

  return {
    ...event,
    stats: {
      ...event.stats,
      attendees: registeredAttendeeViews(registeredContext.attendees),
      authed: true,
      youRsvped: true,
    },
    youRsvped: true,
  };
}
