import {
  createConfiguredCanonicalPublicEventCatalogue,
} from "../../../../../features/events/core/public-catalogue-runtime";
import type {
  CanonicalPublicEventCatalogue,
  PublicEventCatalogueSnapshot,
} from "../../../../../features/events/core/public-catalogue";
import { canonicalPublicOrganizerLabel } from "../../../../../features/events/core/public-organizer-identity";
import type { OrbitLanguage } from "../../orbit-language-core";
import {
  getOrbitLandingEventView,
  type OrbitLandingEventView,
} from "../../orbit-landing-route-view-model";
import type { OrbitOrganizerPublicViewModel } from "../../orbit-organizer-route-view-model";

export interface AppOrganizerPublicRouteInput {
  slug: string;
}

export interface AppOrganizerPublicRouteDependencies {
  createCatalogue?: () => CanonicalPublicEventCatalogue | null;
}

export type AppOrganizerPublicRouteScenario = "empty" | "failure";

export interface AppOrganizerPublicRouteStateViewModel {
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
  scenario: AppOrganizerPublicRouteScenario;
}

export type AppOrganizerPublicRouteViewModel =
  | {
      state: "success";
      organizer: OrbitOrganizerPublicViewModel;
    }
  | {
      state: "route-state";
      routeState: AppOrganizerPublicRouteStateViewModel;
    };

const PUBLIC_ORGANIZER_NOT_FOUND = "PUBLIC_ORGANIZER_NOT_FOUND";
const CANONICAL_PUBLIC_ORGANIZER_UNAVAILABLE =
  "CANONICAL_PUBLIC_ORGANIZER_UNAVAILABLE";
const CANONICAL_PUBLIC_ORGANIZER_INVALID =
  "CANONICAL_PUBLIC_ORGANIZER_INVALID";

const organizerRouteStateCopy = {
  empty: {
    en: {
      description:
        "No canonical public organizer events are available for this page.",
      emptyState:
        "The public organizer page has no published events to display.",
      eyebrow: "Organizer",
      guardrail:
        "This route reads only canonical public Event Core records. It does not create registrations, notify attendees, write calendars, or contact outside providers.",
      nextStep: "Return to events and open an organizer from a published event.",
      purpose:
        "Keep public organizer pages tied to published canonical event ownership.",
      title: "Organizer page is empty",
    },
    zh: {
      description: "这个公开主办方页面暂时没有可展示的 canonical 活动。",
      emptyState: "目前没有已发布的主办方活动可供展示。",
      eyebrow: "主办方",
      guardrail:
        "该页面只读取 Event Core 的公开活动记录，不会创建报名、通知参会者、写入日历或联系外部服务。",
      nextStep: "返回活动目录，从已发布活动进入主办方页面。",
      purpose: "公开主办方页面只展示已发布活动的 canonical 归属。",
      title: "主办方页面暂无活动",
    },
  },
  failure: {
    en: {
      description: "Organizer page could not load canonical Event Core context.",
      emptyState:
        "No organizer page was generated from a legacy catalogue or mock data.",
      eyebrow: "Organizer",
      guardrail:
        "The failed route state stops before registration writes, notifications, calendar, email, AI, or outside network work.",
      nextStep:
        "Confirm the canonical Event Core public catalogue is configured, then retry the organizer page.",
      purpose:
        "Show a recoverable public organizer boundary without falling back to legacy landing data.",
      title: "Organizer page could not load",
    },
    zh: {
      description: "主办方页面暂时无法读取 Event Core 的 canonical 活动上下文。",
      emptyState: "页面没有使用旧目录或模拟数据生成主办方信息。",
      eyebrow: "主办方",
      guardrail:
        "失败状态会在报名写入、通知、日历、邮件、AI 或外部网络操作之前停止。",
      nextStep: "确认 Event Core 公开目录已配置后，再重试主办方页面。",
      purpose: "在不回退旧版或模拟数据的前提下提供可恢复边界。",
      title: "主办方页面暂时无法加载",
    },
  },
  notFound: {
    en: {
      description:
        "This public organizer identifier does not match a published canonical event.",
      emptyState:
        "No first event, private event, legacy catalogue, or mock organizer was used as a fallback.",
      eyebrow: "Organizer",
      guardrail:
        "This boundary reads only the canonical public catalogue. It does not read private events, create registrations, or trigger outside work.",
      nextStep: "Return to events and open an organizer from a published event.",
      purpose:
        "Keep public organizer identity bound to an exact published canonical event owner.",
      title: "Organizer not found",
    },
    zh: {
      description: "这个公开主办方标识没有匹配到已发布的 canonical 活动。",
      emptyState: "页面没有用首场活动、私有活动、旧目录或模拟主办方作为兜底。",
      eyebrow: "主办方",
      guardrail:
        "该边界只读取 canonical 公共活动目录，不会读取私有活动、创建报名或触发外部操作。",
      nextStep: "返回活动目录，从已发布活动进入主办方页面。",
      purpose: "公开主办方身份必须精确绑定到已发布活动的 canonical owner。",
      title: "未找到该主办方",
    },
  },
} as const;

