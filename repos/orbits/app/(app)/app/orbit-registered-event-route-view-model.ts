import { eventRegistrationRuntimeService } from "../../../features/events/registration/runtime";
import {
  attendeesForEvent,
  getOrbitHybridRouteData,
  initialFor,
} from "./orbit-hybrid-route-data";
import {
  getOrbitLandingViewModel,
  type OrbitEventAttendeeView,
  type OrbitLandingEventView,
} from "./orbit-landing-route-view-model";

function registeredAttendeeViews(eventId: string): OrbitEventAttendeeView[] {
  const data = getOrbitHybridRouteData();

  return attendeesForEvent(data, eventId).map((attendee) => ({
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

  const registration = await eventRegistrationRuntimeService.get({
    eventId: event.id,
    userId: actorId,
  });

  if (registration?.status !== "rsvped") {
    return null;
  }

  return {
    ...event,
    stats: {
      ...event.stats,
      attendees: registeredAttendeeViews(event.id),
      authed: true,
      youRsvped: true,
    },
    youRsvped: true,
  };
}
