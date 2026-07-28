import type {
  EventListPayload,
  EventRecord,
} from "../../../../../features/events/event-crud-and-import/contract";
import { resolveEventCrudAndImportService } from "../../../../../features/events/service-factory";
import type { ModuleMode } from "../../../../../shared/services/module-mode";
import type { OrbitLanguage } from "../../orbit-language-core";
import {
  getOrbitLandingViewModel,
  type OrbitLandingEventView,
} from "../../orbit-landing-route-view-model";
import type { OrbitOrganizerPublicViewModel } from "../../orbit-organizer-route-view-model";

export type AppOrganizerPublicSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppOrganizerPublicRouteScenario = "empty" | "pending" | "failure";

export interface AppOrganizerPublicRouteInput {
  mode?: ModuleMode | string | null;
  scenario?: string | null;
  searchParams?: AppOrganizerPublicSearchParams;
  slug: string;
}

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

function readSearchParam(
  searchParams: AppOrganizerPublicSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function normalizeScenario(
  scenario?: string | null,
): AppOrganizerPublicRouteScenario | null {
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds.filter(Boolean)));
}

function compactEventId(eventId: string): string {
  return eventId.replace(/[^a-z0-9]+/giu, "").toLowerCase();
}

const PUBLIC_ORGANIZER_NOT_FOUND = "PUBLIC_ORGANIZER_NOT_FOUND";
const organizerRouteStateCopy = {
  empty: {
    en: {
      description:
        "No source-backed organizer events are ready for this public page.",
      emptyState:
        "The public organizer page has no reviewed events to display.",
      eyebrow: "Organizer",
      guardrail:
        "This route only reads event records. It does not create registrations, notify attendees, write calendars, or contact outside providers.",
      nextStep: "Return to events and open an organizer from a reviewed event.",
      purpose: "Keep public organizer pages tied to reviewed event sources.",
      title: "Organizer page is empty",
    },
    zh: {
      description: "这个公开主办方页面暂时没有可展示的来源活动。",
      emptyState: "目前没有已审核的主办方活动可供展示。",
      eyebrow: "主办方",
      guardrail:
        "该页面只读取活动记录，不会创建报名、通知参会者、写入日历或联系外部服务。",
      nextStep: "返回活动目录，从已审核活动进入主办方页面。",
      purpose: "公开主办方页面只展示已审核的活动来源。",
      title: "主办方页面暂无活动",
    },
  },
  failure: {
    en: {
      description: "Organizer page could not load event context.",
      emptyState: "No organizer page was generated from fallback mock data.",
      eyebrow: "Organizer",
      guardrail:
        "The failed route state stops before registration writes, notifications, calendar, email, AI, or outside network work.",
      nextStep:
        "Confirm the Events live store is configured, then retry the organizer page.",
      purpose:
        "Show a recoverable public organizer boundary without falling back to legacy landing data.",
      title: "Organizer page could not load",
    },
    zh: {
      description: "主办方页面暂时无法读取活动上下文。",
      emptyState: "页面没有使用模拟数据生成主办方信息。",
      eyebrow: "主办方",
      guardrail:
        "失败状态会在报名写入、通知、日历、邮件、AI 或外部网络操作之前停止。",
      nextStep: "确认活动数据源已配置后，再重试主办方页面。",
      purpose: "在不回退旧版或模拟数据的前提下提供可恢复边界。",
      title: "主办方页面暂时无法加载",
    },
  },
  notFound: {
    en: {
      description:
        "This public organizer identifier does not match a reviewed catalogue event.",
      emptyState:
        "No first event, private event, or mock organizer was used as a fallback.",
      eyebrow: "Organizer",
      guardrail:
        "This boundary reads only the public catalogue. It does not read private events, create registrations, or trigger outside work.",
      nextStep: "Return to events and open an organizer from a reviewed event.",
      purpose:
        "Keep public organizer identity bound to an exact reviewed event source.",
      title: "Organizer not found",
    },
    zh: {
      description: "这个公开主办方标识没有匹配到已审核的目录活动。",
      emptyState: "页面没有用首场活动、私有活动或模拟主办方作为兜底。",
      eyebrow: "主办方",
      guardrail:
        "该边界只读取公共活动目录，不会读取私有活动、创建报名或触发外部操作。",
      nextStep: "返回活动目录，从已审核活动进入主办方页面。",
      purpose: "公开主办方身份必须精确绑定到已审核的活动来源。",
      title: "未找到该主办方",
    },
  },
  pending: {
    en: {
      description: "Organizer events are waiting for reviewed source context.",
      emptyState:
        "The public organizer page is held until event sources are ready.",
      eyebrow: "Organizer",
      guardrail:
        "Pending organizer context cannot create registrations or trigger external work.",
      nextStep: "Check this organizer again after event source review finishes.",
      purpose:
        "Keep public organizer pages stable while source review is pending.",
      title: "Organizer page is loading",
    },
    zh: {
      description: "主办方活动正在等待来源审核完成。",
      emptyState: "活动来源就绪前，公开主办方页面会保持等待状态。",
      eyebrow: "主办方",
      guardrail: "等待中的主办方上下文不能创建报名或触发外部操作。",
      nextStep: "活动来源审核完成后，再查看这个主办方。",
      purpose: "来源审核期间保持公开主办方页面状态稳定。",
      title: "主办方页面正在加载",
    },
  },
} as const;
const organizerRecoveryCopy = {
  en: {
    label: "Return to events",
    recoveryCopy:
      "Open an event with reviewed source context before retrying the organizer page.",
  },
  zh: {
    label: "返回活动",
    recoveryCopy: "从已审核活动进入主办方页面后再重试。",
  },
} as const;

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

