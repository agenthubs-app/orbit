import type {
  AppEventsRouteStateViewModel,
  AppEventsRouteControls,
  AppEventsSuccessViewModel,
} from "../../events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { loadAppEventsRouteViewModel } from "../../events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import {
  loadAppProfileRouteViewModel,
} from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import type {
  OrbitAdminEventView,
  OrbitAdminMemberView,
  OrbitAdminViewModel,
} from "../../orbit-admin-platform-route-view-model";

export type AppAdminPlatformRouteScenario = "empty" | "pending" | "failure";
export type AppAdminPlatformSurface = "admin" | "platform";

export interface AppAdminPlatformActor {
  displayName: string;
  email?: string | null;
  id: string;
}

export interface AppAdminPlatformRouteInput {
  actor?: AppAdminPlatformActor | null;
  controls?: AppEventsRouteControls;
  surface?: AppAdminPlatformSurface;
}

export interface AppAdminPlatformRouteStateViewModel {
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
  scenario: AppAdminPlatformRouteScenario;
}

export type AppAdminPlatformRouteViewModel =
  | {
      state: "success";
      admin: OrbitAdminViewModel;
    }
  | {
      state: "route-state";
      routeState: AppAdminPlatformRouteStateViewModel;
    };

export type AppPlatformUnavailableRouteViewModel = Extract<
  AppAdminPlatformRouteViewModel,
  { state: "route-state" }
>;

type ProfileView = ReturnType<typeof profileRouteToOrbitProfileViewModel>;

const themeColors = ["#6359E9", "#0E9E68", "#2D7FF0", "#E0415F", "#E08A2B"] as const;
const gradientClasses = [
  "g-indigo",
  "g-emerald",
  "g-sky",
  "g-rose",
  "g-amber",
  "g-violet",
] as const;

function initialFor(value: string, fallback = "O"): string {
  return value.trim().slice(0, 1).toUpperCase() || fallback;
}

function compactId(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, "").toUpperCase();
}

function gradientFor(value: string, index = 0): string {
  return gradientClasses[(compactId(value).length + index) % gradientClasses.length];
}