const organizerRecoveryCopy = {
  en: {
    label: "Return to events",
    recoveryCopy:
      "Open an event with published canonical context before retrying the organizer page.",
  },
  zh: {
    label: "返回活动",
    recoveryCopy: "从已发布活动进入主办方页面后再重试。",
  },
} as const;

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds.filter(Boolean)));
}

function organizerRouteStateKind(input: {
  errorCode?: string | null;
  scenario: AppOrganizerPublicRouteScenario;
}) {
  return input.errorCode === PUBLIC_ORGANIZER_NOT_FOUND
    ? "notFound"
    : input.scenario;
}

function routeState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  scenario: AppOrganizerPublicRouteScenario;
}): AppOrganizerPublicRouteViewModel {
  const kind = organizerRouteStateKind(input);

  return {
    state: "route-state",
    routeState: {
      copy: organizerRouteStateCopy[kind].en,
      errorCode: input.errorCode ?? null,
      evidenceIds: uniqueEvidenceIds([
        input.errorCode ?? "",
        ...input.evidenceIds,
      ]),
      recoveryActions: [
        {
          id: "organizer-public-return-events",
          href: "/app/events",
          ...organizerRecoveryCopy.en,
        },
      ],
      scenario: input.scenario,
    },
  };
}

export function presentAppOrganizerPublicRouteState(
  routeState: AppOrganizerPublicRouteStateViewModel,
  language: OrbitLanguage,
): AppOrganizerPublicRouteStateViewModel {
  const presentationLanguage = language === "zh" ? "zh" : "en";
  const kind = organizerRouteStateKind(routeState);

  return {
    ...routeState,
    copy: organizerRouteStateCopy[kind][presentationLanguage],
    recoveryActions: routeState.recoveryActions.map((action) => ({
      ...action,
      ...organizerRecoveryCopy[presentationLanguage],
    })),
  };
}

function normalizedSlug(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    return decodeURIComponent(trimmed).trim().toLocaleLowerCase("en-US");
  } catch {
    return trimmed.toLocaleLowerCase("en-US");
  }
}

function compactRouteId(value: string): string {
  return value.replace(/[^a-z0-9]+/giu, "").toLocaleLowerCase("en-US");
}

interface CanonicalOrganizerEvent {
  event: PublicEventCatalogueSnapshot["events"][number];
  ownerId: string;
  participantCount: number;
  publicCode: string;
}

class InvalidCanonicalOrganizerCatalogueError extends Error {
  constructor() {
    super("Canonical public organizer catalogue is invalid.");
    this.name = "InvalidCanonicalOrganizerCatalogueError";
  }
}

function requiredCanonicalText(value: string | undefined): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new InvalidCanonicalOrganizerCatalogueError();
  return normalized;
}

function canonicalOrganizerEvents(
  snapshot: PublicEventCatalogueSnapshot,
): readonly CanonicalOrganizerEvent[] {
  const eventIds = new Set<string>();
  const publicCodes = new Set<string>();

  return snapshot.events.map((event) => {
    const eventId = requiredCanonicalText(event.id);
    const ownerId = requiredCanonicalText(event.organizerId);
    const publicCode = requiredCanonicalText(snapshot.publicCodes[event.id]);
    const participantCount = snapshot.participantCounts[event.id];
    const normalizedEventId = normalizedSlug(eventId);
    const normalizedPublicCode = normalizedSlug(publicCode);

    if (
      !normalizedEventId ||
      !normalizedPublicCode ||
      eventIds.has(normalizedEventId) ||
      publicCodes.has(normalizedPublicCode) ||
      !Number.isSafeInteger(participantCount) ||
      participantCount < 0
    ) {
      throw new InvalidCanonicalOrganizerCatalogueError();
    }

    eventIds.add(normalizedEventId);
    publicCodes.add(normalizedPublicCode);

    return {
      event,
      ownerId,
      participantCount,
      publicCode,
    };
  });
}

