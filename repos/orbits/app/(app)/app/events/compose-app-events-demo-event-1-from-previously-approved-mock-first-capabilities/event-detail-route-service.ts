/**
 * 活动详情页的 route-level 聚合服务。
 *
 * 这个文件把活动详情、参会者名单、推荐、readiness、want-to-connect、
 * encounter note 和 post-event review 多个 capability service 组合成一个页面模型。
 * route 层只聚合和做一致性检查，不写真实日历、数据库、通知或外部消息。
 */
import { createEventAttendeeRosterService } from "../../../../../features/events/service-factory";
import type {
  EventAttendeeRosterPayload,
  EventAttendeeRosterService,
} from "../../../../../features/events/attendee-contract";
import { createEventCrudAndImportService } from "../../../../../features/events/service-factory";
import type { EventDetailPayload } from "../../../../../features/events/contract";
import type { EventCrudAndImportService } from "../../../../../features/events/service";
import { createEventEncounterNoteService } from "../../../../../features/events/service-factory";
import type {
  EventEncounterNotePayload,
  EventEncounterNoteService,
} from "../../../../../features/events/encounter-contract";
import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";
import type {
  EventGoalAndReadinessService,
  EventGoalReadinessPayload,
} from "../../../../../features/events/goal-contract";
import { createPostEventContactReviewService } from "../../../../../features/events/service-factory";
import type {
  PostEventContactReviewService,
  PostEventReviewPayload,
} from "../../../../../features/events/post-event-contract";
import { createWantConnectService } from "../../../../../features/events/service-factory";
import type {
  WantConnectMatchesPayload,
  WantConnectPayload,
  WantConnectResult,
  WantConnectService,
} from "../../../../../features/events/want-connect-contract";
import { createEventRecommendationService } from "../../../../../features/recommendations/service-factory";
import type {
  EventOpeningLinePayload,
  EventRecommendationsPayload,
} from "../../../../../features/recommendations/contract";
import type { EventRecommendationService } from "../../../../../features/recommendations/service";
import {
  createModuleServiceFactory,
  type ModuleMode,
} from "../../../../../shared/services/module-mode";

export const APP_EVENT_DETAIL_EVENT_ID = "demo-event-1";
export const APP_EVENT_DETAIL_COMPOSED_CAPABILITIES = [
  // 页面宣称组合了哪些 capability，便于测试和 UI 解释执行链。
  "attendee-roster",
  "event-goal",
  "event-readiness",
  "event-recommendations",
  "opening-line",
  "want-to-connect",
  "encounter-notes",
  "post-event-review",
] as const;

const defaultWantConnectTargetContactId = "contact:priya-shah";

export type AppEventDetailRouteScenario = "empty" | "pending" | "failure";
export type AppEventDetailRouteAction = "want-to-connect";
export type AppEventDetailRouteState =
  | "success"
  | "empty"
  | "pending"
  | "failure";

export interface AppEventDetailRouteInput {
  action?: string | null;
  eventId: string;
  mode?: ModuleMode | string;
  scenario?: string | null;
  targetContactId?: string | null;
}

export interface AppEventDetailActionResult {
  calendarUpdateExecuted: false;
  databaseWriteExecuted: false;
  evidenceId: string;
  externalMessageSent: false;
  externalNetworkRequested: false;
  matchTitle: string;
  notificationDelivered: false;
  peerNotificationDelivered: false;
  realtimePresenceRequested: false;
  sideEffectsLabel: "none";
  targetDisplayName: string;
}

export interface AppEventDetailCanonicalEvent {
  endsAt: string;
  evidenceIds: readonly string[];
  id: string;
  sourceLabel: string;
  startsAt: string;
  title: string;
  venue: string;
}

export interface AppEventDetailSourceConsistency {
  apiEvidenceContradictionCount: number;
  apiEvidenceSummary: string;
  apiEvidenceSurfaceCount: number;
  checkedSourceCount: number;
  displaySummary: string;
  evidenceIds: readonly string[];
  reconciledSourceCount: number;
}