function statusFor(
  event: AppEventsSuccessViewModel["eventChoices"][number],
): OrbitAdminEventView["status"] {
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

function evidenceIdsFromEventsRouteState(
  routeState: AppEventsRouteStateViewModel,
): string[] {
  return Array.from(
    new Set([
      routeState.errorCode ?? "",
      ...routeState.evidence.map((item) => item.id),
    ].filter(Boolean)),
  );
}

function routeStateCopy(input: {
  scenario: AppAdminPlatformRouteScenario;
  surface: AppAdminPlatformSurface;
}) {
  if (input.surface === "platform") {
    return {
      description:
        "No platform-wide moderation provider or verified platform-admin role is configured.",
      emptyState:
        "Personal profile and event records are not platform-wide organizer, user, verification, or review data.",
      eyebrow: "Platform",
      guardrail:
        "This route fails closed before reading personal workspace data or claiming platform statistics, moderation state, organizer verification, or platform access.",
      nextStep:
        "Connect a platform-wide read provider and enforce a persisted platform-admin role before enabling this route.",
      purpose:
        "Prevent an authenticated personal account from being presented as a platform administrator.",
      title: "Platform admin is unavailable",
    };
  }

  const surfaceName =
    "Admin workspace";
  const lowerSurfaceName = "admin workspace";

  if (input.scenario === "empty") {
    return {
      description: `${surfaceName} has no reviewed event or profile context yet.`,
      emptyState:
        "Admin and platform tools stay hidden until sourced events and a workspace profile are available.",
      eyebrow: "Admin",
      guardrail:
        "This route only reads event and profile sources. It does not approve events, notify organizers, run AI matching, write calendars, or contact external providers.",
      nextStep:
        "Create or import a sourced event, then return after the workspace profile is ready.",
      purpose:
        "Keep operator tools tied to reviewed live-capable event and profile sources.",
      title: `${surfaceName} is not ready`,
    };
  }

  if (input.scenario === "pending") {
    return {
      description: `${surfaceName} is waiting for reviewed event or profile context.`,
      emptyState:
        "Operator views remain paused until source review finishes.",
      eyebrow: "Admin",
      guardrail:
        "Pending operator context cannot approve events, send notifications, run AI matching, write calendars, or contact external providers.",
      nextStep:
        "Return after event and profile source review completes.",
      purpose:
        "Keep operator tools stable while live-capable sources are still loading.",
      title: `${surfaceName} is loading`,
    };
  }

  return {
    description: `${surfaceName} could not load event or profile context.`,
    emptyState:
      "No admin action was applied, no organizer was notified, and no external provider was contacted.",
    eyebrow: "Admin",
    guardrail:
      "The failed route state stops before event approval, organizer notification, AI matching, calendar writes, email, or outside network work.",
    nextStep:
      "Confirm the Events live store, profile sources, and generated fixture records are configured, then retry the operator view.",
    purpose: `Show a recoverable ${lowerSurfaceName} boundary without falling back to legacy hybrid route data.`,
    title: `${surfaceName} could not load`,
  };
}

function routeState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  scenario: AppAdminPlatformRouteScenario;
  surface: AppAdminPlatformSurface;
}): AppAdminPlatformRouteViewModel {
  const copy = routeStateCopy({
    scenario: input.scenario,
    surface: input.surface,
  });

  return {
    routeState: {
      copy,
      errorCode: input.errorCode ?? null,
      evidenceIds: Array.from(
        new Set([input.errorCode ?? "", ...input.evidenceIds].filter(Boolean)),
      ),
      recoveryActions:
        input.surface === "platform"
          ? [
              {
                id: "platform-return-home",
                href: "/app/home",
                label: "Return to personal workspace",
                recoveryCopy:
                  "Continue in the authenticated personal workspace without platform-wide claims.",
              },
              {
                id: "platform-open-admin",
                href: "/app/admin",
                label: "Open organizer admin",
                recoveryCopy:
                  "Use the actor-scoped organizer view for sourced personal events.",
              },
            ]
          : [
              {
                id: "admin-return-events",
                href: "/app/events",
                label: "Return to events",
                recoveryCopy:
                  "Open sourced events before retrying the operator workspace.",
              },
              {
                id: "admin-return-profile",
                href: "/app/profile",
                label: "Review profile",
                recoveryCopy:
                  "Confirm the workspace profile before retrying admin tools.",
              },
            ],
      scenario: input.scenario,
    },
    state: "route-state",
  };
}

function routeStateFromEventsBoundary(input: {
  routeState: AppEventsRouteStateViewModel;
  surface: AppAdminPlatformSurface;
}): AppAdminPlatformRouteViewModel {
  return routeState({
    errorCode: input.routeState.errorCode,
    evidenceIds: evidenceIdsFromEventsRouteState(input.routeState),
    scenario: input.routeState.scenario,
    surface: input.surface,
  });
}

function adminEvent(input: {
  event: AppEventsSuccessViewModel["eventChoices"][number];
  index: number;
}): OrbitAdminEventView {
  const status = statusFor(input.event);

  return {
    code: compactId(input.event.id).slice(0, 8) || input.event.id,
    endsAt: input.event.endsAt,
    g: gradientFor(input.event.id, input.index),
    id: input.event.id,
    name: input.event.title,
    startsAt: input.event.startsAt,
    status,
    summary: [input.event.relationshipValue, input.event.nextAction]
      .filter(Boolean)
      .join(" "),
    themeColor: themeColors[input.index % themeColors.length],
    venue: input.event.venue,
  };
}

