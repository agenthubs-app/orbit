import type { EventRecord } from "../../../../../features/events/event-crud-and-import/contract";
import { resolveEventCrudAndImportService } from "../../../../../features/events/service-factory";
import type { ModuleMode } from "../../../../../shared/services/module-mode";
import {
  loadAppProfileRouteViewModel,
  type AppProfileSearchParams,
} from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import {
  orbitRegisterEmptyProfile,
  type OrbitRegisterViewModel,
} from "../register-view-model-contract";

export type AppRegisterSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppRegisterRouteScenario = "empty" | "pending" | "failure";

export interface AppRegisterRouteInput {
  code?: string | null;
  mode?: ModuleMode | string | null;
  scenario?: string | null;
  searchParams?: AppRegisterSearchParams;
}

export interface AppRegisterRouteStateViewModel {
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
  scenario: AppRegisterRouteScenario;
}

export type AppRegisterRouteViewModel =
  | {
      state: "success";
      register: OrbitRegisterViewModel;
    }
  | {
      state: "route-state";
      routeState: AppRegisterRouteStateViewModel;
    };

const defaultRegisterEventId = "demo-event-1";

function readSearchParam(
  searchParams: AppRegisterSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeScenario(
  scenario?: string | null,
): AppRegisterRouteScenario | null {
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function compactCodeForEventId(eventId: string): string {
  const compact = eventId.replace(/[^a-z0-9]+/giu, "").toUpperCase();

  return compact || "EVENT";
}

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds.filter(Boolean)));
}

function baseRouteState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  scenario: AppRegisterRouteScenario;
}): AppRegisterRouteStateViewModel {
  const copyByScenario = {
    empty: {
      description:
        "Choose a source-backed event before collecting registration profile details.",
      emptyState:
        "No registration event is ready, and no registration profile was saved.",
      eyebrow: "Registration",
      guardrail:
        "This route only reads event and profile context. It does not create attendees, send messages, trigger notifications, or contact external providers.",
      nextStep:
        "Return to events and open registration from a reviewed event record.",
      purpose:
        "Keep the registration entry visible while preserving source-backed event boundaries.",
      title: "Registration is not ready",
    },
    failure: {
      description: "Registration could not load event or profile context.",
      emptyState:
        "No registration profile was saved, no attendee was created, and no external provider was contacted.",
      eyebrow: "Registration",
      guardrail:
        "The failed route state stops before registration writes, notifications, email, calendar, AI, or outside network work.",
      nextStep:
        "Confirm the Events live store and profile sources are configured, then retry registration.",
      purpose:
        "Show a recoverable registration boundary without falling back to mock data.",
      title: "Registration could not load",
    },
    pending: {
      description:
        "Registration context is waiting for reviewed event or profile sources.",
      emptyState:
        "The registration form is held until source-backed context is ready.",
      eyebrow: "Registration",
      guardrail:
        "Pending registration context cannot create attendees or trigger external work.",
      nextStep:
        "Check the event again after its source-backed registration context is ready.",
      purpose:
        "Keep the registration entry stable while source review is pending.",
      title: "Registration is loading",
    },
  } as const;

  return {
    copy: copyByScenario[input.scenario],
    errorCode: input.errorCode ?? null,
    evidenceIds: uniqueEvidenceIds([
      input.errorCode ?? "",
      ...input.evidenceIds,
    ]),
    recoveryActions: [
      {
        id: "register-return-events",
        href: "/app/events",
        label: "Return to events",
        recoveryCopy:
          "Open an event with reviewed source context before retrying registration.",
      },
      {
        id: "register-retry",
        href: "/app/register",
        label: "Retry registration",
        recoveryCopy:
          "Retry registration after confirming the event and profile services are configured.",
      },
    ],
    scenario: input.scenario,
  };
}