export interface AppEventDetailSuccessModel {
  actionResult: AppEventDetailActionResult | null;
  attendeeRoster: EventAttendeeRosterPayload;
  canonicalEvent: AppEventDetailCanonicalEvent;
  composedCapabilities: typeof APP_EVENT_DETAIL_COMPOSED_CAPABILITIES;
  encounterNote: EventEncounterNotePayload;
  eventDetail: EventDetailPayload;
  openingLine: EventOpeningLinePayload;
  postEventReview: PostEventReviewPayload;
  readiness: EventGoalReadinessPayload;
  recommendations: EventRecommendationsPayload;
  routeState: "success";
  sourceConsistency: AppEventDetailSourceConsistency;
  wantConnectMatches: WantConnectMatchesPayload;
}

export interface AppEventDetailBoundaryModel {
  description: string;
  evidence: readonly string[];
  nextStep: string;
  recoveryActions: readonly {
    href: string;
    label: string;
  }[];
  routeState: Exclude<AppEventDetailRouteState, "success">;
  title: string;
}

export type AppEventDetailRouteModel =
  | AppEventDetailSuccessModel
  | AppEventDetailBoundaryModel;

interface AppEventDetailRouteServices {
  attendeeRoster: EventAttendeeRosterService;
  encounterNotes: EventEncounterNoteService;
  events: EventCrudAndImportService;
  postEventReview: PostEventContactReviewService;
  readiness: EventGoalAndReadinessService;
  recommendations: EventRecommendationService;
  wantConnect: WantConnectService;
}

type RouteResult =
  | ReturnType<EventCrudAndImportService["getEvent"]>
  | ReturnType<EventAttendeeRosterService["getAttendeeRoster"]>
  | ReturnType<EventRecommendationService["listEventRecommendations"]>
  | ReturnType<EventGoalAndReadinessService["getReadiness"]>
  | ReturnType<WantConnectService["listMatches"]>
  | ReturnType<EventEncounterNoteService["createEncounterNote"]>
  | ReturnType<PostEventContactReviewService["getPostEventReview"]>;

const eventDetailServiceFactory =
  createModuleServiceFactory<EventCrudAndImportService>({
    capabilityId: "app-events-demo-event-1.event-detail",
    implementations: {
      mock: () => createEventCrudAndImportService(),
    },
  });

const attendeeRosterServiceFactory =
  createModuleServiceFactory<EventAttendeeRosterService>({
    capabilityId: "app-events-demo-event-1.attendee-roster",
    implementations: {
      mock: () => createEventAttendeeRosterService(),
    },
  });

const recommendationServiceFactory =
  createModuleServiceFactory<EventRecommendationService>({
    capabilityId: "app-events-demo-event-1.event-recommendations",
    implementations: {
      mock: () => createEventRecommendationService(),
    },
  });

const readinessServiceFactory =
  createModuleServiceFactory<EventGoalAndReadinessService>({
    capabilityId: "app-events-demo-event-1.goal-readiness",
    implementations: {
      mock: () => createEventGoalAndReadinessService(),
    },
  });

const wantConnectServiceFactory =
  createModuleServiceFactory<WantConnectService>({
    capabilityId: "app-events-demo-event-1.want-connect",
    implementations: {
      mock: () => createWantConnectService(),
    },
  });

const encounterNoteServiceFactory =
  createModuleServiceFactory<EventEncounterNoteService>({
    capabilityId: "app-events-demo-event-1.encounter-notes",
    implementations: {
      mock: () => createEventEncounterNoteService(),
    },
  });

const postEventReviewServiceFactory =
  createModuleServiceFactory<PostEventContactReviewService>({
    capabilityId: "app-events-demo-event-1.post-event-review",
    implementations: {
      mock: () => createPostEventContactReviewService(),
    },
  });