function eventMatchesSlug(
  event: CanonicalOrganizerEvent,
  slug: string,
): boolean {
  const normalized = normalizedSlug(slug);
  if (!normalized) return false;

  const compact = compactRouteId(normalized);
  const routeIds = [event.event.id, event.publicCode];

  return routeIds.some((routeId) => {
    const normalizedRouteId = normalizedSlug(routeId);
    return (
      normalizedRouteId === normalized ||
      (compact.length > 0 && compactRouteId(normalizedRouteId) === compact)
    );
  });
}

function canonicalOrganizerViewModel(input: {
  slug: string;
  snapshot: PublicEventCatalogueSnapshot;
}): OrbitOrganizerPublicViewModel | null {
  const events = canonicalOrganizerEvents(input.snapshot);
  const matchingEvents = events.filter((event) => eventMatchesSlug(event, input.slug));

  if (matchingEvents.length === 0) return null;
  if (matchingEvents.length !== 1) {
    throw new InvalidCanonicalOrganizerCatalogueError();
  }

  const ownerId = matchingEvents[0]!.ownerId;
  const ownerEvents = events.filter((event) => event.ownerId === ownerId);
  if (ownerEvents.length === 0) {
    throw new InvalidCanonicalOrganizerCatalogueError();
  }

  const name = canonicalPublicOrganizerLabel(ownerId);
  const organizerEvents: OrbitLandingEventView[] = ownerEvents.map((event) => {
    const view = getOrbitLandingEventView({
      event: event.event,
      evidenceSummary:
        input.snapshot.evidenceSummaries[event.event.id] ??
        "Source-backed event loaded from canonical Event Core.",
      generatedAt: input.snapshot.generatedAt,
      participantCount: event.participantCount,
      routeCode: event.publicCode,
    });

    return {
      ...view,
      host: name,
      organizer: name,
      stats: {
        ...view.stats,
        attendees: [],
        authed: false,
        youRsvped: false,
      },
      youRsvped: false,
    };
  });

  return {
    events: organizerEvents,
    handle: `已记录 ${organizerEvents.length} 场 · ${organizerEvents.reduce(
      (sum, event) => sum + event.participantCount,
      0,
    )} 参会者`,
    initial: "O",
    name,
  };
}

function organizerNotFound(): AppOrganizerPublicRouteViewModel {
  return routeState({
    errorCode: PUBLIC_ORGANIZER_NOT_FOUND,
    evidenceIds: ["public-catalogue-organizer-not-found"],
    scenario: "empty",
  });
}

function canonicalOrganizerFailure(
  errorCode:
    | typeof CANONICAL_PUBLIC_ORGANIZER_UNAVAILABLE
    | typeof CANONICAL_PUBLIC_ORGANIZER_INVALID,
): AppOrganizerPublicRouteViewModel {
  return routeState({
    errorCode,
    evidenceIds: [errorCode.toLocaleLowerCase("en-US")],
    scenario: "failure",
  });
}

export async function loadAppOrganizerPublicRouteViewModel(
  input: AppOrganizerPublicRouteInput,
  dependencies: AppOrganizerPublicRouteDependencies = {},
): Promise<AppOrganizerPublicRouteViewModel> {
  if (!normalizedSlug(input.slug)) return organizerNotFound();

  const catalogue = (
    dependencies.createCatalogue ?? createConfiguredCanonicalPublicEventCatalogue
  )();
  if (!catalogue) {
    return canonicalOrganizerFailure(CANONICAL_PUBLIC_ORGANIZER_UNAVAILABLE);
  }

  try {
    const organizer = canonicalOrganizerViewModel({
      slug: input.slug,
      snapshot: await catalogue.read(),
    });

    return organizer
      ? { organizer, state: "success" }
      : organizerNotFound();
  } catch {
    return canonicalOrganizerFailure(CANONICAL_PUBLIC_ORGANIZER_INVALID);
  }
}
