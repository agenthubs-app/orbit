import {
  loadAppEventDetailRoute,
  type AppEventDetailBoundaryModel,
  type AppEventDetailSuccessModel,
} from "../../events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service";
import { eventRegistrationRuntimeService } from "../../../../../features/events/registration/runtime";
import {
  loadAppProfileRouteViewModel,
  type AppProfileActor,
} from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";
import type {
  OrbitPartyAgendaItemView,
  OrbitPartyPersonView,
  OrbitPartyViewModel,
} from "../../orbit-party-route-view-model";
import type { OrbitLanguage } from "../../orbit-language-core";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";
import { eventStatusFor } from "../../orbit-hybrid-route-data";
import {
  getOrbitLandingViewModel,
  type OrbitLandingEventView,
} from "../../orbit-landing-route-view-model";

export type AppPartySearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppPartyRouteScenario = "empty" | "pending" | "failure";

export interface AppPartyRouteInput {
  actor?: AppProfileActor | null;
  eventId?: string | null;
  language?: OrbitLanguage;
  mode?: ModuleMode | string | null;
  scenario?: string | null;
  searchParams?: AppPartySearchParams;
}

export interface AppPartyRouteDependencies {
  getCatalogueEvents?: () => readonly OrbitLandingEventView[];
  getRegistrationStatus?: (
    eventId: string,
    actorId: string,
  ) => Promise<"cancelled" | "rsvped" | null>;
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

function defaultEventIdFor(mode?: ModuleMode | string | null): string | null {
  const resolvedMode = resolveModuleMode(mode ?? undefined);

  return resolvedMode === "mock" ? "demo-event-1" : null;
}

function routeEventId(input: AppPartyRouteInput): string | null {
  return (
    input.eventId?.trim() ||
    readSearchParam(input.searchParams, "eventId")?.trim() ||
    readSearchParam(input.searchParams, "code")?.trim() ||
    defaultEventIdFor(input.mode)
  );
}

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds.filter(Boolean)));
}

function partyRouteText(
  language: OrbitLanguage,
  copy: { en: string; zh: string },
): string {
  return language === "zh" ? copy.zh : copy.en;
}