const routeBoundaryCopy = {
  // 统一维护 event detail 的空、失败、pending 边界文案和恢复动作。
  empty: {
    description:
      "Choose an event with an approved roster before reviewing people, lines, notes, or post-event contacts.",
    evidence: ["event-detail-empty", "event-roster-empty"],
    nextStep: "Return to events and choose an event with source-backed attendee context.",
    recoveryActions: [
      {
        href: "/app/events",
        label: "Return to events",
      },
      {
        href: "/app/events/demo-event-1",
        label: "Open demo event",
      },
    ],
    title: "No event workspace is ready",
  },
  failure: {
    description:
      "Orbit could not load relationship context for this event.",
    evidence: ["event-detail-failure"],
    nextStep:
      "Retry the event after confirming the source-backed capabilities are available.",
    recoveryActions: [
      {
        href: "/app/events/demo-event-1",
        label: "Retry event",
      },
      {
        href: "/app/events",
        label: "Return to events",
      },
    ],
    title: "Event workspace could not load",
  },
  pending: {
    description:
      "Roster access and preparation signals are still waiting for review.",
    evidence: ["event-detail-pending", "event-roster-pending"],
    nextStep: "Check the event once attendee access and preparation signals settle.",
    recoveryActions: [
      {
        href: "/app/events/demo-event-1",
        label: "Check current event",
      },
      {
        href: "/app/events",
        label: "Return to events",
      },
    ],
    title: "Event workspace is loading",
  },
} as const satisfies Record<
  Exclude<AppEventDetailRouteState, "success">,
  Omit<AppEventDetailBoundaryModel, "routeState">
>;

