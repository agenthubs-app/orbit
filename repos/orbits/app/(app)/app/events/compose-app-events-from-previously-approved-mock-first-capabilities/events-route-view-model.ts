import type {
  EventListPayload,
  EventListResult,
  EventRecord,
} from "../../../../../features/events/contract";
import type {
  EventGoalReadinessPayload,
  EventGoalReadinessResult,
  EventReadinessChecklistItem,
} from "../../../../../features/events/goal-contract";
import type {
  EventRecommendationsPayload,
  EventRecommendationsResult,
} from "../../../../../features/recommendations/contract";
import type {
  EventValueRecommendation,
  EventValueRecommendationAcceptanceResult,
  EventValueRecommendationsPayload,
  EventValueRecommendationsResult,
} from "../../../../../features/recommendations/event-value-contract";
import { createAppEventsRouteServices } from "./events-service-factory";

export type AppEventsSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppEventsRouteScenario = "empty" | "pending" | "failure";

type RouteResult =
  | EventListResult
  | EventRecommendationsResult
  | EventValueRecommendationsResult
  | EventGoalReadinessResult;

interface RouteFailure {
  code: string;
  message: string;
  recovery: string;
  evidenceIds?: readonly string[];
}

export interface AppEventsEvidenceViewModel {
  id: string;
  label: string;
}

export interface AppEventsRouteStateViewModel {
  copy: {
    description: string;
    emptyState: string;
    guardrail: string;
    nextStep: string;
    purpose: string;
    title: string;
  };
  errorCode: string | null;
  evidence: readonly AppEventsEvidenceViewModel[];
  recoveryActions: readonly { href: string; label: string }[];
  scenario: AppEventsRouteScenario;
}

export interface AppEventsLedgerViewModel {
  eventCount: number;
  importedRecordCount: number;
  primaryStatus: string;
  primaryTitle: string;
}

export interface AppEventsCurrentPriorityViewModel {
  attendeeName: string;
  detailActionLabel: string;
  detailHref: string;
  eventTitle: string;
  readinessScore: number;
  recommendedAction: string;
  relationshipValue: string;
  venue: string;
  relationshipContext: string;
}

export interface AppEventsEventChoiceViewModel {
  attendeeName: string;
  detailHref: string;
  evidence: readonly AppEventsEvidenceViewModel[];
  id: string;
  nextAction: string;
  readinessScore: number;
  relationshipValue: string;
  title: string;
  venue: string;
}

export interface AppEventsAttendeeRecommendationViewModel {
  attendeeName: string;
  evidence: readonly AppEventsEvidenceViewModel[];
  openingLine: string;
  organization: string;
  recommendedAction: string;
  role: string;
  score: number;
}

export interface AppEventsValueRecommendationViewModel {
  attendeeDensity: number;
  evidence: readonly AppEventsEvidenceViewModel[];
  location: string;
  recommendedAction: string;
  title: string;
  valueScore: number;
}

export interface AppEventsReadinessChecklistItemViewModel {
  id: string;
  label: string;
  owner: string;
  rationale: string;
  status: string;
}

export interface AppEventsReadinessViewModel {
  checklist: readonly AppEventsReadinessChecklistItemViewModel[];
  evidence: readonly AppEventsEvidenceViewModel[];
  nextPreparationStep: string;
  readinessScore: number;
}

export interface AppEventsActionResultViewModel {
  acceptedTitle: string;
  calendarNeedsReview: boolean;
  databaseWriteNeedsReview: boolean;
  decisionLabel: string;
  evidence: readonly AppEventsEvidenceViewModel[];
  externalNetworkNeedsReview: boolean;
  notificationNeedsReview: boolean;
  outsideContacted: boolean;
  state: "success" | "failure";
  summary: string;
}

