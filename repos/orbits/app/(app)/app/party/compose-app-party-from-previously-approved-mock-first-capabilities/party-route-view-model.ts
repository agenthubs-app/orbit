import {
  loadAppEventDetailRoute,
  type AppEventDetailBoundaryModel,
  type AppEventDetailSuccessModel,
} from "../../events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import {
  loadAppProfileRouteViewModel,
  type AppProfileSearchParams,
} from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import type {
  OrbitPartyAgendaItemView,
  OrbitPartyPersonView,
  OrbitPartyViewModel,
} from "../../orbit-party-route-view-model";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";

export type AppPartySearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppPartyRouteScenario = "empty" | "pending" | "failure";

export interface AppPartyRouteInput {
  eventId?: string | null;
  mode?: ModuleMode | string | null;
  scenario?: string | null;
  searchParams?: AppPartySearchParams;
}

export interface AppPartyRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly {
    id: string;
    href: string;
    label: string;
    recoveryCopy: string;
  }[];
  scenario: AppPartyRouteScenario;
}

export type AppPartyRouteViewModel =
  | {
      state: "success";
      party: OrbitPartyViewModel;
    }
  | {
      state: "route-state";
      routeState: AppPartyRouteStateViewModel;
    };

const gradientClasses = [
  "g-indigo",
  "g-blue",
  "g-green",
  "g-rose",
  "g-amber",
] as const;

function readSearchParam(
  searchParams: AppPartySearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeScenario(scenario?: string | null): AppPartyRouteScenario | null {
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function initialFor(name: string, fallback = "O"): string {
  return name.trim().slice(0, 1).toUpperCase() || fallback;
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, "").toUpperCase();
}

function defaultEventIdFor(mode?: ModuleMode | string | null): string {
  const resolvedMode = resolveModuleMode(mode ?? undefined);

  return resolvedMode === "mock" ? "demo-event-1" : "event_01";
}

function routeEventId(input: AppPartyRouteInput): string {
  return (
    input.eventId?.trim() ||
    readSearchParam(input.searchParams, "eventId")?.trim() ||
    readSearchParam(input.searchParams, "code")?.trim() ||
    defaultEventIdFor(input.mode ?? readSearchParam(input.searchParams, "mode"))
  );
}

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds.filter(Boolean)));
}

function routeState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  scenario: AppPartyRouteScenario;
}): AppPartyRouteViewModel {
  const copyByScenario = {
    empty: {
      description:
        "No reviewed event, attendee, recommendation, or profile context is ready for the party surface.",
      emptyState:
        "The party screen stays hidden until an event workspace has source-backed people context.",
      eyebrow: "Party",
      guardrail:
        "This route only reads event, attendee, recommendation, and profile sources. It does not check people in, create contacts, send notifications, write calendars, call AI, or contact external providers.",
      nextStep: "Open an event with reviewed attendee context before entering party mode.",
      purpose:
        "Keep the party experience tied to reviewed live-capable event sources.",
      title: "Party is not ready",
    },
    failure: {
      description: "Party could not load event or profile context.",
      emptyState:
        "No check-in was recorded, no contact was created, and no external provider was contacted.",
      eyebrow: "Party",
      guardrail:
        "The failed route state stops before check-in writes, notifications, contact creation, calendar, email, AI, or outside network work.",
      nextStep:
        "Confirm the Events live store, event capability records, and profile sources are configured, then retry party mode.",
      purpose:
        "Show a recoverable party boundary without falling back to legacy hybrid route data.",
      title: "Party could not load",
    },
    pending: {
      description:
        "Party context is waiting for reviewed event, attendee, recommendation, or profile sources.",
      emptyState:
        "The party screen is held until the live-capable event workspace is ready.",
      eyebrow: "Party",
      guardrail:
        "Pending party context cannot create check-ins, contacts, notifications, or external work.",
      nextStep:
        "Check the event again after roster and recommendation review finishes.",
      purpose:
        "Keep party mode stable while source review is pending.",
      title: "Party is loading",
    },
  } as const;

  return {
    routeState: {
      copy: copyByScenario[input.scenario],
      errorCode: input.errorCode ?? null,
      evidenceIds: uniqueEvidenceIds([
        input.errorCode ?? "",
        ...input.evidenceIds,
      ]),
      recoveryActions: [
        {
          id: "party-return-events",
          href: "/app/events",
          label: "Return to events",
          recoveryCopy:
            "Open an event with reviewed attendee context before retrying party mode.",
        },
      ],
      scenario: input.scenario,
    },
    state: "route-state",
  };
}