function statusFor(event: EventRecord): OrbitLandingEventView["status"] {
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

function agendaFor(event: EventRecord) {
  const start = new Date(event.startsAt);
  const startHour = Number.isFinite(start.getTime()) ? start.getHours() : 18;
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    {
      description: event.relationshipContext || event.description,
      label: "Relationship context",
      time: `${pad(startHour)}:00`,
    },
    {
      description: event.recommendedPreparation,
      label: "Preparation",
      time: `${pad((startHour + 1) % 24)}:00`,
    },
    {
      description: event.nextAction,
      label: "Next action",
      time: `${pad((startHour + 2) % 24)}:00`,
    },
  ];
}

function landingEventFor(
  event: EventRecord,
  index: number,
): OrbitLandingEventView {
  const summary =
    event.relationshipContext || event.description || event.nextAction;

  return {
    address: event.venue,
    agenda: agendaFor(event),
    brandColor: "#6359E9",
    cap: 20,
    code: event.id,
    descriptionZh: event.description || summary,
    detailLogoUrl: "",
    endsAt: event.endsAt,
    feeLabel: "Source-backed",
    host: event.sourceMetadata.label,
    id: event.id,
    industry: "Relationship",
    logoUrl: "",
    mapX: 38 + ((index * 11) % 34),
    mapY: 36 + ((index * 7) % 32),
    name: event.title,
    organizer: event.sourceMetadata.label,
    participantCount: 0,
    place: event.venue,
    startsAt: event.startsAt,
    stats: {
      attendees: [],
      authed: true,
      count: 0,
      youRsvped: true,
    },
    status: statusFor(event),
    summaryZh: summary,
    tags: [event.status, event.sourceMetadata.captureMethod],
    theme: "relationship",
    venue: event.venue,
    youRsvped: true,
  };
}

function matchesSlug(event: OrbitLandingEventView, slug: string): boolean {
  const normalized = slug.trim().toLowerCase();

  return (
    event.id.toLowerCase() === normalized ||
    event.code.toLowerCase() === normalized ||
    compactEventId(event.id) === normalized ||
    compactEventId(event.code) === normalized
  );
}

