import type {
  EventListPayload,
  EventListResult,
  EventRecord,
} from "../../../../../features/events/event-crud-and-import/contract";
import type {
  EventGoalReadinessPayload,
  EventGoalReadinessResult,
  EventReadinessChecklistItem,
} from "../../../../../features/events/goal-readiness/contract";
import type {
  EventRecommendationsPayload,
  EventRecommendationsResult,
} from "../../../../../features/recommendations/contract";
import type {
  EventValueRecommendationsPayload,
  EventValueRecommendationsResult,
} from "../../../../../features/recommendations/event-value-contract";
import {
  createAppEventsRouteServices,
  type AppEventsRouteServices,
} from "./events-service-factory";

import { ORBIT_DEFAULT_LANGUAGE, type OrbitLanguage } from "../../orbit-language-core";

export type AppEventsRouteScenario = "empty" | "pending" | "failure";
export interface AppEventsRouteControls {
  /** Page language for the copy below; defaults to the product default (ja). */
  language?: OrbitLanguage;
  scenario?: AppEventsRouteScenario;
}

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
  readinessScore: number | null;
  recommendedAction: string;
  relationshipValue: string;
  venue: string;
  relationshipContext: string;
}

export interface AppEventsEventChoiceViewModel {
  attendeeName: string;
  canonicalEventId?: string;
  detailHref: string;
  endsAt: string;
  evidence: readonly AppEventsEvidenceViewModel[];
  id: string;
  nextAction: string;
  readinessScore: number | null;
  relationshipValue: string;
  startsAt: string;
  status: EventRecord["status"];
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

export interface AppEventsSuccessViewModel {
  attendeePanel: {
    recommendation: AppEventsAttendeeRecommendationViewModel | null;
    summary: string;
  };
  currentPriority: AppEventsCurrentPriorityViewModel | null;
  eventChoices: readonly AppEventsEventChoiceViewModel[];
  eventSummary: string;
  ledger: AppEventsLedgerViewModel;
  readiness: AppEventsReadinessViewModel | null;
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

type RouteCopy = { ja: string; zh: string; en: string };

function localized(language: OrbitLanguage, copy: RouteCopy): string {
  return copy[language];
}

function firstFailure(results: readonly RouteResult[]): RouteFailure | null {
  for (const result of results) {
    if (result.success === false) {
      return result.error;
    }
  }

  return null;
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

function evidenceLabel(
  evidenceId: string,
  language: OrbitLanguage = ORBIT_DEFAULT_LANGUAGE,
): string {
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

  return localized(language, {
    ja: `根拠: ${englishLabel}`,
    zh: `证据：${englishLabel}`,
    en: englishLabel,
  });
}

function evidenceViewModels(
  evidenceIds: readonly string[],
  language: OrbitLanguage = ORBIT_DEFAULT_LANGUAGE,
): AppEventsEvidenceViewModel[] {
  return Array.from(new Set(evidenceIds)).map((id) => ({
    id,
    label: evidenceLabel(id, language),
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

const STATE_COPY: Record<AppEventsRouteScenario, Record<"description" | "emptyState" | "guardrail" | "nextStep" | "purpose" | "title", RouteCopy>> = {
  empty: {
    description: {
      ja: "出典のあるイベントを作成または取り込んでから、おすすめと準備状況を確認します。",
      zh: "先创建或导入有来源的活动，再复核推荐和准备度。",
      en: "Create or import a sourced event before reviewing recommendations and readiness.",
    },
    emptyState: {
      ja: "まだイベント、おすすめ、参加者のおすすめ、準備記録がありません。",
      zh: "还没有活动、价值推荐、参会人推荐或准备记录可用。",
      en: "No event, value recommendation, attendee recommendation, or readiness record is ready.",
    },
    guardrail: {
      ja: "この画面からカレンダーの更新、記録の保存、主催者への連絡、メッセージ送信、通知は行いません。",
      zh: "此屏幕不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
      en: "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone from this screen.",
    },
    nextStep: {
      ja: "出典のあるイベントに戻るか、所定の手順でイベントを追加してください。",
      zh: "返回有来源活动，或通过已批准的活动流程添加活动。",
      en: "Return to sourced events or add an event through the approved event workflow.",
    },
    purpose: {
      ja: "出典が揃ってから、イベントの準備を表示します。",
      zh: "仅在来源证据存在后展示活动准备。",
      en: "Show event preparation only after source evidence exists.",
    },
    title: { ja: "表示できるイベントがありません", zh: "没有可用活动背景", en: "No event context is ready" },
  },
  pending: {
    description: {
      ja: "イベントの出典、おすすめの条件、準備チェックを用意しています。",
      zh: "活动来源、推荐规则和准备检查仍在准备中。",
      en: "Event sources, recommendation rules, and readiness checks are still being prepared.",
    },
    emptyState: {
      ja: "出典の確認が終わるまで、イベントの準備は表示しません。",
      zh: "当前来源复核完成前，活动准备会保持隐藏。",
      en: "Event preparation stays hidden until the current source review finishes.",
    },
    guardrail: {
      ja: "確認中は、カレンダーの更新、記録の保存、主催者への連絡、メッセージ送信、通知は行いません。",
      zh: "复核待处理期间，不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
      en: "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while review is pending.",
    },
    nextStep: {
      ja: "出典の確認が終わったら、準備済みのイベントに戻ってください。",
      zh: "来源复核完成后返回已准备活动。",
      en: "Return to ready events after the source review completes.",
    },
    purpose: {
      ja: "準備データの読み込み中も、画面が崩れないようにします。",
      zh: "活动准备数据仍在加载时，保持工作区稳定。",
      en: "Keep the workspace stable while event preparation data is still loading.",
    },
    title: { ja: "イベントを読み込み中", zh: "活动背景加载中", en: "Event context is loading" },
  },
  failure: {
    description: {
      ja: "イベントの出典を読み込めないため、おすすめと準備状況を止めています。",
      zh: "活动来源无法加载，因此推荐和准备状态已暂停。",
      en: "Event sources could not be loaded, so recommendations and readiness are paused.",
    },
    emptyState: {
      ja: "出典が戻るまで、イベントの概要は表示できません。",
      zh: "活动简报会在活动来源恢复前保持不可用。",
      en: "The event briefing is unavailable until event sources recover.",
    },
    guardrail: {
      ja: "利用できない間は、カレンダーの更新、記録の保存、主催者への連絡、メッセージ送信、通知は行いません。",
      zh: "不可用期间，不会更新日历、保存记录、联系活动来源、发送消息或通知任何人。",
      en: "Nothing will update calendars, save records, contact event sources, send messages, or notify anyone while this is unavailable.",
    },
    nextStep: {
      ja: "操作の前に、イベントを再読み込みするか準備状況を確認してください。",
      zh: "采取动作前，重新加载活动或检查准备状态。",
      en: "Reload events or check readiness status before taking action.",
    },
    purpose: {
      ja: "出典のあるイベント情報が使えないときは、復旧の手順を示します。",
      zh: "当有来源支撑的活动背景不可用时，展示可见恢复路径。",
      en: "Show a visible recovery path when source-backed event context is unavailable.",
    },
    title: { ja: "イベントを読み込めませんでした", zh: "活动无法加载", en: "Events could not load" },
  },
};

function stateCopy(scenario: AppEventsRouteScenario, language: OrbitLanguage) {
  const copy = STATE_COPY[scenario];

  return {
    description: localized(language, copy.description),
    emptyState: localized(language, copy.emptyState),
    guardrail: localized(language, copy.guardrail),
    nextStep: localized(language, copy.nextStep),
    purpose: localized(language, copy.purpose),
    title: localized(language, copy.title),
  };
}

function routeRecoveryActions(
  scenario: AppEventsRouteScenario,
  language: OrbitLanguage,
): readonly { href: string; label: string }[] {
  if (scenario === "empty") {
    return [
      {
        href: "/app/events",
        label: localized(language, { ja: "出典のあるイベントを表示", zh: "显示有来源活动", en: "Show sourced events" }),
      },
    ];
  }

  if (scenario === "pending") {
    return [
      {
        href: "/app/events",
        label: localized(language, { ja: "準備済みのイベントに戻る", zh: "返回已准备活动", en: "Return to ready events" }),
      },
    ];
  }

  return [
    {
      href: "/app/events",
      label: localized(language, { ja: "イベントを再読み込み", zh: "重新加载活动", en: "Reload events" }),
    },
    {
      href: "/app/settings",
      label: localized(language, { ja: "イベント設定を確認", zh: "检查活动设置", en: "Check event settings" }),
    },
  ];
}

function routeStateViewModel(input: {
  failure?: RouteFailure | null;
  language: OrbitLanguage;
  scenario: AppEventsRouteScenario;
}): AppEventsRouteStateViewModel {
  return {
    copy: stateCopy(input.scenario, input.language),
    errorCode: input.failure?.code ?? null,
    evidence: evidenceViewModels(input.failure?.evidenceIds ?? [], input.language),
    recoveryActions: routeRecoveryActions(input.scenario, input.language),
    scenario: input.scenario,
  };
}

function eventChoiceViewModel(input: {
  attendeeName: string;
  event: EventRecord;
  readinessScore: number | null;
}): AppEventsEventChoiceViewModel {
  return {
    attendeeName: input.attendeeName,
    canonicalEventId:
      input.event.sourceMetadata.provider === "event-core-postgres"
        ? input.event.sourceMetadata.providerRecordId
        : undefined,
    detailHref: eventDetailHref(input.event),
    evidence: evidenceViewModels(input.event.evidence.map((item) => item.evidenceId)),
    endsAt: input.event.endsAt,
    id: input.event.id,
    nextAction: `${productCopy(input.event.nextAction)} ${productCopy(input.event.recommendedPreparation)}`,
    readinessScore: input.readinessScore,
    relationshipValue: relationshipValueCopy(input.event),
    startsAt: input.event.startsAt,
    status: input.event.status,
    title: input.event.title,
    venue: input.event.venue,
  };
}

function readinessViewModel(
  payload: EventGoalReadinessPayload,
  language: OrbitLanguage,
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
    evidence: evidenceViewModels(payload.provenance.evidenceIds, language),
    nextPreparationStep: productCopy(payload.preparationState.nextPreparationStep),
    readinessScore: payload.preparationState.readinessScore,
  };
}

function successViewModel(input: {
  attendeePayload: EventRecommendationsPayload | null;
  eventPayload: EventListPayload;
  language: OrbitLanguage;
  primaryEventId: string;
  readinessPayload: EventGoalReadinessPayload | null;
  valuePayload: EventValueRecommendationsPayload | null;
}): AppEventsSuccessViewModel {
  const actorEventIds = new Set(
    input.eventPayload.events.map((event) => event.id),
  );
  const currentEvent = input.eventPayload.events.find(
    (event) => event.id === input.primaryEventId,
  );
  const topAttendee =
    input.attendeePayload?.event.id === input.primaryEventId
      ? input.attendeePayload.recommendations.find(
          (recommendation) =>
            recommendation.eventId === input.primaryEventId,
        )
      : undefined;
  const topValueEvent = input.valuePayload?.recommendations.find(
    (recommendation) => actorEventIds.has(recommendation.eventId),
  );
  const readinessPayload =
    input.readinessPayload?.event.id === input.primaryEventId
      ? input.readinessPayload
      : null;
  const detailActionLabel = currentEvent
    ? localized(input.language, {
        ja: `${currentEvent.title} を開く`,
        zh: `打开 ${currentEvent.title} 工作区`,
        en: `Open ${currentEvent.title} workspace`,
      })
    : "";

  return {
    attendeePanel: {
      recommendation: topAttendee
        ? {
            attendeeName: topAttendee.attendee.displayName,
            evidence: evidenceViewModels(topAttendee.evidenceIds, input.language),
            openingLine: topAttendee.openingLine.text,
            organization: topAttendee.attendee.organization,
            recommendedAction: productCopy(topAttendee.recommendedAction),
            role: topAttendee.attendee.role,
            score: topAttendee.score,
          }
        : null,
      summary: input.attendeePayload
        ? productCopy(input.attendeePayload.summary)
        : localized(input.language, {
            ja: "このイベントでおすすめできる参加者はまだいません。",
            zh: "当前活动暂无可用参会人推荐。",
            en: "No attendee recommendation is available for this event.",
          }),
    },
    currentPriority:
      currentEvent && topAttendee
        ? {
            attendeeName: topAttendee.attendee.displayName,
            detailActionLabel,
            detailHref: eventDetailHref(currentEvent),
            eventTitle: currentEvent.title,
            readinessScore:
              readinessPayload?.preparationState.readinessScore ?? null,
            recommendedAction: productCopy(topAttendee.recommendedAction),
            relationshipContext: productCopy(currentEvent.relationshipContext),
            relationshipValue: relationshipValueCopy(currentEvent),
            venue: currentEvent.venue,
          }
        : null,
    eventChoices: input.eventPayload.events.map((event) =>
      eventChoiceViewModel({
        attendeeName:
          event.id === input.primaryEventId && topAttendee
            ? topAttendee.attendee.displayName
            : localized(input.language, { ja: "参加者名簿を確認", zh: "复核参会人名单", en: "review attendee roster" }),
        event,
        readinessScore:
          event.id === input.primaryEventId
            ? readinessPayload?.preparationState.readinessScore ?? null
            : null,
      }),
    ),
    eventSummary: productCopy(input.eventPayload.summary),
    ledger: {
      eventCount: input.eventPayload.events.length,
      importedRecordCount: input.eventPayload.importedRecords.length,
      primaryStatus:
        currentEvent?.status ??
        localized(input.language, { ja: "利用不可", zh: "不可用", en: "unavailable" }),
      primaryTitle:
        currentEvent?.title ??
        localized(input.language, { ja: "出典のあるイベントはありません", zh: "没有有来源活动", en: "No sourced event" }),
    },
    readiness: readinessPayload
      ? readinessViewModel(readinessPayload, input.language)
      : null,
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
            evidence: evidenceViewModels(topValueEvent.evidenceIds, input.language),
            location: topValueEvent.location,
            recommendedAction: productCopy(topValueEvent.recommendedAction),
            title: topValueEvent.title,
            valueScore: topValueEvent.valueScore,
          }
        : null,
      summary: input.valuePayload
        ? productCopy(input.valuePayload.summary)
        : localized(input.language, {
            ja: "このアカウントでおすすめできるイベントはまだありません。",
            zh: "当前账户暂无可用活动价值推荐。",
            en: "No event value recommendation is available for this account.",
          }),
    },
  };
}

export async function loadAppEventsRouteViewModel(
  actorId?: string | null,
  controls: AppEventsRouteControls = {},
  services: AppEventsRouteServices = createAppEventsRouteServices({ actorId }),
): Promise<AppEventsRouteViewModel> {
  const scenario = controls.scenario ?? null;
  const language = controls.language ?? ORBIT_DEFAULT_LANGUAGE;
  const eventResult = await services.events.listEvents({ actorId, scenario });
  const eventFailure = firstFailure([eventResult]);

  if (eventFailure || scenario === "failure") {
    return {
      state: "route-state",
      routeState: routeStateViewModel({
        failure: eventFailure,
        language,
        scenario: "failure",
      }),
    };
  }

  if (eventResult.success === false) {
    return {
      state: "route-state",
      routeState: routeStateViewModel({
        failure: eventResult.error,
        language,
        scenario: "failure",
      }),
    };
  }

  if (scenario === "empty" || eventResult.data.state === "empty") {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ language, scenario: "empty" }),
    };
  }