function routeStateFromEventBoundary(
  boundary: AppEventDetailBoundaryModel,
): AppPartyRouteViewModel {
  return routeState({
    errorCode: boundary.evidence[0] ?? null,
    evidenceIds: boundary.evidence,
    scenario: boundary.routeState,
  });
}

function agendaFor(model: AppEventDetailSuccessModel): OrbitPartyAgendaItemView[] {
  const start = new Date(model.canonicalEvent.startsAt);
  const end = new Date(model.canonicalEvent.endsAt);
  const startTime = Number.isFinite(start.getTime())
    ? start.toISOString().slice(11, 16)
    : "18:00";
  const endTime = Number.isFinite(end.getTime())
    ? end.toISOString().slice(11, 16)
    : "20:00";

  return [
    {
      description: model.readiness.summary,
      label: "Check in and context review",
      time: startTime,
    },
    {
      description: model.recommendations.summary,
      label: "Structured introductions",
      time: endTime,
    },
    {
      description: model.postEventReview.summary,
      label: "Follow-up capture",
      time: "After",
    },
  ];
}

function personFromRecommendation(
  model: AppEventDetailSuccessModel,
  index: number,
): OrbitPartyPersonView {
  const recommendation = model.recommendations.recommendations[index];

  if (!recommendation) {
    throw new Error("party recommendation requires a recommendation payload");
  }

  const attendee = recommendation.attendee;
  const topics = recommendation.matchSignals.length
    ? recommendation.matchSignals.map((signal) => signal.label).slice(0, 4)
    : [attendee.eventIntent, attendee.relationshipContext].filter(Boolean).slice(0, 4);
  const company = attendee.organization || "Event attendee";

  return {
    company,
    g: gradientClasses[index % gradientClasses.length],
    groupNumber: (index % 4) + 1,
    icebreakers: [
      recommendation.openingLine.text,
      recommendation.recommendedAction,
    ],
    id: attendee.attendeeId,
    industry: topics[0] ?? "Relationship",
    initial: initialFor(attendee.displayName),
    name: attendee.displayName,
    offering: attendee.relationshipContext,
    reason:
      recommendation.reasons.join(" ") ||
      recommendation.openingLine.rationale,
    score: recommendation.score,
    seat: `${String.fromCharCode(65 + (index % 6))}${index + 1}`,
    seeking: recommendation.recommendedAction,
    summary: `${attendee.role} @ ${company}. ${attendee.eventIntent}`,
    title: attendee.role,
    topics,
  };
}

function personFromAttendee(
  model: AppEventDetailSuccessModel,
  index: number,
): OrbitPartyPersonView {
  const attendee = model.attendeeRoster.attendees[index];

  if (!attendee) {
    throw new Error("party attendee requires an attendee payload");
  }

  const topics = attendee.attendeeTags.map((tag) => tag.label).slice(0, 4);
  const company = attendee.organization || "Event attendee";

  return {
    company,
    g: gradientClasses[(index + 1) % gradientClasses.length],
    groupNumber: (index % 4) + 1,
    icebreakers: [
      attendee.suggestedNextAction,
      attendee.relationshipContext,
    ],
    id: attendee.attendeeId,
    industry: topics[0] ?? "Relationship",
    initial: initialFor(attendee.displayName),
    name: attendee.displayName,
    offering: attendee.relationshipContext,
    reason: attendee.relationshipContext,
    score: attendee.eligibleRecommendation.isEligible ? 82 : 70,
    seat: `${String.fromCharCode(65 + (index % 6))}${index + 2}`,
    seeking: attendee.suggestedNextAction,
    summary: `${attendee.role} @ ${company}. ${attendee.relationshipContext}`,
    title: attendee.role,
    topics,
  };
}

