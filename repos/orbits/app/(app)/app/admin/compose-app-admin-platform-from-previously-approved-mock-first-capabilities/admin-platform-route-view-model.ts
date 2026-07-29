import type {
  AppEventsRouteStateViewModel,
  AppEventsSearchParams,
  AppEventsSuccessViewModel,
} from "../../events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import { loadAppEventsRouteViewModel } from "../../events/compose-app-events-from-previously-approved-mock-first-capabilities/events-route-view-model";
import {
  loadAppProfileRouteViewModel,
} from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import type {
  OrbitAdminEventView,
  OrbitAdminFeedView,
  OrbitAdminMemberView,
  OrbitAdminViewModel,
  OrbitPlatformReviewView,
  OrbitPlatformViewModel,
} from "../../orbit-admin-platform-route-view-model";

export type AppAdminPlatformSearchParams = AppEventsSearchParams;
export type AppAdminPlatformRouteScenario = "empty" | "pending" | "failure";
export type AppAdminPlatformSurface = "admin" | "platform";

export interface AppAdminPlatformRouteInput {
  searchParams?: AppAdminPlatformSearchParams;
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
      platform: OrbitPlatformViewModel;
    }
  | {
      state: "route-state";
      routeState: AppAdminPlatformRouteStateViewModel;
    };

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