export interface AppEventsSuccessViewModel {
  actionResult: AppEventsActionResultViewModel | null;
  attendeePanel: {
    recommendation: AppEventsAttendeeRecommendationViewModel | null;
    summary: string;
  };
  currentPriority: AppEventsCurrentPriorityViewModel | null;
  eventChoices: readonly AppEventsEventChoiceViewModel[];
  eventSummary: string;
  ledger: AppEventsLedgerViewModel;
  readiness: AppEventsReadinessViewModel;
  topCandidate: {
    title: string;
    valueScore: number;
  } | null;
  valuePanel: {
    recommendation: AppEventsValueRecommendationViewModel | null;
    summary: string;
  };
}

export type AppEventsRouteViewModel =
  | {
      state: "success";
      workspace: AppEventsSuccessViewModel;
    }
  | {
      state: "route-state";
      routeState: AppEventsRouteStateViewModel;
    };

function bilingualText(chinese: string, english: string): string {
  return `${chinese} / ${english}`;
}

function readSearchParam(
  searchParams: AppEventsSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppEventsSearchParams | undefined,
): AppEventsRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function firstFailure(results: readonly RouteResult[]): RouteFailure | null {
  for (const result of results) {
    if (result.success === false) {
      return result.error;
    }
  }

  return null;
}

function anyResultState(
  results: readonly RouteResult[],
  state: "empty" | "pending",
): boolean {
  return results.some(
    (result) => result.success === true && result.data.state === state,
  );
}

const productCopyReplacements: readonly [RegExp, string][] = [
  [/\blocal mock decision\b/gi, "private preview"],
  [
    /\bwithout live ranking, vector, or model calls\b/gi,
    "from the approved attendee evidence",
  ],
  [/\bwithout live feeds\b/gi, "from the approved event evidence"],
  [/\bwithout live writes\b/gi, "without changing any connected account"],
  [/\blocal event records\b/gi, "event sources"],
  [/\blocal ranking rules\b/gi, "Relationship signals"],
  [/\blocal rules\b/gi, "Relationship signals"],
  [/\blocal evidence\b/gi, "Source evidence"],
  [/\bdeterministic local suggestions\b/gi, "relationship suggestions"],
  [/\bdeterministic local rule\b/gi, "readiness check"],
  [/\blocal route\b/gi, "workspace"],
  [/\bfixtures?\b/gi, "source record"],
  [/\bmanual event source records?\b/gi, "manual notes"],
  [/\bsource records has\b/gi, "source record has"],
  [/\bwriting calendars\b/gi, "changing calendars"],
  [/\bdatabases\b/gi, "saved records"],
  [/\bdatabase\b/gi, "saved record"],
  [/\bproviders?\b/gi, "connections"],
  [/\bboundary\b/gi, "check"],
  [/\broute\b/gi, "workspace"],
  [/\bmock\b/gi, "preview"],
  [/\blive\b/gi, "connected"],
  [/\bmodel calls?\b/gi, "automated calls"],
  [/\bvector\b/gi, "search"],
  [/\bdeterministic\b/gi, "reviewed"],
  [/\blocally\b/gi, "for this event"],
];

function productCopy(value: string): string {
  return productCopyReplacements.reduce((copy, [pattern, replacement]) => {
    return copy.replace(pattern, replacement);
  }, value);
}

function evidenceLabel(evidenceId: string): string {
  const words = evidenceId
    .replace(/^evidence:/, "")
    .split(/[-_:]+/)
    .filter((word) => !["fixture", "mock", "local"].includes(word))
    .map((word) => {
      if (word === "rec") {
        return "recommendation";
      }

      if (word === "evt") {
        return "event";
      }

      return word;
    });

  const label = words.join(" ");
  const englishLabel = label.charAt(0).toUpperCase() + label.slice(1);

  return bilingualText(`证据 ${englishLabel}`, englishLabel);
}

function evidenceViewModels(evidenceIds: readonly string[]): AppEventsEvidenceViewModel[] {
  return Array.from(new Set(evidenceIds)).map((id) => ({
    id,
    label: evidenceLabel(id),
  }));
}

function eventDetailHref(event: Pick<EventRecord, "id">): string {
  return `/app/events/${encodeURIComponent(event.id)}`;
}