function organizerViewModel(input: {
  eventList: EventListPayload;
  slug: string;
}): OrbitOrganizerPublicViewModel | null {
  const events = input.eventList.events.map(landingEventFor);

  if (events.length === 0) {
    return null;
  }

  const event = events.find((item) => matchesSlug(item, input.slug));

  if (!event) {
    return null;
  }
  const name = event.organizer || event.host;
  const theirEvents = events.filter(
    (item) => item.organizer === name || item.host === name,
  );
  const organizerEvents = theirEvents.length ? theirEvents : [event];

  return {
    events: organizerEvents,
    handle: `已记录 ${organizerEvents.length} 场 · ${organizerEvents.reduce(
      (sum, item) => sum + item.participantCount,
      0,
    )} 参会者`,
    initial: (name || "O").slice(0, 1),
    name,
  };
}

function publicCatalogueOrganizerViewModel(
  slug: string,
): OrbitOrganizerPublicViewModel | null {
  const events = getOrbitLandingViewModel().events;
  const event = events.find((item) => matchesSlug(item, slug));
  if (!event) return null;

  const name = event.organizer || event.host;
  const organizerEvents = events
    .filter((item) => item.organizer === name || item.host === name)
    .map((item) => ({
      ...item,
      stats: {
        ...item.stats,
        attendees: [],
        authed: false,
        youRsvped: false,
      },
      youRsvped: false,
    }));

  return {
    events: organizerEvents,
    handle: `已记录 ${organizerEvents.length} 场 · ${organizerEvents.reduce(
      (sum, item) => sum + item.participantCount,
      0,
    )} 参会者`,
    initial: (name || "O").slice(0, 1),
    name,
  };
}

export async function loadAppOrganizerPublicRouteViewModel(
  input: AppOrganizerPublicRouteInput,
): Promise<AppOrganizerPublicRouteViewModel> {
  const requestedMode =
    input.mode ?? readSearchParam(input.searchParams, "mode") ?? null;
  const scenario = normalizeScenario(
    input.scenario ?? readSearchParam(input.searchParams, "scenario"),
  );
  const usePublicCatalogue = !requestedMode && !scenario;

  if (usePublicCatalogue) {
    const publicOrganizer = publicCatalogueOrganizerViewModel(input.slug);

    return publicOrganizer
      ? {
          organizer: publicOrganizer,
          state: "success",
        }
      : routeState({
          errorCode: PUBLIC_ORGANIZER_NOT_FOUND,
          evidenceIds: ["public-catalogue-organizer-not-found"],
          scenario: "empty",
        });
  }

  const mode = requestedMode ?? undefined;
  const serviceResolution = resolveEventCrudAndImportService(mode);

  if (serviceResolution.success === false) {
    return routeState({
      errorCode: serviceResolution.error.code,
      evidenceIds: [serviceResolution.error.capabilityId],
      scenario: "failure",
    });
  }

  const eventListResult = await serviceResolution.service.listEvents({
    scenario,
  });

  if (eventListResult.success === false) {
    return routeState({
      errorCode: eventListResult.error.code,
      evidenceIds: eventListResult.error.evidenceIds,
      scenario: "failure",
    });
  }

  if (scenario === "empty" || eventListResult.data.state === "empty") {
    return routeState({
      evidenceIds: eventListResult.data.provenance.evidenceIds,
      scenario: "empty",
    });
  }

  if (scenario === "pending" || eventListResult.data.state === "pending") {
    return routeState({
      evidenceIds: eventListResult.data.provenance.evidenceIds,
      scenario: "pending",
    });
  }

  const organizer = organizerViewModel({
    eventList: eventListResult.data,
    slug: input.slug,
  });

  if (!organizer) {
    return routeState({
      evidenceIds: eventListResult.data.provenance.evidenceIds,
      scenario: "empty",
    });
  }

  return {
    organizer,
    state: "success",
  };
}