function phaseForStatus(status: string): number {
  if (status === "ended") {
    return 4;
  }

  if (status === "active") {
    return 3;
  }

  return 1;
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
  const surfaceName =
    input.surface === "platform" ? "Platform workspace" : "Admin workspace";
  const lowerSurfaceName =
    input.surface === "platform" ? "platform workspace" : "admin workspace";

  if (input.scenario === "empty") {
    return {
      description: `${surfaceName} has no reviewed event or profile context yet.`,
      emptyState:
        "Admin and platform tools stay hidden until sourced events and a workspace profile are available.",
      eyebrow: input.surface === "platform" ? "Platform" : "Admin",
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
      eyebrow: input.surface === "platform" ? "Platform" : "Admin",
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
    eyebrow: input.surface === "platform" ? "Platform" : "Admin",
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
      recoveryActions: [
        {
          id: `${input.surface}-return-events`,
          href: "/app/events",
          label: "Return to events",
          recoveryCopy:
            "Open sourced events before retrying the operator workspace.",
        },
        {
          id: `${input.surface}-return-profile`,
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

function ownerEmail(profile: ProfileView): string {
  const name = profile.profile.fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

  return `${name || "workspace.owner"}@orbit.local`;
}

function adminEvent(input: {
  event: AppEventsSuccessViewModel["eventChoices"][number];
  index: number;
  workspace: AppEventsSuccessViewModel;
}): OrbitAdminEventView {
  const status = statusFor(input.event);
  const registered = Math.max(1, input.event.evidence.length + 1);
  const matched =
    input.workspace.attendeePanel.recommendation &&
    input.workspace.currentPriority?.eventTitle === input.event.title
      ? 1
      : 0;

  return {
    cap: Math.max(20, registered + 20),
    checkedin: status === "ended" ? registered : status === "active" ? matched : 0,
    code: compactId(input.event.id).slice(0, 8) || input.event.id,
    endsAt: input.event.endsAt,
    g: gradientFor(input.event.id, input.index),
    id: input.event.id,
    matched,
    name: input.event.title,
    phase: phaseForStatus(status),
    registered,
    startsAt: input.event.startsAt,
    status,
    summary: [input.event.relationshipValue, input.event.nextAction]
      .filter(Boolean)
      .join(" "),
    themeColor: themeColors[input.index % themeColors.length],
    venue: input.event.venue,
  };
}

function adminMembers(profile: ProfileView): OrbitAdminMemberView[] {
  return [
    {
      email: ownerEmail(profile),
      g: gradientFor(profile.profile.fullName),
      initial: initialFor(profile.profile.fullName),
      name: profile.profile.fullName,
      role: profile.profile.title || "Workspace owner",
    },
  ];
}

function adminFeed(input: {
  events: readonly OrbitAdminEventView[];
  workspace: AppEventsSuccessViewModel;
}): OrbitAdminFeedView[] {
  const recommendation = input.workspace.attendeePanel.recommendation;

  if (recommendation) {
    return [
      {
        company: recommendation.organization,
        g: gradientFor(recommendation.attendeeName),
        id: `${input.workspace.currentPriority?.eventTitle ?? "event"}-${recommendation.attendeeName}`,
        initial: initialFor(recommendation.attendeeName),
        kind: "匹配",
        name: recommendation.attendeeName,
        t: "source-backed",
        title: recommendation.role,
      },
      ...input.events.slice(0, 5).map((event, index) => ({
        company: event.venue,
        g: event.g,
        id: event.id,
        initial: initialFor(event.name),
        kind: event.status === "active" ? "签到" : "活动",
        name: event.name,
        t: index === 0 ? "current" : "events",
        title: event.summary,
      })),
    ];
  }

  return input.events.slice(0, 6).map((event, index) => ({
    company: event.venue,
    g: event.g,
    id: event.id,
    initial: initialFor(event.name),
    kind: event.status === "active" ? "签到" : "活动",
    name: event.name,
    t: index === 0 ? "current" : "events",
    title: event.summary,
  }));
}

function adminViewModel(input: {
  profile: ProfileView;
  workspace: AppEventsSuccessViewModel;
}): OrbitAdminViewModel {
  const events = input.workspace.eventChoices.map((event, index) =>
    adminEvent({ event, index, workspace: input.workspace }),
  );
  const totalRegistered = events.reduce((sum, event) => sum + event.registered, 0);
  const totalCheckedIn = events.reduce((sum, event) => sum + event.checkedin, 0);
  const totalMatched = events.reduce((sum, event) => sum + event.matched, 0);
  const activeCount = events.filter((event) => event.status === "active").length;
  const orgName = input.profile.profile.company || "Orbit Workspace";

  return {
    adminEvents: events,
    adminFeed: adminFeed({ events, workspace: input.workspace }),
    adminFunnel: [
      ["活动记录", events.length, 1],
      [
        "报名记录",
        totalRegistered,
        events.length ? totalRegistered / Math.max(totalRegistered, events.length) : 0,
      ],
      [
        "匹配记录",
        totalMatched,
        totalRegistered ? totalMatched / totalRegistered : 0,
      ],
    ],
    adminMembers: adminMembers(input.profile),
    adminOrg: {
      g: gradientFor(orgName),
      initial: initialFor(orgName),
      name: orgName,
      owner: ownerEmail(input.profile),
      sub: "Live-capable workspace",
    },
    adminPhases: ["创建", "报名", "签到", "匹配", "复盘"],
    adminStats: [
      {
        delta: "source-backed",
        g: "g-indigo",
        icon: "users",
        label: "总报名",
        value: String(totalRegistered),
      },
      {
        delta: `${events.length} events`,
        g: "g-emerald",
        icon: "checkCircle",
        label: "已签到",
        value: String(totalCheckedIn),
      },
      {
        delta: "reviewed matches",
        g: "g-violet",
        icon: "sparkle",
        label: "完成匹配",
        value: String(totalMatched),
      },
      {
        delta: "computed status",
        g: "g-amber",
        icon: "zap",
        label: "进行中活动",
        value: String(activeCount),
      },
    ],
  };
}

function reviewQueue(
  admin: OrbitAdminViewModel,
): OrbitPlatformReviewView[] {
  return admin.adminEvents.slice(0, 8).map((event, index) => ({
    desc: event.summary,
    facts: [
      ["预计人数", String(event.cap)],
      ["场地", event.venue],
      ["阶段", admin.adminPhases[Math.min(event.phase, admin.adminPhases.length - 1)] ?? "来源复核"],
    ],
    flags: ["source-backed", event.status],
    g: event.g,
    id: event.id,
    letter: initialFor(event.name),
    name: event.name,
    org: admin.adminOrg.name,
    submitted: event.startsAt,
  }));
}

function platformViewModel(input: {
  admin: OrbitAdminViewModel;
  profile: ProfileView;
}): OrbitPlatformViewModel {
  const queue = reviewQueue(input.admin);

  return {
    orgAccounts: [
      {
        events: input.admin.adminEvents.length,
        g: input.admin.adminOrg.g,
        letter: input.admin.adminOrg.initial,
        name: input.admin.adminOrg.name,
        owner: ownerEmail(input.profile),
        status: "已认证",
      },
    ],
    platformStats: [
      {
        icon: "building",
        label: "主办方账号",
        note: "profile source",
        tone: "indigo",
        value: "1",
      },
      {
        icon: "calendar",
        label: "累计活动",
        note: "events source",
        tone: "live",
        value: String(input.admin.adminEvents.length),
      },
      {
        icon: "checkCircle",
        label: "待审核",
        note: "review queue",
        tone: "amber",
        value: String(queue.length),
      },
      {
        icon: "users",
        label: "平台用户",
        note: "workspace members",
        tone: "sky",
        value: String(input.admin.adminMembers.length),
      },
    ],
    reviewQueue: queue,
  };
}

export async function loadAppAdminPlatformRouteViewModel(
  input: AppAdminPlatformRouteInput = {},
): Promise<AppAdminPlatformRouteViewModel> {
  const surface = input.surface ?? "admin";
  const [eventsRoute, profileRoute] = await Promise.all([
    loadAppEventsRouteViewModel(input.searchParams),
    loadAppProfileRouteViewModel(),
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
  const admin = adminViewModel({ profile, workspace: eventsRoute.workspace });

  return {
    admin,
    platform: platformViewModel({ admin, profile }),
    state: "success",
  };
}