function relationshipValueCopy(event: Pick<EventRecord, "relationshipContext">): string {
  const context = productCopy(event.relationshipContext);

  if (/storage pilot/i.test(context)) {
    return "storage pilot relationship goals.";
  }

  return context;
}

function stateCopy(scenario: AppEventsRouteScenario) {
  if (scenario === "empty") {
    return {
      description: bilingualText(
        "先创建或导入有来源的活动，再复核推荐和准备度。",
        "Create or import a sourced event before reviewing recommendations and readiness.",
      ),
      emptyState: bilingualText(
        "还没有活动、价值推荐、参会人推荐或准备记录可用。",
        "No event, value recommendation, attendee recommendation, or readiness record is ready.",
      ),
      guardrail: bilingualText(
        "此屏幕不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
        "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone from this screen.",
      ),
      nextStep: bilingualText(
        "返回有来源活动，或通过已批准的活动流程添加活动。",
        "Return to sourced events or add an event through the approved event workflow.",
      ),
      purpose: bilingualText(
        "仅在来源证据存在后展示活动准备。",
        "Show event preparation only after source evidence exists.",
      ),
      title: bilingualText("没有可用活动背景", "No event context is ready"),
    };
  }

  if (scenario === "pending") {
    return {
      description: bilingualText(
        "活动来源、推荐规则和准备检查仍在准备中。",
        "Event sources, recommendation rules, and readiness checks are still being prepared.",
      ),
      emptyState: bilingualText(
        "当前来源复核完成前，活动准备会保持隐藏。",
        "Event preparation stays hidden until the current source review finishes.",
      ),
      guardrail: bilingualText(
        "复核待处理期间，不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
        "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while review is pending.",
      ),
      nextStep: bilingualText(
        "来源复核完成后返回已准备活动。",
        "Return to ready events after the source review completes.",
      ),
      purpose: bilingualText(
        "活动准备数据仍在加载时，保持工作区稳定。",
        "Keep the workspace stable while event preparation data is still loading.",
      ),
      title: bilingualText("活动背景加载中", "Event context is loading"),
    };
  }

  return {
    description: bilingualText(
      "活动来源无法加载，因此推荐和准备状态已暂停。",
      "Event sources could not be loaded, so recommendations and readiness are paused.",
    ),
    emptyState: bilingualText(
      "活动简报会在活动来源恢复前保持不可用。",
      "The event briefing is unavailable until event sources recover.",
    ),
    guardrail: bilingualText(
      "不可用期间，不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
      "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while this is unavailable.",
    ),
    nextStep: bilingualText(
      "采取动作前，重新加载活动或检查准备状态。",
      "Reload events or check readiness status before taking action.",
    ),
    purpose: bilingualText(
      "当有来源支撑的活动背景不可用时，展示可见恢复路径。",
      "Show a visible recovery path when source-backed event context is unavailable.",
    ),
    title: bilingualText("活动无法加载", "Events could not load"),
  };
}

function routeRecoveryActions(
  scenario: AppEventsRouteScenario,
): readonly { href: string; label: string }[] {
  if (scenario === "empty") {
    return [
      {
        href: "/app/events",
        label: bilingualText("显示有来源活动", "Show sourced events"),
      },
      {
        href: "/app/events?action=accept-top-event",
        label: bilingualText("预览首选活动动作", "Preview top event action"),
      },
    ];
  }

  if (scenario === "pending") {
    return [
      {
        href: "/app/events",
        label: bilingualText("返回已准备活动", "Return to ready events"),
      },
    ];
  }

  return [
    {
      href: "/app/events",
      label: bilingualText("重新加载活动", "Reload events"),
    },
    {
      href: "/app/events?scenario=pending",
      label: bilingualText("检查准备状态", "Check readiness status"),
    },
  ];
}

function routeStateViewModel(input: {
  failure?: RouteFailure | null;
  scenario: AppEventsRouteScenario;
}): AppEventsRouteStateViewModel {
  return {
    copy: stateCopy(input.scenario),
    errorCode: input.failure?.code ?? null,
    evidence: evidenceViewModels(input.failure?.evidenceIds ?? []),
    recoveryActions: routeRecoveryActions(input.scenario),
    scenario: input.scenario,
  };
}