  if (scenario === "pending" || eventResult.data.state === "pending") {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ language, scenario: "pending" }),
    };
  }

  const valueResult = await services.eventValues.listRecommendedEvents({
    limit: 3,
    scenario,
  });
  const actorEventIds = new Set(
    eventResult.data.events.map((event) => event.id),
  );
  const valuePayload =
    valueResult.success === true && valueResult.data.state === "success"
      ? {
          ...valueResult.data,
          recommendations: valueResult.data.recommendations.filter(
            (recommendation) => actorEventIds.has(recommendation.eventId),
          ),
        }
      : null;
  const primaryEventId =
    valuePayload?.recommendations[0]?.eventId ??
    eventResult.data.events[0]?.id;

  if (!primaryEventId) {
    return {
      state: "route-state",
      routeState: routeStateViewModel({ language, scenario: "empty" }),
    };
  }

  const [attendeeResult, readinessResult] = await Promise.all([
    services.attendeeRecommendations.listEventRecommendations({
      eventId: primaryEventId,
      limit: 3,
      scenario,
    }),
    services.readiness.getReadiness({ eventId: primaryEventId, scenario }),
  ]);
  const attendeePayload =
    attendeeResult.success === true &&
    attendeeResult.data.state === "success" &&
    attendeeResult.data.event.id === primaryEventId
      ? attendeeResult.data
      : null;
  const readinessPayload =
    readinessResult.success === true &&
    readinessResult.data.state === "success" &&
    readinessResult.data.event.id === primaryEventId
      ? readinessResult.data
      : null;

  return {
    state: "success",
    workspace: successViewModel({
      attendeePayload,
      eventPayload: eventResult.data,
      language,
      primaryEventId,
      readinessPayload,
      valuePayload,
    }),
  };
}
