import { StateView } from "../../../../../shared/ui/state-view";
import type { AppContactsRouteViewModel } from "../../contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { loadAppContactsRouteViewModel } from "../../contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import type {
  AppEventsEventChoiceViewModel,
  AppEventsRouteViewModel,
} from "../../events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { loadAppEventsRouteViewModel } from "../../events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import type { OrbitHomeViewModel } from "../../orbit-home-route-view-model";
import type { OrbitLandingEventView } from "../../orbit-landing-route-view-model";
import type { AppProfileRouteViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { loadAppProfileRouteViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";

export type AppHomeSearchParams = Record<
  string,
  string | string[] | undefined
>;

export interface AppHomeRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  evidenceIds: readonly string[];
  recoveryActions: readonly { href: string; label: string }[];
  source: "contacts" | "events" | "profile";
}

export type AppHomeRouteViewModel =
  | {
      state: "success";
      home: OrbitHomeViewModel;
    }
  | {
      state: "route-state";
      routeState: AppHomeRouteStateViewModel;
    };

type ChildRouteModel =
  | AppContactsRouteViewModel
  | AppEventsRouteViewModel
  | AppProfileRouteViewModel;

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
    mapX: 50,
    mapY: 50,
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

function inProgressCount(contacts: AppContactsRouteViewModel): number {
  if (contacts.state !== "success") {
    return 0;
  }

  return contacts.payload.contacts.filter(
    (contact) => !/archived/i.test(contact.statusLabel),
  ).length;
}

function homeViewModel(input: {
  contacts: Extract<AppContactsRouteViewModel, { state: "success" }>;
  events: Extract<AppEventsRouteViewModel, { state: "success" }>;
  profile: Extract<AppProfileRouteViewModel, { state: "success" }>;
}): OrbitHomeViewModel {
  const fullName = input.profile.profile.profile.displayName || "Orbit operator";
  const events = input.events.workspace.eventChoices.map(
    eventChoiceToLandingEvent,
  );

  return {
    account: {
      fullName,
      headline: input.profile.profile.profile.headline,
      initial: fullName.slice(0, 1) || "O",
    },
    events,
    stats: {
      events: events.length,
      inProgress: inProgressCount(input.contacts),
      people: input.contacts.payload.ledger.knownPeople,
    },
  };
}

function evidenceFromEvents(model: Exclude<AppEventsRouteViewModel, { state: "success" }>) {
  return model.routeState.evidence.map((item) => item.id);
}

function evidenceFromContacts(
  model: Exclude<AppContactsRouteViewModel, { state: "success" }>,
) {
  return model.state === "route-state"
    ? model.routeState.evidenceIds
    : model.failure.evidenceIds;
}

function evidenceFromProfile(
  model: Exclude<AppProfileRouteViewModel, { state: "success" }>,
) {
  return model.state === "route-state"
    ? model.routeState.evidenceIds
    : model.failure.evidenceIds;
}

function childRouteState(input: {
  model: ChildRouteModel;
  source: AppHomeRouteStateViewModel["source"];
}): AppHomeRouteStateViewModel | null {
  if (input.model.state === "success") {
    return null;
  }

  const sourceLabel = input.source.charAt(0).toUpperCase() + input.source.slice(1);
  const evidenceIds =
    input.source === "events"
      ? evidenceFromEvents(input.model as Exclude<AppEventsRouteViewModel, { state: "success" }>)
      : input.source === "contacts"
        ? evidenceFromContacts(input.model as Exclude<AppContactsRouteViewModel, { state: "success" }>)
        : evidenceFromProfile(input.model as Exclude<AppProfileRouteViewModel, { state: "success" }>);

  return {
    copy: {
      description: `${sourceLabel} source data is not available, so the personal home summary is paused.`,
      emptyState:
        "Home needs events, contacts, and profile route payloads before it can show the personal hub.",
      eyebrow: "Home",
      guardrail:
        "This page did not create contacts, update events, send messages, or contact outside providers.",
      nextStep:
        "Reload Home after the blocked source route is configured, or open the source route directly.",
      purpose:
        "Keep the personal hub tied to the same sourced route payloads used by the underlying feature pages.",
      title: "Home could not load",
    },
    evidenceIds,
    recoveryActions: [
      { href: "/app/home", label: "Reload Home" },
      { href: `/app/${input.source}`, label: `Open ${sourceLabel}` },
    ],
    source: input.source,
  };
}

function firstRouteState(input: {
  contacts: AppContactsRouteViewModel;
  events: AppEventsRouteViewModel;
  profile: AppProfileRouteViewModel;
}): AppHomeRouteStateViewModel | null {
  return (
    childRouteState({ model: input.events, source: "events" }) ??
    childRouteState({ model: input.contacts, source: "contacts" }) ??
    childRouteState({ model: input.profile, source: "profile" })
  );
}

export async function loadAppHomeRouteViewModel(
  searchParams?: AppHomeSearchParams,
): Promise<AppHomeRouteViewModel> {
  const [events, contacts, profile] = await Promise.all([
    loadAppEventsRouteViewModel(searchParams),
    loadAppContactsRouteViewModel(searchParams),
    loadAppProfileRouteViewModel(searchParams),
  ]);
  const routeState = firstRouteState({ contacts, events, profile });

  if (routeState) {
    return { state: "route-state", routeState };
  }

  if (
    events.state !== "success" ||
    contacts.state !== "success" ||
    profile.state !== "success"
  ) {
    return {
      state: "route-state",
      routeState: {
        copy: {
          description:
            "One Home source route returned an unexpected state after recovery handling.",
          emptyState:
            "Home needs successful events, contacts, and profile route payloads.",
          eyebrow: "Home",
          guardrail:
            "No contact, event, message, notification, or outside account changed.",
          nextStep: "Reload Home after checking the source route states.",
          purpose:
            "Fail visibly if Home cannot prove all child route payloads are ready.",
          title: "Home could not load",
        },
        evidenceIds: ["home-route-unexpected-state"],
        recoveryActions: [{ href: "/app/home", label: "Reload Home" }],
        source: "events",
      },
    };
  }

  return {
    state: "success",
    home: homeViewModel({
      contacts,
      events,
      profile,
    }),
  };
}

function recoveryActions(
  actions: readonly { href: string; label: string }[],
): {
  href: string;
  id: string;
  label: string;
  recoveryCopy: string;
}[] {
  return actions.map((action, index) => ({
    href: action.href,
    id: `home-route-recovery-${index}`,
    label: action.label,
    recoveryCopy:
      "Return to a live-capable route that can re-check sourced Home data.",
  }));
}

export function HomeRouteStateBoundary({
  marker,
  routeState,
}: {
  marker: string;
  routeState: AppHomeRouteStateViewModel;
}) {
  return (
    <main
      data-orbit-route={marker}
      style={{ minHeight: "100dvh", padding: "32px", background: "var(--bg)" }}
    >
      <StateView
        description={routeState.copy.description}
        emptyState={routeState.copy.emptyState}
        evidence={[...routeState.evidenceIds]}
        eyebrow={routeState.copy.eyebrow}
        guardrail={routeState.copy.guardrail}
        nextStep={routeState.copy.nextStep}
        purpose={routeState.copy.purpose}
        recoveryActions={recoveryActions(routeState.recoveryActions)}
        title={routeState.copy.title}
      />
    </main>
  );
}