function adminAccount(input: {
  actor?: AppAdminPlatformActor | null;
  profile: ProfileView;
}): OrbitAdminMemberView {
  const name =
    input.profile.profile.fullName ||
    input.actor?.displayName ||
    "Authenticated account";

  return {
    email: input.profile.profile.email || input.actor?.email?.trim() || "",
    g: gradientFor(name),
    initial: initialFor(name),
    name,
    role: input.profile.profile.title || "Authenticated account",
  };
}

function adminViewModel(input: {
  actor?: AppAdminPlatformActor | null;
  profile: ProfileView;
  workspace: AppEventsSuccessViewModel;
}): OrbitAdminViewModel {
  const events = input.workspace.eventChoices.map((event, index) =>
    adminEvent({ event, index }),
  );
  const upcomingCount = events.filter(
    (event) => event.status === "upcoming",
  ).length;
  const activeCount = events.filter((event) => event.status === "active").length;
  const endedCount = events.filter((event) => event.status === "ended").length;
  const account = adminAccount({ actor: input.actor, profile: input.profile });
  const orgName =
    input.profile.profile.company ||
    input.profile.profile.fullName ||
    "Orbit workspace";

  return {
    adminEvents: events,
    adminAccount: account,
    adminOrg: {
      g: gradientFor(orgName),
      initial: initialFor(orgName),
      name: orgName,
      owner: account.email,
      sub: "Actor-scoped source records",
    },
    adminStats: [
      {
        delta: "source records",
        g: "g-indigo",
        icon: "calendar",
        label: "活动记录",
        value: String(events.length),
      },
      {
        delta: "derived from dates",
        g: "g-emerald",
        icon: "clock",
        label: "即将开始",
        value: String(upcomingCount),
      },
      {
        delta: "derived from dates",
        g: "g-violet",
        icon: "zap",
        label: "进行中",
        value: String(activeCount),
      },
      {
        delta: "derived from dates",
        g: "g-amber",
        icon: "checkCircle",
        label: "已结束",
        value: String(endedCount),
      },
    ],
  };
}

export function loadAppAdminPlatformRouteViewModel(
  input: AppAdminPlatformRouteInput & { surface: "platform" },
): Promise<AppPlatformUnavailableRouteViewModel>;
export function loadAppAdminPlatformRouteViewModel(
  input?: AppAdminPlatformRouteInput,
): Promise<AppAdminPlatformRouteViewModel>;
export async function loadAppAdminPlatformRouteViewModel(
  input: AppAdminPlatformRouteInput = {},
): Promise<AppAdminPlatformRouteViewModel> {
  const surface = input.surface ?? "admin";

  if (surface === "platform") {
    return routeState({
      errorCode: "PLATFORM_ADMIN_PROVIDER_UNAVAILABLE",
      evidenceIds: [
        "platform-wide-provider:unavailable",
        "platform-admin-role:unverified",
      ],
      scenario: "failure",
      surface,
    });
  }

  const [eventsRoute, profileRoute] = await Promise.all([
    loadAppEventsRouteViewModel(input.actor?.id, input.controls),
    loadAppProfileRouteViewModel(input.actor),
  ]);

  if (eventsRoute.state === "route-state") {
    return routeStateFromEventsBoundary({
      routeState: eventsRoute.routeState,
      surface,
    });
  }

  if (profileRoute.state === "route-state") {
    return routeState({
      errorCode: profileRoute.routeState.errorCode,
      evidenceIds: profileRoute.routeState.evidenceIds,
      scenario: profileRoute.routeState.scenario,
      surface,
    });
  }

  if (profileRoute.state === "failure") {
    return routeState({
      errorCode: "PROFILE_ROUTE_FAILURE",
      evidenceIds: profileRoute.failure.evidenceIds,
      scenario: "failure",
      surface,
    });
  }

  const profile = profileRouteToOrbitProfileViewModel(profileRoute);
  const admin = adminViewModel({
    actor: input.actor,
    profile,
    workspace: eventsRoute.workspace,
  });

  return {
    admin,
    state: "success",
  };
}