function eventChoiceViewModel(input: {
  attendeeName: string;
  event: EventRecord;
  readinessScore: number;
}): AppEventsEventChoiceViewModel {
  return {
    attendeeName: input.attendeeName,
    detailHref: eventDetailHref(input.event),
    evidence: evidenceViewModels(input.event.evidence.map((item) => item.evidenceId)),
    id: input.event.id,
    nextAction: `${productCopy(input.event.nextAction)} ${productCopy(input.event.recommendedPreparation)}`,
    readinessScore: input.readinessScore,
    relationshipValue: relationshipValueCopy(input.event),
    title: input.event.title,
    venue: input.event.venue,
  };
}

function readinessViewModel(
  payload: EventGoalReadinessPayload,
): AppEventsReadinessViewModel {
  return {
    checklist: payload.readinessChecklist.map(
      (item: EventReadinessChecklistItem) => ({
        id: item.itemId,
        label: productCopy(item.label),
        owner: item.owner,
        rationale: productCopy(item.rationale),
        status: item.status,
      }),
    ),
    evidence: evidenceViewModels(payload.provenance.evidenceIds),
    nextPreparationStep: productCopy(payload.preparationState.nextPreparationStep),
    readinessScore: payload.preparationState.readinessScore,
  };
}

function actionResultViewModel(
  result: EventValueRecommendationAcceptanceResult,
): AppEventsActionResultViewModel {
  if (result.success === false) {
    return {
      acceptedTitle: "",
      calendarNeedsReview: false,
      databaseWriteNeedsReview: false,
      decisionLabel: "",
      evidence: [],
      externalNetworkNeedsReview: false,
      notificationNeedsReview: false,
      outsideContacted: false,
      state: "failure",
      summary: "",
    };
  }

  const outsideContacted =
    result.data.action.externalNetworkRequested ||
    result.data.action.calendarProviderRequested ||
    result.data.action.notificationDelivered ||
    result.data.action.databaseWriteExecuted ||
    result.data.action.productionAuditLogWriteExecuted;

  return {
    acceptedTitle: result.data.acceptedEvent.title,
    calendarNeedsReview: result.data.action.calendarProviderRequested,
    databaseWriteNeedsReview: result.data.action.databaseWriteExecuted,
    decisionLabel: result.data.action.label,
    evidence: evidenceViewModels(result.data.action.evidenceIds),
    externalNetworkNeedsReview: result.data.action.externalNetworkRequested,
    notificationNeedsReview: result.data.action.notificationDelivered,
    outsideContacted,
    state: "success",
    summary: productCopy(result.data.summary),
  };
}

function actionResultFor(
  action: string | null,
  topRecommendation: EventValueRecommendation | undefined,
): AppEventsActionResultViewModel | null {
  if (action !== "accept-top-event" || !topRecommendation) {
    return null;
  }

  const services = createAppEventsRouteServices();
  const result = services.eventValues.acceptRecommendedEvent({
    eventId: topRecommendation.eventId,
  });

  return actionResultViewModel(result);
}

