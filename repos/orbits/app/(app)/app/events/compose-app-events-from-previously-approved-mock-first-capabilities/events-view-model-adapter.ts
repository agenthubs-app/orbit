import type {
  AppEventsEventChoiceViewModel,
  AppEventsRouteViewModel,
} from "./events-route-view-model";
import type {
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "../../orbit-landing-route-view-model";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";

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
  const sceneAsset = getDemoEventSceneAsset(event.id);

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
    detailLogoUrl: sceneAsset?.src ?? "",
    endsAt: event.endsAt,
    feeLabel: "Source-backed",
    host: "Orbit",
    id: event.id,
    industry: "Relationship",
    logoUrl: sceneAsset?.src ?? "",
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
    // UI-audit fix C5. This synthesised "tags" from two values that are not
    // topics: the raw status enum and the readiness score formatted as a slug.
    // Both surfaces that read event.tags treat it as the card's topic row and
    // as the topic filter chips, so /app/events offered filters reading
    // "confirmed", "imported", "draft" and "readiness-75" — internal tokens,
    // untranslated, and the status one duplicating the dedicated status chip
    // group right beside it. Status stays available as event.status; readiness
    // is a score, not a topic. No real topic data exists yet, so the row falls
    // back to industry alone rather than inventing labels.
    tags: [],
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
