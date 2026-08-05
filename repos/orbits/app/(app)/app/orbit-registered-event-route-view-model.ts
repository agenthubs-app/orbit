import {
  readRegisteredCatalogueAttendees,
  type RegisteredCatalogueAttendee,
  type RegisteredCatalogueAttendeeContext,
} from "../../../features/events/registered-catalogue-attendees";
import { initialFor } from "./orbit-event-view-helpers";
import {
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
  event: OrbitLandingEventView;
  registeredContext?: RegisteredCatalogueAttendeeContext | null;
}): Promise<OrbitLandingEventView | null> {
  const actorId = input.actorId.trim();
  const eventId = input.event.id.trim();

  if (!actorId || !eventId) {
    return null;
  }

  const registeredContext = input.registeredContext === undefined
    ? await readRegisteredCatalogueAttendees({ actorId, eventId })
    : input.registeredContext;

  if (!registeredContext || registeredContext.eventId !== eventId) {
    return null;
  }

  return {
    ...input.event,
    participantCount: registeredContext.attendees.length,
    stats: {
      ...input.event.stats,
      attendees: registeredAttendeeViews(registeredContext.attendees),
      authed: true,
      count: registeredContext.attendees.length,
      youRsvped: true,
    },
    youRsvped: true,
  };
}