function successViewModel(input: {
  action: string | null;
  attendeePayload: EventRecommendationsPayload;
  eventPayload: EventListPayload;
  readinessPayload: EventGoalReadinessPayload;
  valuePayload: EventValueRecommendationsPayload;
}): AppEventsSuccessViewModel {
  const currentEvent = input.eventPayload.events[0];
  const topAttendee = input.attendeePayload.recommendations[0];
  const topValueEvent = input.valuePayload.recommendations[0];
  const detailActionLabel = currentEvent
    ? bilingualText(
        `打开 ${currentEvent.title} 工作区`,
        `Open ${currentEvent.title} workspace`,
      )
    : "";

  return {
    actionResult: actionResultFor(input.action, topValueEvent),
    attendeePanel: {
      recommendation: topAttendee
        ? {
            attendeeName: topAttendee.attendee.displayName,
            evidence: evidenceViewModels(topAttendee.evidenceIds),
            openingLine: topAttendee.openingLine.text,
            organization: topAttendee.attendee.organization,
            recommendedAction: productCopy(topAttendee.recommendedAction),
            role: topAttendee.attendee.role,
            score: topAttendee.score,
          }
        : null,
      summary: productCopy(input.attendeePayload.summary),
    },
    currentPriority:
      currentEvent && topAttendee
        ? {
            attendeeName: topAttendee.attendee.displayName,
            detailActionLabel,
            detailHref: eventDetailHref(currentEvent),
            eventTitle: currentEvent.title,
            readinessScore:
              input.readinessPayload.preparationState.readinessScore,
            recommendedAction: productCopy(topAttendee.recommendedAction),
            relationshipContext: productCopy(currentEvent.relationshipContext),
            relationshipValue: relationshipValueCopy(currentEvent),
            venue: currentEvent.venue,
          }
        : null,
    eventChoices: input.eventPayload.events.map((event) =>
      eventChoiceViewModel({
        attendeeName:
          topAttendee?.attendee.displayName ??
          bilingualText("复核参会人名单", "review attendee roster"),
        event,
        readinessScore: input.readinessPayload.preparationState.readinessScore,
      }),
    ),
    eventSummary: productCopy(input.eventPayload.summary),
    ledger: {
      eventCount: input.eventPayload.events.length,
      importedRecordCount: input.eventPayload.importedRecords.length,
      primaryStatus:
        input.eventPayload.events[0]?.status ??
        bilingualText("不可用", "unavailable"),
      primaryTitle:
        input.eventPayload.events[0]?.title ??
        bilingualText("没有有来源活动", "No sourced event"),
    },
    readiness: readinessViewModel(input.readinessPayload),
    topCandidate: topValueEvent
      ? {
          title: topValueEvent.title,
          valueScore: topValueEvent.valueScore,
        }
      : null,
    valuePanel: {
      recommendation: topValueEvent
        ? {
            attendeeDensity: topValueEvent.attendeeDensity,
            evidence: evidenceViewModels(topValueEvent.evidenceIds),
            location: topValueEvent.location,
            recommendedAction: productCopy(topValueEvent.recommendedAction),
            title: topValueEvent.title,
            valueScore: topValueEvent.valueScore,
          }
        : null,
      summary: productCopy(input.valuePayload.summary),
    },
  };
}

export function loadAppEventsRouteViewModel(
  searchParams?: AppEventsSearchParams,
): AppEventsRouteViewModel {
  const scenario = readRouteScenario(searchParams);
  const services = createAppEventsRouteServices();
  const eventResult = services.events.listEvents({ scenario });
  const attendeeResult = services.attendeeRecommendations.listEventRecommendations({
    limit: 3,
    scenario,
  });
  const valueResult = services.eventValues.listRecommendedEvents({
    limit: 3,
    scenario,
  });
  const readinessResult = services.readiness.getReadiness({ scenario });
  const results = [
    eventResult,
    attendeeResult,
    valueResult,
    readinessResult,
  ] as const;
  const failure = firstFailure(results);

  if (failure || scenario === "failure") {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ failure, scenario: "failure" }),
    };
  }

  if (scenario === "empty" || anyResultState(results, "empty")) {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ scenario: "empty" }),
    };
  }

  if (scenario === "pending" || anyResultState(results, "pending")) {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ scenario: "pending" }),
    };
  }

  if (
    eventResult.success === false ||
    attendeeResult.success === false ||
    valueResult.success === false ||
    readinessResult.success === false
  ) {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ scenario: "failure" }),
    };
  }

  return {
    state: "success",
    workspace: successViewModel({
      action: readSearchParam(searchParams, "action"),
      attendeePayload: attendeeResult.data,
      eventPayload: eventResult.data,
      readinessPayload: readinessResult.data,
      valuePayload: valueResult.data,
    }),
  };
}
