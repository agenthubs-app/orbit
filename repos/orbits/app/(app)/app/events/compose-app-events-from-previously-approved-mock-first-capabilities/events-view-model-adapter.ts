import type {
  AppEventsEventChoiceViewModel,
  AppEventsRouteViewModel,
} from "./events-route-view-model";
import type {
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "../../orbit-landing-route-view-model";

type AppEventsSuccessRouteViewModel = Extract<
  AppEventsRouteViewModel,
  { state: "success" }
>;

function eventStatusFor(
  event: AppEventsEventChoiceViewModel,
): OrbitLandingEventView["status"] {
  if (event.status === "cancelled") {
    return "ended";
  }

  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt).getTime();
  const now = Date.now();

  if (Number.isFinite(endsAt) && endsAt < now) {
    return "ended";
  }

  if (
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt <= now &&
    now <= endsAt
  ) {
    return "active";
  }

  return "upcoming";
}

function attendeeFor(event: AppEventsEventChoiceViewModel) {
  const name = event.attendeeName.trim();

  if (!name || /review attendee/i.test(name)) {
    return [];
  }

  return [
    {
      initial: name.slice(0, 1).toUpperCase(),
      name,
      role: event.relationshipValue,
    },
  ];
}

function eventChoiceToLandingEvent(
  event: AppEventsEventChoiceViewModel,
  index: number,
): OrbitLandingEventView {
  const attendees = attendeeFor(event);
  const status = eventStatusFor(event);
  const description = [event.relationshipValue, event.nextAction]
    .filter(Boolean)
    .join(" ");

  return {
    address: event.venue,
    agenda: [
      {
        description: event.relationshipValue,
        label: "Relationship context",
        time: "Source",
      },
      {
        description: event.nextAction,
        label: "Next action",
        time: "Next",
      },
      {
        description: `Readiness score ${event.readinessScore}`,
        label: "Readiness",
        time: "Review",
      },
    ],
    brandColor: "#6359E9",
    cap: Math.max(20, attendees.length + 20),
    code: event.id,
    descriptionZh: description,
    detailLogoUrl: "",
    endsAt: event.endsAt,
    feeLabel: "Source-backed",
    host: "Orbit",
    id: event.id,
    industry: "Relationship",
    logoUrl: "",
    mapX: 38 + ((index * 11) % 34),
    mapY: 36 + ((index * 7) % 32),
    name: event.title,
    organizer: "Orbit",
    participantCount: attendees.length,
    place: event.venue,
    startsAt: event.startsAt,
    stats: {
      attendees,
      authed: true,
      count: attendees.length,
      youRsvped: true,
    },
    status,
    summaryZh: description,
    tags: [event.status, `readiness-${event.readinessScore}`],
    theme: "relationship",
    venue: event.venue,
    youRsvped: true,
  };
}

export function eventsRouteToOrbitLandingViewModel(
  model: AppEventsSuccessRouteViewModel,
): OrbitLandingViewModel {
  return {
    account: {
      fullName: "Orbit",
    },
    connections: [],
    events: model.workspace.eventChoices.map(eventChoiceToLandingEvent),
  };
}
