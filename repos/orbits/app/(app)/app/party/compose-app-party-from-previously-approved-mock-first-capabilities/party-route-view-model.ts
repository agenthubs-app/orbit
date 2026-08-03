import type { AppProfileActor } from "../../profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import type {
  OrbitPartyAgendaItemView,
  OrbitPartyPersonView,
  OrbitPartyTableView,
  OrbitPartyViewModel,
} from "../../orbit-party-route-view-model";
import type { OrbitLanguage } from "../../orbit-language-core";
import {
  resolveModuleMode,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";
import type { EventRecord } from "../../../../../features/events/event-crud-and-import/contract";
import { loadEventForRegistration } from "../../../../../features/events/registration/event-loader";
import {
  EventOperationsError,
  type EventContactRequest,
  type EventOperationsParticipant,
  type EventOperationsParticipantRecommendations,
  type EventOperationsTable,
} from "../../../../../features/events/event-operations/contract";
import { createConfiguredEventOperationsService } from "../../../../../features/events/event-operations/runtime";
import type { EventOperationsAttendeeWorkspace } from "../../../../../features/events/event-operations/service";

export interface AppPartySearchParams {
  code?: string | string[];
  eventId?: string | string[];
}
export type AppPartyRouteScenario = "empty" | "pending" | "failure";
export interface AppPartyRouteControls {
  scenario?: AppPartyRouteScenario;
}

export interface AppPartyRouteInput {
  actor?: AppProfileActor | null;
  eventId?: string | null;
  language?: OrbitLanguage;
  mode?: ModuleMode | string | null;
  searchParams?: AppPartySearchParams;
}

export interface AppPartyRouteDependencies {
  loadEventMetadata?: (
    eventId: string,
    organizerActorId: string,
  ) => Promise<EventRecord | null>;
  getEventOperationsWorkspace?: (
    eventId: string,
    actorId: string,
  ) => Promise<EventOperationsAttendeeWorkspace>;
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

interface PartyEventMetadata {
  endsAt: string;
  id: string;
  name: string;
  startsAt: string;
  venue: string;
}

function timeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(11, 16)
    : "—";
}

function agendaForOperations(
  workspace: EventOperationsAttendeeWorkspace,
): OrbitPartyAgendaItemView[] {
  return [
    {
      description: "A persisted, actor-scoped arrival record opens during this window.",
      label: "Check-in opens",
      time: timeLabel(workspace.configuration.checkInOpensAt),
    },
    {
      description: "AI complementary tables with a real table number and seat.",
      label: "Round one tables",
      time: timeLabel(workspace.configuration.roundOneStartsAt),
    },
    {
      description: "AI topic-led tables remix the complete participant snapshot.",
      label: "Round two topic tables",
      time: timeLabel(workspace.configuration.roundTwoStartsAt),
    },
  ];
}

function eventPhaseFor(metadata: PartyEventMetadata): OrbitPartyViewModel["eventPhase"] {
  const now = Date.now();
  if (now < Date.parse(metadata.startsAt)) return "upcoming";
  if (now > Date.parse(metadata.endsAt)) return "ended";
  return "active";
}

function contactRequestFor(
  workspace: EventOperationsAttendeeWorkspace,
  participant: EventOperationsParticipant,
): EventContactRequest | null {
  return (
    workspace.contactRequests.find(
      (request) =>
        request.requesterParticipantId === participant.participantId ||
        request.targetParticipantId === participant.participantId,
    ) ?? null
  );
}

function recommendationFor(
  recommendations: EventOperationsParticipantRecommendations | null,
  participantId: string,
) {
  return (
    recommendations?.recommendations.find(
      (recommendation) =>
        recommendation.targetParticipantId === participantId,
    ) ?? null
  );
}

function assignmentFor(
  table: EventOperationsTable | null,
  participantId: string,
) {
  return table?.members.find((member) => member.participantId === participantId) ?? null;
}

function personFromOperations(input: {
  index: number;
  participant: EventOperationsParticipant;
  workspace: EventOperationsAttendeeWorkspace;
}): OrbitPartyPersonView {
  const recommendation = recommendationFor(
    input.workspace.recommendations,
    input.participant.participantId,
  );
  const request = contactRequestFor(input.workspace, input.participant);
  const assignment = assignmentFor(
    input.workspace.roundOneTable,
    input.participant.participantId,
  );
  const incoming =
    request?.targetParticipantId === input.workspace.me.participantId &&
    request.status === "awaiting_target_consent";
  const topics = input.participant.topics.slice(0, 4);

  return {
    company: input.participant.company ?? "Independent",
    contactId: request?.contactId ?? null,
    contactRequestDirection: request
      ? request.requesterParticipantId === input.workspace.me.participantId
        ? "outgoing"
        : "incoming"
      : null,
    contactRequestId: request?.requestId ?? null,
    contactRequestStatus: incoming
      ? "incoming"
      : request?.status ?? "none",
    g: gradientClasses[input.index % gradientClasses.length],
    groupNumber: assignment
      ? input.workspace.roundOneTable?.tableNumber ?? null
      : null,
    icebreakers: recommendation ? [...recommendation.icebreakers] : [],
    id: input.participant.participantId,
    industry: input.participant.industry ?? "Not provided",
    initial: initialFor(input.participant.displayName),
    isRecommended: recommendation !== null,
    memberHint: recommendation?.memberHint ?? null,
    name: input.participant.displayName,
    noMatchReason: null,
    offering: input.participant.offers.join(" · ") || "Not provided",
    reason: recommendation
      ? recommendation.reasons.join(" ")
      : "Registered participant directory profile; this is not an AI recommendation.",
    score: recommendation?.score ?? 0,
    seat: assignment?.seat ?? null,
    seeking: input.participant.needs.join(" · ") || "Not provided",
    summary: [
      input.participant.role,
      input.participant.company,
      input.participant.experienceHighlight,
    ]
      .filter(Boolean)
      .join(" · "),
    title: input.participant.role ?? "Event participant",
    topics,
  };
}

function tableView(input: {
  peopleById: ReadonlyMap<string, OrbitPartyPersonView>;
  table: EventOperationsTable | null;
  meParticipantId: string;
}): OrbitPartyTableView | null {
  if (!input.table) return null;
  const meAssignment = input.table.members.find(
    (member) => member.participantId === input.meParticipantId,
  );
  if (!meAssignment) return null;
  const memberRationales = input.table.memberRationales;
  if (
    !memberRationales ||
    Object.keys(memberRationales).length !== input.table.members.length ||
    input.table.members.some(
      (member) => !memberRationales[member.participantId]?.trim(),
    )
  ) {
    return null;
  }
  return {
    icebreakers: [...input.table.icebreakers],
    memberPrompts: [
      ...(input.table.memberPrompts[input.meParticipantId] ?? []),
    ],
    members: input.table.members.flatMap((member) => {
      if (member.participantId === input.meParticipantId) return [];
      const person = input.peopleById.get(member.participantId);
      return person
        ? [{
            ...person,
            groupNumber: input.table?.tableNumber ?? null,
            groupingRationale: memberRationales[member.participantId],
            seat: member.seat,
          }]
        : [];
    }),
    myRationale: memberRationales[input.meParticipantId],
    rationale: input.table.rationale,
    seat: meAssignment.seat,
    tableNumber: input.table.tableNumber,
    theme: input.table.theme,
  };
}

function contactRequestViews(
  workspace: EventOperationsAttendeeWorkspace,
): OrbitPartyViewModel["contactRequests"] {
  return workspace.contactRequests.map((request) => ({
    direction:
      request.requesterParticipantId === workspace.me.participantId
        ? "outgoing"
        : "incoming",
    otherParticipantId:
      request.requesterParticipantId === workspace.me.participantId
        ? request.targetParticipantId
        : request.requesterParticipantId,
    requestId: request.requestId,
    status: request.status,
  }));
}

function partyViewModelFromOperations(input: {
  event: PartyEventMetadata;
  workspace: EventOperationsAttendeeWorkspace;
}): OrbitPartyViewModel {
  const attendees = input.workspace.directory.map((participant, index) =>
    personFromOperations({ index, participant, workspace: input.workspace }),
  );
  const peopleById = new Map(attendees.map((person) => [person.id, person]));
  const recommendations = input.workspace.recommendations
    ? input.workspace.recommendations.recommendations.flatMap((recommendation) => {
        const person = peopleById.get(recommendation.targetParticipantId);
        return person ? [person] : [];
      })
    : [];
  const roundOne = tableView({
    meParticipantId: input.workspace.me.participantId,
    peopleById,
    table: input.workspace.roundOneTable,
  });
  const roundTwo = tableView({
    meParticipantId: input.workspace.me.participantId,
    peopleById,
    table: input.workspace.roundTwoTable,
  });

  return {
    accessCode: null,
    agenda: agendaForOperations(input.workspace),
    attendees,
    checkedInAt: input.workspace.checkIn?.checkedInAt ?? null,
    checkInAvailable: input.workspace.checkInAvailable,
    contactRequests: contactRequestViews(input.workspace),
    eventId: input.workspace.eventId,
    eventName: input.event.name,
    eventPhase: eventPhaseFor(input.event),
    eventVenue: input.event.venue,
    generationNotice: input.workspace.generationNotice,
    graph: input.workspace.graph,
    icebreakers: roundOne?.icebreakers ?? roundTwo?.icebreakers ?? [],
    me: {
      groupNumber: roundOne?.tableNumber ?? null,
      initial: initialFor(input.workspace.me.displayName),
      name: input.workspace.me.displayName,
      participantId: input.workspace.me.participantId,
      offering: [...input.workspace.me.offers],
      prompts: roundOne?.memberPrompts ?? [],
      role: [input.workspace.me.role, input.workspace.me.company]
        .filter(Boolean)
        .join(" · "),
      seat: roundOne?.seat ?? null,
      seeking: [...input.workspace.me.needs],
      topics: [...input.workspace.me.topics],
    },
    profileEditDeadlineAt: input.workspace.configuration.profileEditDeadlineAt,
    profileEditable: input.workspace.profileEditable,
    recommendations,
    recommendationNoMatchReason:
      input.workspace.recommendations?.noMatchReason ?? null,
    resultsAvailableAt: input.workspace.configuration.resultsAvailableAt,
    resultsState: input.workspace.resultsState,
    roundOne,
    roundTwo,
    tableMates: roundOne?.members ?? [],
  };
}

export async function loadAppPartyRouteViewModel(
  input: AppPartyRouteInput = {},
  dependencies: AppPartyRouteDependencies = {},
  controls: AppPartyRouteControls = {},
): Promise<AppPartyRouteViewModel> {
  const language = input.language ?? "en";
  const scenario = normalizeScenario(controls.scenario);
  const eventId = routeEventId(input);

  if (!eventId) {
    return routeState({
      evidenceIds: [],
      eventId: null,
      language,
      scenario: "empty",
    });
  }

  if (scenario) {
    return routeState({
      evidenceIds: [],
      eventId,
      language,
      scenario,
    });
  }

  const actorId = input.actor?.id.trim();
  if (!actorId) {
    return routeState({
      errorCode: "EVENT_OPERATIONS_FORBIDDEN",
      evidenceIds: ["EVENT_OPERATIONS_FORBIDDEN"],
      eventId,
      language,
      scenario: "failure",
    });
  }

  let workspace: EventOperationsAttendeeWorkspace;
  try {
    if (dependencies.getEventOperationsWorkspace) {
      workspace = await dependencies.getEventOperationsWorkspace(eventId, actorId);
    } else {
      const service = createConfiguredEventOperationsService();
      if (!service) {
        throw new EventOperationsError(
          "EVENT_OPERATIONS_NOT_CONFIGURED",
          "Event operations storage is not configured.",
        );
      }
      workspace = await service.attendeeWorkspace({ actorId, eventId });
    }
  } catch (error) {
    const errorCode =
      error instanceof EventOperationsError
        ? error.code
        : "EVENT_OPERATIONS_WORKSPACE_FAILED";
    return routeState({
      errorCode,
      evidenceIds: [errorCode],
      eventId,
      language,
      scenario:
        errorCode === "EVENT_OPERATIONS_NOT_CONFIGURED" ? "pending" : "failure",
    });
  }

  let eventRecord: EventRecord | null;
  try {
    eventRecord = await (
      dependencies.loadEventMetadata ?? loadEventForRegistration
    )(workspace.eventId, workspace.configuration.organizerActorId);
  } catch {
    eventRecord = null;
  }

  if (!eventRecord || eventRecord.id !== workspace.eventId) {
    const errorCode = "EVENT_OPERATIONS_EVENT_METADATA_NOT_FOUND";
    return routeState({
      errorCode,
      evidenceIds: [errorCode],
      eventId,
      language,
      scenario: "failure",
    });
  }

  const metadata: PartyEventMetadata = {
    endsAt: eventRecord.endsAt,
    id: eventRecord.id,
    name: eventRecord.title,
    startsAt: eventRecord.startsAt,
    venue: eventRecord.venue,
  };

  return {
    party: partyViewModelFromOperations({ event: metadata, workspace }),
    state: "success",
  };
}