function routeState(input: {
  errorCode?: string | null;
  evidenceIds: readonly string[];
  eventId: string | null;
  language: OrbitLanguage;
  scenario: AppPartyRouteScenario;
}): AppPartyRouteViewModel {
  const t = (copy: { en: string; zh: string }) =>
    partyRouteText(input.language, copy);
  const eventSelected = Boolean(input.eventId);
  const emptyDescription = eventSelected
    ? t({
        en: "The selected event is available, but no reviewed attendee or recommendation context is ready for Party mode.",
        zh: "已找到所选活动，但还没有可供 Party 模式使用的已复核参会者或推荐上下文。",
      })
    : t({
        en: "No event has been selected for Party mode.",
        zh: "尚未选择要进入 Party 模式的活动。",
      });
  const emptyState = eventSelected
    ? t({
        en: "The Party screen stays hidden until this event has source-backed people context.",
        zh: "在这场活动具备有来源的人物上下文前，Party 界面会保持隐藏。",
      })
    : t({
        en: "The Party screen stays hidden until an event with source-backed people context is selected.",
        zh: "在选择具备有来源人物上下文的活动前，Party 界面会保持隐藏。",
      });
  const emptyNextStep = eventSelected
    ? t({
        en: "Review or import attendee context for this event before retrying Party mode.",
        zh: "先复核或导入这场活动的参会者上下文，再重试 Party 模式。",
      })
    : t({
        en: "Open an event with reviewed attendee context before entering Party mode.",
        zh: "先打开一场具备已复核参会者上下文的活动，再进入 Party 模式。",
      });
  const copyByScenario = {
    empty: {
      description: emptyDescription,
      emptyState,
      eyebrow: "Party",
      guardrail: t({
        en: "This route only reads event, attendee, recommendation, and profile sources. It does not check people in, create contacts, send notifications, write calendars, call AI, or contact external providers.",
        zh: "此入口只读取活动、参会者、推荐和个人资料来源；不会签到、创建联系人、发送通知、写入日历、调用 AI 或联系外部服务。",
      }),
      nextStep: emptyNextStep,
      purpose: t({
        en: "Keep the Party experience tied to reviewed live-capable event sources.",
        zh: "确保 Party 体验只使用经过复核、可由真实服务读取的活动来源。",
      }),
      title: t({
        en: "Party is not ready",
        zh: "Party 尚未就绪",
      }),
    },
    failure: {
      description: t({
        en: "Party could not load event or profile context.",
        zh: "Party 无法加载活动或个人资料上下文。",
      }),
      emptyState: t({
        en: "No check-in was recorded, no contact was created, and no external provider was contacted.",
        zh: "没有记录签到、没有创建联系人，也没有联系任何外部服务。",
      }),
      eyebrow: "Party",
      guardrail: t({
        en: "The failed route state stops before check-in writes, notifications, contact creation, calendar, email, AI, or outside network work.",
        zh: "失败边界会在签到写入、通知、联系人创建、日历、邮件、AI 或外部网络操作前停止。",
      }),
      nextStep: t({
        en: "Confirm the Events live store, event capability records, and profile sources are configured, then retry Party mode.",
        zh: "确认活动实时存储、活动能力记录和个人资料来源已配置，再重试 Party 模式。",
      }),
      purpose: t({
        en: "Show a recoverable Party boundary without falling back to legacy hybrid route data.",
        zh: "展示可恢复的 Party 边界，不回退到旧的混合路由数据。",
      }),
      title: t({
        en: "Party could not load",
        zh: "Party 无法加载",
      }),
    },
    pending: {
      description: t({
        en: "Party context is waiting for reviewed event, attendee, recommendation, or profile sources.",
        zh: "Party 上下文正在等待活动、参会者、推荐或个人资料来源完成复核。",
      }),
      emptyState: t({
        en: "The Party screen is held until the live-capable event workspace is ready.",
        zh: "在可由真实服务读取的活动工作区就绪前，Party 界面会保持等待。",
      }),
      eyebrow: "Party",
      guardrail: t({
        en: "Pending Party context cannot create check-ins, contacts, notifications, or external work.",
        zh: "等待中的 Party 上下文不能创建签到、联系人、通知或外部操作。",
      }),
      nextStep: t({
        en: "Check the event again after roster and recommendation review finishes.",
        zh: "名单和推荐复核完成后，再次查看这场活动。",
      }),
      purpose: t({
        en: "Keep Party mode stable while source review is pending.",
        zh: "在来源复核期间保持 Party 模式稳定。",
      }),
      title: t({
        en: "Party is loading",
        zh: "Party 正在加载",
      }),
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
          href: input.eventId
            ? `/app/events/${encodeURIComponent(input.eventId)}`
            : "/app/events",
          label: input.eventId
            ? t({
                en: "Return to current event",
                zh: "返回当前活动",
              })
            : t({
                en: "Return to events",
                zh: "返回活动",
              }),
          recoveryCopy: copyByScenario[input.scenario].nextStep,
        },
      ],
      scenario: input.scenario,
    },
    state: "route-state",
  };
}