function eventRouteState(input: {
  code: string;
  evidenceIds: readonly string[];
  scenario?: AppRegisterRouteScenario | null;
}): AppRegisterRouteViewModel {
  return {
    state: "route-state",
    routeState: baseRouteState({
      errorCode: input.code,
      evidenceIds: input.evidenceIds,
      scenario: input.scenario ?? "failure",
    }),
  };
}

function profileRouteState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  scenario?: AppRegisterRouteScenario | null;
}): AppRegisterRouteViewModel {
  return {
    state: "route-state",
    routeState: baseRouteState({
      errorCode: input.errorCode ?? "PROFILE_ROUTE_FAILURE",
      evidenceIds: input.evidenceIds,
      scenario: input.scenario ?? "failure",
    }),
  };
}

function eventView(event: EventRecord): OrbitRegisterViewModel["event"] {
  return {
    code: compactCodeForEventId(event.id),
    name: event.title,
    theme: event.sourceMetadata.captureMethod,
  };
}

function registerViewModel(input: {
  event: EventRecord;
  profile: ReturnType<typeof profileRouteToOrbitProfileViewModel>;
}): OrbitRegisterViewModel {
  const profile = input.profile;

  return {
    event: eventView(input.event),
    industryOptions: profile.industries,
    levelOptions: [
      "Founder / partner",
      "Executive",
      "Director / lead",
      "Manager",
      "Individual contributor",
    ],
    offeringTags: profile.offeringTags,
    profilePreview: {
      ...orbitRegisterEmptyProfile,
      bio: profile.profile.bio,
      company: profile.profile.company,
      industry: profile.profile.industry,
      intro: profile.profile.intro,
      lineId: profile.profile.lineId,
      name: profile.profile.fullName,
      offering: profile.profile.offering,
      seeking: profile.profile.seeking,
      title: profile.profile.title,
      topics: profile.profile.topics,
      wechatName: profile.profile.wechatName,
    },
    seekingTags: profile.seekingTags,
    topics: profile.topics,
  };
}

export async function loadAppRegisterRouteViewModel(
  input: AppRegisterRouteInput = {},
): Promise<AppRegisterRouteViewModel> {
  const searchParams = input.searchParams;
  const eventId =
    input.code?.trim() ||
    readSearchParam(searchParams, "code")?.trim() ||
    defaultRegisterEventId;
  const mode = input.mode ?? readSearchParam(searchParams, "mode") ?? undefined;
  const scenario = normalizeScenario(
    input.scenario ?? readSearchParam(searchParams, "scenario"),
  );

  if (scenario === "empty" || scenario === "pending") {
    return {
      state: "route-state",
      routeState: baseRouteState({
        evidenceIds: [`register-route-${scenario}`],
        scenario,
      }),
    };
  }

  const eventServiceResolution = resolveEventCrudAndImportService(mode);

  if (eventServiceResolution.success === false) {
    return eventRouteState({
      code: eventServiceResolution.error.code,
      evidenceIds: [eventServiceResolution.error.capabilityId],
    });
  }

  const eventResult = await eventServiceResolution.service.getEvent({
    eventId,
    scenario,
  });

  if (eventResult.success === false) {
    return eventRouteState({
      code: eventResult.error.code,
      evidenceIds: eventResult.error.evidenceIds,
    });
  }

  const profileRoute = await loadAppProfileRouteViewModel(
    searchParams as AppProfileSearchParams | undefined,
  );

  if (profileRoute.state === "route-state") {
    return profileRouteState({
      errorCode: profileRoute.routeState.errorCode,
      evidenceIds: profileRoute.routeState.evidenceIds,
      scenario: profileRoute.routeState.scenario,
    });
  }

  if (profileRoute.state === "failure") {
    return profileRouteState({
      errorCode: "PROFILE_ROUTE_FAILURE",
      evidenceIds: profileRoute.failure.evidenceIds,
    });
  }

  return {
    state: "success",
    register: registerViewModel({
      event: eventResult.data.event,
      profile: profileRouteToOrbitProfileViewModel(profileRoute),
    }),
  };
}