function normalizeScenario(
  scenario?: string | null,
): AppEventDetailRouteScenario | null {
  // scenario 是调试/测试开关；未知值不会传给下游服务。
  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function normalizeAction(action?: string | null): AppEventDetailRouteAction | null {
  // `record-intent` 是历史动作名，当前统一映射到 want-to-connect 本地意图。
  if (action === "want-to-connect" || action === "record-intent") {
    return "want-to-connect";
  }

  return null;
}

function createBoundaryModel(
  routeState: Exclude<AppEventDetailRouteState, "success">,
  evidence: readonly string[] = routeBoundaryCopy[routeState].evidence,
): AppEventDetailBoundaryModel {
  return {
    ...routeBoundaryCopy[routeState],
    evidence,
    routeState,
  };
}

function resolveRouteServices(
  mode?: ModuleMode | string,
): AppEventDetailRouteServices | AppEventDetailBoundaryModel {
  // 每个 capability 都通过 module factory 解析；任一解析失败就返回 route failure。
  const events = eventDetailServiceFactory.create(mode);

  if (events.success === false) {
    return createBoundaryModel("failure", [events.error.code]);
  }

  const attendeeRoster = attendeeRosterServiceFactory.create(mode);

  if (attendeeRoster.success === false) {
    return createBoundaryModel("failure", [attendeeRoster.error.code]);
  }

  const recommendations = recommendationServiceFactory.create(mode);

  if (recommendations.success === false) {
    return createBoundaryModel("failure", [recommendations.error.code]);
  }

  const readiness = readinessServiceFactory.create(mode);

  if (readiness.success === false) {
    return createBoundaryModel("failure", [readiness.error.code]);
  }

  const wantConnect = wantConnectServiceFactory.create(mode);

  if (wantConnect.success === false) {
    return createBoundaryModel("failure", [wantConnect.error.code]);
  }

  const encounterNotes = encounterNoteServiceFactory.create(mode);

  if (encounterNotes.success === false) {
    return createBoundaryModel("failure", [encounterNotes.error.code]);
  }

  const postEventReview = postEventReviewServiceFactory.create(mode);

  if (postEventReview.success === false) {
    return createBoundaryModel("failure", [postEventReview.error.code]);
  }

  return {
    attendeeRoster: attendeeRoster.service,
    encounterNotes: encounterNotes.service,
    events: events.service,
    postEventReview: postEventReview.service,
    readiness: readiness.service,
    recommendations: recommendations.service,
    wantConnect: wantConnect.service,
  };
}

function isBoundaryModel(
  value: AppEventDetailRouteServices | AppEventDetailBoundaryModel,
): value is AppEventDetailBoundaryModel {
  return "routeState" in value;
}

function collectFailureEvidence(results: readonly RouteResult[]): string[] {
  // 多个 capability 可能同时失败，这里合并错误证据并去重。
  return Array.from(
    new Set(
      results.flatMap((result) =>
        result.success === false ? result.error.evidenceIds : [],
      ),
    ),
  );
}

function hasResultState(
  results: readonly RouteResult[],
  state: "empty" | "pending",
): boolean {
  return results.some(
    (result) => result.success === true && result.data.state === state,
  );
}

function hasEmptySuccessPayloads(
  attendeeRoster: EventAttendeeRosterPayload,
  recommendations: EventRecommendationsPayload,
  readiness: EventGoalReadinessPayload,
  postEventReview: PostEventReviewPayload,
): boolean {
  // 有些 service 成功返回但内容为空；页面需要把这种组合结果视为 empty route。
  return (
    attendeeRoster.attendees.length === 0 ||
    recommendations.recommendations.length === 0 ||
    readiness.goal === null ||
    postEventReview.contacts.length === 0
  );
}

function targetDisplayName(
  payload: WantConnectPayload,
): string {
  const targetContactId =
    payload.intent?.targetContactId ?? defaultWantConnectTargetContactId;
  const participant = payload.participants.find(
    (item) => item.contactId === targetContactId,
  );

  return participant?.displayName ?? "selected attendee";
}

function hasOutsideSideEffects(payload: WantConnectPayload): boolean {
  // want-to-connect action 必须保持 no-op；只要发现外部副作用标记，就拒绝展示 actionResult。
  return (
    payload.provenance.externalNetworkRequested ||
    payload.provenance.liveDatabaseWriteExecuted ||
    Boolean(payload.intent?.realtimePresenceRequested) ||
    Boolean(payload.intent?.peerNotificationDelivered) ||
    Boolean(payload.intent?.externalMessageSent) ||
    Boolean(payload.matchNotice?.notificationProviderRequested) ||
    Boolean(payload.matchNotice?.peerNotificationDelivered) ||
    Boolean(payload.matchNotice?.externalMessageSent)
  );
}

function buildWantConnectActionResult(
  result: WantConnectResult,
): AppEventDetailActionResult | null {
  // 只有 create intent 成功且没有任何外部副作用时，才把本地 actionResult 展示给页面。
  if (result.success === false || result.data.intent === null) {
    return null;
  }

  const payload = result.data;
  const outsideSideEffects = hasOutsideSideEffects(payload);

  if (outsideSideEffects) {
    return null;
  }

  return {
    calendarUpdateExecuted: false,
    databaseWriteExecuted: payload.provenance.liveDatabaseWriteExecuted,
    evidenceId:
      payload.intent.evidenceIds[0] ?? payload.provenance.evidenceIds[0] ?? "",
    externalMessageSent: payload.intent.externalMessageSent,
    externalNetworkRequested: payload.provenance.externalNetworkRequested,
    matchTitle: payload.matchNotice?.title ?? "Intent recorded",
    notificationDelivered: false,
    peerNotificationDelivered: payload.intent.peerNotificationDelivered,
    realtimePresenceRequested: payload.intent.realtimePresenceRequested,
    sideEffectsLabel: "none",
    targetDisplayName: targetDisplayName(payload),
  };
}

interface RouteEventSourceDetail {
  capability: string;
  eventId: string;
  evidenceIds: readonly string[];
  startsAt: string | null;
  title: string;
  venue: string;
}

function uniqueEvidenceIds(evidenceIds: readonly string[]): string[] {
  return Array.from(new Set(evidenceIds));
}

function buildCanonicalEvent(
  eventDetail: EventDetailPayload,
): AppEventDetailCanonicalEvent {
  // 以 event detail service 为 canonical source，其他 capability 的 event 字段都向它对齐。
  const event = eventDetail.event;

  return {
    endsAt: event.endsAt,
    evidenceIds: uniqueEvidenceIds([
      ...event.evidence.map((item) => item.evidenceId),
      ...eventDetail.provenance.evidenceIds,
    ]),
    id: event.id,
    sourceLabel: event.sourceMetadata.label,
    startsAt: event.startsAt,
    title: event.title,
    venue: event.venue,
  };
}

function sameValue(left: string | null, right: string): boolean {
  return left?.trim() === right.trim();
}

function sourceUsesCanonicalEvent(
  source: RouteEventSourceDetail,
  canonicalEvent: AppEventDetailCanonicalEvent,
): boolean {
  return (
    source.eventId === canonicalEvent.id &&
    source.title === canonicalEvent.title &&
    source.venue === canonicalEvent.venue &&
    (source.startsAt === null || sameValue(source.startsAt, canonicalEvent.startsAt))
  );
}

function buildSourceConsistency(input: {
  attendeeRoster: EventAttendeeRosterPayload;
  canonicalEvent: AppEventDetailCanonicalEvent;
  encounterNote: EventEncounterNotePayload;
  postEventReview: PostEventReviewPayload;
  readiness: EventGoalReadinessPayload;
  recommendations: EventRecommendationsPayload;
  wantConnectMatches: WantConnectMatchesPayload;
}): AppEventDetailSourceConsistency {
  // 多个 capability 可能携带旧活动标题/地点/时间；这里集中检查并输出可见的 reconciliation 摘要。
  const sourceDetails: readonly RouteEventSourceDetail[] = [
    {
      capability: "attendee roster",
      eventId: input.attendeeRoster.event.id,
      evidenceIds: input.attendeeRoster.provenance.evidenceIds,
      startsAt: input.attendeeRoster.event.startsAt,
      title: input.attendeeRoster.event.name,
      venue: input.attendeeRoster.event.venue,
    },
    {
      capability: "recommendations",
      eventId: input.recommendations.event.id,
      evidenceIds: input.recommendations.provenance.evidenceIds,
      startsAt: input.recommendations.event.startsAt,
      title: input.recommendations.event.title,
      venue: input.recommendations.event.venue,
    },
    {
      capability: "readiness",
      eventId: input.readiness.event.id,
      evidenceIds: input.readiness.provenance.evidenceIds,
      startsAt: input.readiness.event.startsAt,
      title: input.readiness.event.title,
      venue: input.readiness.event.venue,
    },
    {
      capability: "want-to-connect",
      eventId: input.wantConnectMatches.event.id,
      evidenceIds: input.wantConnectMatches.provenance.evidenceIds,
      startsAt: input.wantConnectMatches.event.startsAt,
      title: input.wantConnectMatches.event.name,
      venue: input.wantConnectMatches.event.venue,
    },
    {
      capability: "encounter notes",
      eventId: input.encounterNote.event.id,
      evidenceIds: input.encounterNote.provenance.evidenceIds,
      startsAt: input.encounterNote.event.startsAt,
      title: input.encounterNote.event.name,
      venue: input.encounterNote.event.venue,
    },
    {
      capability: "post-event review",
      eventId: input.postEventReview.event.id,
      evidenceIds: input.postEventReview.provenance.evidenceIds,
      startsAt: null,
      title: input.postEventReview.event.title,
      venue: input.postEventReview.event.venue,
    },
  ];
  const reconciledSources = sourceDetails.filter(
    (source) => !sourceUsesCanonicalEvent(source, input.canonicalEvent),
  );
  const reconciledSourceNames = reconciledSources
    .map((source) => source.capability)
    .join(", ");
  const apiEvidenceSourceNames = new Set(["attendee roster", "recommendations"]);
  const apiEvidenceSurfaceCount = 3;
  const apiEvidenceContradictions = sourceDetails.filter((source) => {
    return (
      apiEvidenceSourceNames.has(source.capability) &&
      !sourceUsesCanonicalEvent(source, input.canonicalEvent)
    );
  });
  const apiEvidenceReconciledNames = apiEvidenceContradictions
    .map((source) => source.capability)
    .join(", ");
  const displaySummary =
    reconciledSources.length > 0
      ? `${reconciledSources.length} of ${sourceDetails.length} composed capability sources carry older event logistics; visible venue and time use the event detail record.`
      : "All composed capability sources already match the event detail record.";
  const apiEvidenceSummary =
    apiEvidenceContradictions.length > 0
      ? `${apiEvidenceContradictions.length} of ${apiEvidenceSurfaceCount} route API evidence surfaces carries older event logistics (${apiEvidenceReconciledNames}); visible venue and time come from the event detail API record.`
      : `All ${apiEvidenceSurfaceCount} route API evidence surfaces match the event detail API record.`;

  return {
    apiEvidenceContradictionCount: apiEvidenceContradictions.length,
    apiEvidenceSummary,
    apiEvidenceSurfaceCount,
    checkedSourceCount: sourceDetails.length,
    displaySummary:
      reconciledSourceNames.length > 0
        ? `${displaySummary} Reconciled sources: ${reconciledSourceNames}.`
        : displaySummary,
    evidenceIds: uniqueEvidenceIds([
      ...input.canonicalEvent.evidenceIds,
      ...reconciledSources.flatMap((source) => source.evidenceIds),
    ]),
    reconciledSourceCount: reconciledSources.length,
  };
}

export function loadAppEventDetailRoute({
  action,
  eventId,
  mode,
  scenario,
  targetContactId,
}: AppEventDetailRouteInput): AppEventDetailRouteModel {
  // 主入口：加载七个 capability payload，统一处理失败/空/pending，
  // 再生成 opening line、canonical event、一致性摘要和可选 no-op action result。
  const services = resolveRouteServices(mode);

  if (isBoundaryModel(services)) {
    return services;
  }

  const routeScenario = normalizeScenario(scenario);
  const eventResult = services.events.getEvent({
    eventId,
    scenario: routeScenario,
  });
  const attendeeRosterResult = services.attendeeRoster.getAttendeeRoster({
    eventId,
    scenario: routeScenario,
  });
  const recommendationResult = services.recommendations.listEventRecommendations({
    eventId,
    limit: 3,
    scenario: routeScenario,
  });
  const readinessResult = services.readiness.getReadiness({
    eventId,
    scenario: routeScenario,
  });
  const wantConnectMatchesResult = services.wantConnect.listMatches({
    eventId,
    scenario: routeScenario,
  });
  const encounterNoteResult = services.encounterNotes.createEncounterNote({
    contactId: defaultWantConnectTargetContactId,
    eventId,
    scenario: routeScenario,
  });
  const postEventReviewResult = services.postEventReview.getPostEventReview({
    eventId,
    scenario: routeScenario,
  });
  const baseResults = [
    eventResult,
    attendeeRosterResult,
    recommendationResult,
    readinessResult,
    wantConnectMatchesResult,
    encounterNoteResult,
    postEventReviewResult,
  ] as const;
  const failureEvidence = collectFailureEvidence(baseResults);

  if (failureEvidence.length > 0 || routeScenario === "failure") {
    return createBoundaryModel("failure", failureEvidence);
  }

  if (hasResultState(baseResults, "pending")) {
    return createBoundaryModel("pending");
  }

  if (
    eventResult.success === false ||
    attendeeRosterResult.success === false ||
    recommendationResult.success === false ||
    readinessResult.success === false ||
    wantConnectMatchesResult.success === false ||
    encounterNoteResult.success === false ||
    postEventReviewResult.success === false
  ) {
    return createBoundaryModel("failure");
  }

  if (
    hasResultState(baseResults, "empty") ||
    hasEmptySuccessPayloads(
      attendeeRosterResult.data,
      recommendationResult.data,
      readinessResult.data,
      postEventReviewResult.data,
    )
  ) {
    return createBoundaryModel("empty");
  }

  const topRecommendation = recommendationResult.data.recommendations[0];

  if (!topRecommendation) {
    return createBoundaryModel("empty");
  }

  const openingLineResult = services.recommendations.composeOpeningLine({
    attendeeId: topRecommendation.attendee.attendeeId,
    eventId,
    scenario: routeScenario,
    style: "warm_context",
  });

  if (openingLineResult.success === false) {
    return createBoundaryModel("failure", openingLineResult.error.evidenceIds);
  }

  const canonicalEvent = buildCanonicalEvent(eventResult.data);
  const sourceConsistency = buildSourceConsistency({
    attendeeRoster: attendeeRosterResult.data,
    canonicalEvent,
    encounterNote: encounterNoteResult.data,
    postEventReview: postEventReviewResult.data,
    readiness: readinessResult.data,
    recommendations: recommendationResult.data,
    wantConnectMatches: wantConnectMatchesResult.data,
  });
  const actionResult =
    normalizeAction(action) === "want-to-connect"
      ? buildWantConnectActionResult(
          services.wantConnect.createWantToConnectIntent({
            actorContactId: "contact:operator",
            eventId,
            targetContactId: targetContactId ?? defaultWantConnectTargetContactId,
          }),
        )
      : null;

  return {
    actionResult,
    attendeeRoster: attendeeRosterResult.data,
    canonicalEvent,
    composedCapabilities: APP_EVENT_DETAIL_COMPOSED_CAPABILITIES,
    encounterNote: encounterNoteResult.data,
    eventDetail: eventResult.data,
    openingLine: openingLineResult.data,
    postEventReview: postEventReviewResult.data,
    readiness: readinessResult.data,
    recommendations: recommendationResult.data,
    routeState: "success",
    sourceConsistency,
    wantConnectMatches: wantConnectMatchesResult.data,
  };
}
