import type {
  EventStatus,
} from "../../../../../features/events/event-crud-and-import/contract";
import { getDemoEventSceneAsset } from "../../../../../shared/demo-visual-assets";
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import type { AppEventDetailSuccessModel } from "./event-detail-route-service";

export interface OrbitEventDetailRelationshipPersonView {
  context: string;
  evidenceIds: readonly string[];
  name: string;
  organization: string;
  role: string;
}

export interface OrbitEventDetailReadinessItemView {
  label: string;
  rationale: string;
  status: string;
}

export interface OrbitEventDetailSideEffectView {
  calendarUpdateExecuted: false;
  databaseWriteExecuted: boolean;
  externalMessageSent: false;
  externalNetworkRequested: false;
  notificationDelivered: false;
  peerNotificationDelivered: false;
  realtimePresenceRequested: false;
  sideEffectsLabel: "none" | "live-storage";
}

export interface OrbitEventDetailRelationshipContextView {
  eventRelationshipContext: string;
  evidenceIds: readonly string[];
  firstAction: string;
  goalIntent: string;
  openingLine: string;
  preparation: string;
  primaryPerson: OrbitEventDetailRelationshipPersonView;
  readinessItems: readonly OrbitEventDetailReadinessItemView[];
  readinessSummary: string;
  recommendedPeople: readonly OrbitEventDetailRelationshipPersonView[];
  sideEffects: OrbitEventDetailSideEffectView;
  sourceConsistencySummary: string;
}

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
  const start = new Date(event.startsAt);
  const startHour = Number.isFinite(start.getTime()) ? start.getHours() : 18;
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    {
      description: event.recommendedPreparation || model.readiness.summary,
      label: "Preparation",
      time: `${pad(startHour)}:00`,
    },
    {
      description: model.recommendations.summary,
      label: "Relationship matching",
      time: `${pad((startHour + 1) % 24)}:00`,
    },
    {
      description: model.postEventReview.summary,
      label: "Post-event follow-up",
      time: `${pad((startHour + 2) % 24)}:00`,
    },
  ];
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

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function primaryRelationshipPerson(
  model: AppEventDetailSuccessModel,
): OrbitEventDetailRelationshipPersonView {
  const match = model.wantConnectMatches.matches[0];
  const name =
    match?.participantNames.find((participantName) =>
      !participantName.toLowerCase().includes("orbit operator"),
    ) ??
    match?.participantNames[0] ??
    model.recommendations.recommendations[0]?.attendee.displayName ??
    "Recommended attendee";

  return {
    context:
      match?.successNotice.message ??
      model.recommendations.recommendations[0]?.attendee.relationshipContext ??
      model.eventDetail.event.relationshipContext,
    evidenceIds: match?.evidenceIds ?? model.wantConnectMatches.provenance.evidenceIds,
    name,
    organization:
      model.recommendations.recommendations.find(
        (recommendation) => recommendation.attendee.displayName === name,
      )?.attendee.organization ?? "Source-backed attendee",
    role:
      model.recommendations.recommendations.find(
        (recommendation) => recommendation.attendee.displayName === name,
      )?.attendee.role ?? "Relationship lead",
  };
}

function recommendedPeople(
  model: AppEventDetailSuccessModel,
): readonly OrbitEventDetailRelationshipPersonView[] {
  return model.recommendations.recommendations.slice(0, 3).map((recommendation) => ({
    context:
      recommendation.reasons[0] ??
      recommendation.attendee.relationshipContext,
    evidenceIds: recommendation.evidenceIds,
    name: recommendation.attendee.displayName,
    organization: recommendation.attendee.organization,
    role: recommendation.attendee.role,
  }));
}

export function eventDetailRouteToRelationshipContextView(
  model: AppEventDetailSuccessModel,
): OrbitEventDetailRelationshipContextView {
  const actionResult = model.actionResult;

  return {
    eventRelationshipContext: model.eventDetail.event.relationshipContext,
    evidenceIds: uniqueStrings([
      ...model.canonicalEvent.evidenceIds,
      ...model.sourceConsistency.evidenceIds,
      ...model.wantConnectMatches.provenance.evidenceIds,
      ...model.recommendations.provenance.evidenceIds,
      ...model.readiness.provenance.evidenceIds,
    ]),
    firstAction:
      model.wantConnectMatches.matches[0]?.successNotice.nextAction ??
      model.eventDetail.event.nextAction,
    goalIntent: model.readiness.goal?.intent ?? model.readiness.summary,
    openingLine: model.openingLine.openingLine.text,
    preparation:
      model.eventDetail.event.recommendedPreparation ||
      model.readiness.preparationState.nextPreparationStep,
    primaryPerson: primaryRelationshipPerson(model),
    readinessItems: model.readiness.readinessChecklist.slice(0, 4).map((item) => ({
      label: item.label,
      rationale: item.rationale,
      status: item.status,
    })),
    readinessSummary: model.readiness.summary,
    recommendedPeople: recommendedPeople(model),
    sideEffects: {
      calendarUpdateExecuted: false,
      databaseWriteExecuted: actionResult?.databaseWriteExecuted ?? false,
      externalMessageSent: false,
      externalNetworkRequested: false,
      notificationDelivered: false,
      peerNotificationDelivered: false,
      realtimePresenceRequested: false,
      sideEffectsLabel: actionResult?.sideEffectsLabel ?? "none",
    },
    sourceConsistencySummary: model.sourceConsistency.displaySummary,
  };
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
