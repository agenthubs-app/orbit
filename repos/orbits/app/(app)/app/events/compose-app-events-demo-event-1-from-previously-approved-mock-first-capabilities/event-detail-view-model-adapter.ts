import type {
  EventStatus,
} from "../../../../../features/events/event-crud-and-import/contract";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import { sourceBoundedAgenda } from "../../orbit-event-temporal";
import type { AppEventDetailSuccessModel } from "./event-detail-route-service";

function codeForEvent(id: string): string {
  const compact = id.replace(/[^a-z0-9]+/giu, "").toUpperCase();

  return compact || "EVENT";
}

function statusFor(input: {
  endsAt: string;
  startsAt: string;
  status: EventStatus;
}): OrbitLandingEventView["status"] {
  if (input.status === "cancelled") {
    return "ended";
  }

  const startsAt = new Date(input.startsAt).getTime();
  const endsAt = new Date(input.endsAt).getTime();
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

function agendaFor(model: AppEventDetailSuccessModel) {
  const event = model.eventDetail.event;
  return sourceBoundedAgenda({
    startsAt: model.canonicalEvent.startsAt,
    endsAt: model.canonicalEvent.endsAt,
    items: [
      {
        description: event.recommendedPreparation || model.readiness.summary,
        label: "Preparation",
      },
      {
        description: model.recommendations.summary,
        label: "Relationship matching",
      },
      {
        description: model.postEventReview.summary,
        label: "Post-event follow-up",
      },
    ],
  });
}

function attendeeViews(model: AppEventDetailSuccessModel) {
  return model.attendeeRoster.attendees.slice(0, 9).map((attendee) => ({
    initial:
      attendee.displayName.trim().slice(0, 1).toUpperCase() ||
      attendee.attendeeId.slice(0, 1).toUpperCase(),
    name: attendee.displayName,
    role: [attendee.role, attendee.organization].filter(Boolean).join(" · "),
  }));
}

export function eventDetailRouteToOrbitLandingEventView(
  model: AppEventDetailSuccessModel,
): OrbitLandingEventView {
  const event = model.eventDetail.event;
  const attendeeCount = model.attendeeRoster.attendees.length;
  const code = codeForEvent(event.id);
  const sceneAsset = getDemoEventSceneAsset(model.canonicalEvent.id);
  const summary =
    event.relationshipContext ||
    event.description ||
    model.sourceConsistency.displaySummary;
  const youRsvped = event.id !== "event_001";

  return {
    address: event.venue,
    agenda: agendaFor(model),
    brandColor: "#6359E9",
    cap: Math.max(attendeeCount, attendeeCount + 20, 20),
    code,
    descriptionZh: event.description || summary,
    detailLogoUrl: sceneAsset?.src ?? "",
    endsAt: model.canonicalEvent.endsAt,
    feeLabel: "Source-backed",
    host: event.sourceMetadata.label,
    id: event.id,
    industry: "relationship",
    logoUrl: sceneAsset?.src ?? "",
    mapX: 50,
    mapY: 50,
    name: model.canonicalEvent.title,
    organizer: event.sourceMetadata.label,
    participantCount: attendeeCount,
    place: model.canonicalEvent.venue,
    startsAt: model.canonicalEvent.startsAt,
    stats: {
      attendees: attendeeViews(model),
      authed: true,
      count: attendeeCount,
      youRsvped,
    },
    status: statusFor({
      endsAt: model.canonicalEvent.endsAt,
      startsAt: model.canonicalEvent.startsAt,
      status: event.status,
    }),
    summaryZh: summary,
    tags: ["live", event.status, event.sourceMetadata.captureMethod],
    theme: "globe",
    venue: model.canonicalEvent.venue,
    youRsvped,
  };
}