function routeStateFromEventBoundary(
  boundary: AppEventDetailBoundaryModel,
  eventId: string,
  language: OrbitLanguage,
): AppPartyRouteViewModel {
  return routeState({
    errorCode: boundary.evidence[0] ?? null,
    evidenceIds: boundary.evidence,
    eventId,
    language,
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
  const knownContact = model.attendeeRoster.attendees.find(
    (item) => item.attendeeId === attendee.attendeeId,
  )?.knownContactMarker;

  return {
    company,
    contactId:
      knownContact?.isKnownContact === true
        ? knownContact.contactId
        : null,
    g: gradientClasses[index % gradientClasses.length],
    groupNumber: null,
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
    seat: null,
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
    contactId: attendee.knownContactMarker.isKnownContact
      ? attendee.knownContactMarker.contactId
      : null,
    g: gradientClasses[(index + 1) % gradientClasses.length],
    groupNumber: null,
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
    seat: null,
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
    groupNumber: null,
    initial: initialFor(profile.fullName),
    name: profile.fullName,
    offering: profile.offering.length ? profile.offering : ["relationship context"],
    prompts: [
      "Ask what outcome this person wants from the event.",
      "Capture one concrete next step before leaving the conversation.",
      "Confirm whether a warm introduction is appropriate.",
    ],
    role: [profile.title, profile.company].filter(Boolean).join(" · "),
    seat: null,
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
    accessCode: null,
    agenda: agendaFor(input.event),
    checkInAvailable: false,
    eventId: event.id,
    eventPhase: eventStatusFor(
      event,
      input.event.eventDetail.provenance.collectedAt,
    ),
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

function cataloguePartyPeople(
  event: OrbitLandingEventView,
): OrbitPartyPersonView[] {
  return event.stats.attendees.map((attendee, index) => {
    const [title = "Event attendee", ...organizationParts] =
      attendee.role.split(" · ");
    const company = organizationParts.join(" · ") || "Event attendee";
    const topics = [event.industry, ...event.tags].filter(Boolean).slice(0, 4);

    return {
      company,
      contactId: null,
      g: gradientClasses[index % gradientClasses.length],
      groupNumber: null,
      icebreakers: [
        "What outcome did you take from this event?",
        "Which follow-up would be useful now?",
      ],
      id: `${event.id}:catalogue-attendee:${index}`,
      industry: topics[0] ?? "Relationship",
      initial: attendee.initial || initialFor(attendee.name),
      name: attendee.name,
      offering: `Source-backed attendee context from ${event.name}.`,
      reason:
        "This person appears in the reviewed attendee roster for the current event.",
      score: 70,
      seat: null,
      seeking: "A relevant, consent-based event follow-up.",
      summary: `${title} @ ${company}.`,
      title,
      topics,
    };
  });
}

function cataloguePartyViewModel(input: {
  event: OrbitLandingEventView;
  profile: ReturnType<typeof profileRouteToOrbitProfileViewModel>;
}): OrbitPartyViewModel {
  const people = cataloguePartyPeople(input.event);

  return {
    accessCode: null,
    agenda: input.event.agenda,
    checkInAvailable: false,
    eventId: input.event.id,
    eventPhase: input.event.status,
    eventName: input.event.name,
    eventVenue: input.event.venue,
    icebreakers: [
      "What outcome did you take from this event?",
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

async function registeredCatalogueEvent(
  input: AppPartyRouteInput,
  eventId: string,
  dependencies: AppPartyRouteDependencies,
): Promise<OrbitLandingEventView | null> {
  const actorId = input.actor?.id.trim();
  if (!actorId) return null;

  const catalogueEvents = (
    dependencies.getCatalogueEvents ??
    (() => getOrbitLandingViewModel().events)
  )();
  const event =
    catalogueEvents.find(
      (item) => item.id === eventId || item.code === eventId,
    ) ?? null;
  if (!event) return null;

  const registrationStatus = dependencies.getRegistrationStatus
    ? await dependencies.getRegistrationStatus(event.id, actorId)
    : (
        await eventRegistrationRuntimeService.get({
          eventId: event.id,
          userId: actorId,
        })
      )?.status ?? null;

  return registrationStatus === "rsvped" ? event : null;
}

export async function loadAppPartyRouteViewModel(
  input: AppPartyRouteInput = {},
  dependencies: AppPartyRouteDependencies = {},
): Promise<AppPartyRouteViewModel> {
  const language = input.language ?? "en";
  const mode = input.mode ?? undefined;
  const scenario = normalizeScenario(
    input.scenario ?? readSearchParam(input.searchParams, "scenario"),
  );
  const eventId = routeEventId(input);

  if (!eventId) {
    return routeState({
      evidenceIds: [],
      eventId: null,
      language,
      scenario: "empty",
    });
  }

  const eventRoute = await loadAppEventDetailRoute({
    actorId: input.actor?.id,
    eventId,
    mode,
    scenario,
  });

  const catalogueEvent =
    eventRoute.routeState === "success"
      ? null
      : await registeredCatalogueEvent(input, eventId, dependencies);

  if (eventRoute.routeState !== "success" && !catalogueEvent) {
    return routeStateFromEventBoundary(eventRoute, eventId, language);
  }

  const profileRoute = await loadAppProfileRouteViewModel(input.actor);

  if (profileRoute.state === "route-state") {
    return routeState({
      errorCode: profileRoute.routeState.errorCode,
      evidenceIds: profileRoute.routeState.evidenceIds,
      eventId,
      language,
      scenario: profileRoute.routeState.scenario,
    });
  }

  if (profileRoute.state === "failure") {
    return routeState({
      errorCode: "PROFILE_ROUTE_FAILURE",
      evidenceIds: profileRoute.failure.evidenceIds,
      eventId,
      language,
      scenario: "failure",
    });
  }

  const profile = profileRouteToOrbitProfileViewModel(profileRoute);

  if (catalogueEvent) {
    return {
      party: cataloguePartyViewModel({
        event: catalogueEvent,
        profile,
      }),
      state: "success",
    };
  }

  if (eventRoute.routeState !== "success") {
    return routeStateFromEventBoundary(eventRoute, eventId, language);
  }

  return {
    party: partyViewModel({
      event: eventRoute,
      profile,
    }),
    state: "success",
  };
}