function partyPeople(model: AppEventDetailSuccessModel): OrbitPartyPersonView[] {
  if (model.recommendations.recommendations.length > 0) {
    return model.recommendations.recommendations.map((_, index) =>
      personFromRecommendation(model, index),
    );
  }

  return model.attendeeRoster.attendees.map((_, index) =>
    personFromAttendee(model, index),
  );
}

function meView(input: {
  profile: ReturnType<typeof profileRouteToOrbitProfileViewModel>;
  firstAttendee: OrbitPartyPersonView | null;
}): OrbitPartyViewModel["me"] {
  const profile = input.profile.profile;

  return {
    groupNumber: 1,
    initial: initialFor(profile.fullName),
    name: profile.fullName,
    offering: profile.offering.length ? profile.offering : ["relationship context"],
    prompts: [
      "Ask what outcome this person wants from the event.",
      "Capture one concrete next step before leaving the conversation.",
      "Confirm whether a warm introduction is appropriate.",
    ],
    role: [profile.title, profile.company].filter(Boolean).join(" · "),
    seat: input.firstAttendee ? "A1" : "S1",
    seeking: profile.seeking.length ? profile.seeking : ["relevant introductions"],
    topics: profile.topics.length ? profile.topics : ["relationship context"],
  };
}

function partyViewModel(input: {
  event: AppEventDetailSuccessModel;
  profile: ReturnType<typeof profileRouteToOrbitProfileViewModel>;
}): OrbitPartyViewModel {
  const people = partyPeople(input.event);
  const event = input.event.eventDetail.event;

  return {
    accessCode: `${(compactId(event.id) || "ORBT").slice(0, 4)}-4821`,
    agenda: agendaFor(input.event),
    eventName: input.event.canonicalEvent.title,
    eventVenue: input.event.canonicalEvent.venue,
    icebreakers: [
      "What outcome would make this event useful?",
      "Which introduction should happen next?",
      "What evidence should Orbit remember for follow-up?",
    ],
    me: meView({
      firstAttendee: people[0] ?? null,
      profile: input.profile,
    }),
    recommendations: people,
    tableMates: people.slice(0, 4),
  };
}

export async function loadAppPartyRouteViewModel(
  input: AppPartyRouteInput = {},
): Promise<AppPartyRouteViewModel> {
  const mode = input.mode ?? readSearchParam(input.searchParams, "mode") ?? undefined;
  const scenario = normalizeScenario(
    input.scenario ?? readSearchParam(input.searchParams, "scenario"),
  );
  const eventRoute = await loadAppEventDetailRoute({
    eventId: routeEventId(input),
    mode,
    scenario,
  });

  if (eventRoute.routeState !== "success") {
    return routeStateFromEventBoundary(eventRoute);
  }

  const profileRoute = await loadAppProfileRouteViewModel(
    input.searchParams as AppProfileSearchParams | undefined,
  );

  if (profileRoute.state === "route-state") {
    return routeState({
      errorCode: profileRoute.routeState.errorCode,
      evidenceIds: profileRoute.routeState.evidenceIds,
      scenario: profileRoute.routeState.scenario,
    });
  }

  if (profileRoute.state === "failure") {
    return routeState({
      errorCode: "PROFILE_ROUTE_FAILURE",
      evidenceIds: profileRoute.failure.evidenceIds,
      scenario: "failure",
    });
  }

  return {
    party: partyViewModel({
      event: eventRoute,
      profile: profileRouteToOrbitProfileViewModel(profileRoute),
    }),
    state: "success",
  };
}
