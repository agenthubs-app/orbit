import { calendarDate } from "../../../../features/tasks/local-date-time";
import {
  loadHomeFacts,
  type HomeFactsAppointmentItem,
  type HomeFactsFollowupItem,
  type HomeFactsPersonalItem,
  type HomeFactsRouteModel,
  type HomeFactsTaskItem,
  type LoadHomeFactsInput,
} from "./home-facts-route-service";
import {
  homeFactsToViewModel,
  type HomeFactsViewCollection,
  type HomeFactsViewGroup,
  type HomeFactsViewItem,
  type HomeFactsViewModel,
} from "./home-facts-view-model";
import {
  createConfiguredPublicGoalRecommendationsRuntime,
} from "../../../../features/events/public-goal-recommendations-runtime";
import { readHomePlanEventCandidates } from "../../../../features/agent/home-event-pool-runtime";
import type { HomeEventPoolCandidate } from "../../../../features/agent/home-event-pool";
import type {
  PublicGoalRecommendationItem,
  PublicGoalRecommendationsResult,
  PublicGoalRecommendationsService,
  PublicGoalUpcomingEvent,
} from "../../../../features/events/public-goal-recommendations";

export interface HomeDashboardActor {
  id: string;
  accountId?: string;
  workspaceId: string;
}

export interface HomeDashboardRecommendationItem {
  description: string;
  eventId: string;
  matchedTokens: readonly string[];
  publicCode: string;
  sourceEvidenceIds: readonly string[];
  startsAt: string;
  title: string;
  venue: string;
}

/** W0036：首页推荐活动池的「近期可报名」候选（全部，不截断，按开始时间升序）。 */
export interface HomeDashboardUpcomingItem {
  endsAt: string;
  eventId: string;
  publicCode: string;
  startsAt: string;
  title: string;
  venue: string;
}

export interface HomeDashboardSnapshot {
  owner: {
    accountId: string;
    workspaceId: string;
  };
  recommendations: {
    items: readonly HomeDashboardRecommendationItem[];
    state: PublicGoalRecommendationsResult["state"];
    /**
     * W0036：四种状态都复制；目录或报名读失败、或数据形状不对时为空。SC-07 备选约束：只带按开始时间
     * 最早的 `HOME_DASHBOARD_UPCOMING_LIMIT` 场（100 场时整份约 25 KB，超过 20 KB 判定线），
     * 截掉了就把 `upcomingTruncated` 置 true，首页再为计划点名的活动补查一次。
     */
    upcoming: readonly HomeDashboardUpcomingItem[];
    upcomingTruncated: boolean;
  };
  snapshotAt: string;
  facts: HomeFactsViewModel;
}

export interface HomeDashboardRouteDependencies {
  loadFacts?: (input: LoadHomeFactsInput) => Promise<HomeFactsRouteModel>;
  createRecommendations?: (input: {
    now: () => Date;
  }) => PublicGoalRecommendationsService;
}

export interface LoadHomeDashboardSnapshotInput {
  actor: HomeDashboardActor;
  dependencies?: HomeDashboardRouteDependencies;
  snapshotAt?: string | Date;
}

const INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim().length > 0;
}

function snapshotDate(value: string | Date | undefined): Date {
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    if (!Number.isFinite(copy.getTime())) {
      throw new Error("Home dashboard snapshotAt must be a valid instant.");
    }
    return copy;
  }
  if (value === undefined) {
    return new Date();
  }
  if (
    !INSTANT_PATTERN.test(value) ||
    !calendarDate(value.slice(0, 10))
  ) {
    throw new Error("Home dashboard snapshotAt must be an offset-qualified instant.");
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Home dashboard snapshotAt must be a valid instant.");
  }
  return new Date(parsed);
}

function copyTaskItem(item: HomeFactsTaskItem): HomeFactsTaskItem {
  return {
    ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
    group: item.group,
    href: item.href,
    id: item.id,
    key: item.key,
    ...(item.plannedDate === undefined ? {} : { plannedDate: item.plannedDate }),
    status: item.status,
    title: item.title,
  };
}

function copyFollowupItem(
  item: HomeFactsFollowupItem & { href?: string | null },
): HomeFactsViewItem {
  return {
    collection: item.collection,
    contactId: item.contactId,
    contactName: item.contactName,
    connectionId: item.connectionId,
    ...(item.dueAt === undefined ? {} : { dueAt: item.dueAt }),
    group: item.group,
    href: item.href ?? item.operationHref,
    id: item.id,
    ...(item.issue === undefined ? {} : { issue: item.issue }),
    key: item.key,
    operationHref: item.operationHref,
    organization: item.organization,
    relationshipStage: item.relationshipStage,
    status: item.status,
    title: item.title,
    updatedAt: item.updatedAt,
  };
}

function copyPersonalItem(item: HomeFactsPersonalItem): HomeFactsPersonalItem {
  return {
    ...(item.allDay === undefined ? {} : { allDay: item.allDay }),
    ...(item.endsAt === undefined ? {} : { endsAt: item.endsAt }),
    id: item.id,
    key: item.key,
    ...(item.occurrenceDate === undefined ? {} : { occurrenceDate: item.occurrenceDate }),
    ...(item.seriesId === undefined ? {} : { seriesId: item.seriesId }),
    startsAt: item.startsAt,
    state: item.state,
    ...(item.timeZone === undefined ? {} : { timeZone: item.timeZone }),
    title: item.title,
  };
}

function copyAppointmentItem(item: HomeFactsAppointmentItem): HomeFactsAppointmentItem {
  return {
    appointmentId: item.appointmentId,
    contactId: item.contactId,
    durationMinutes: item.durationMinutes,
    endsAtUtc: item.endsAtUtc,
    href: item.href,
    key: item.key,
    medium: item.medium,
    needsReconfirmation: item.needsReconfirmation,
    startsAtUtc: item.startsAtUtc,
    status: item.status,
    temporalState: item.temporalState,
  };
}

function copyGroup<T>(
  group: HomeFactsViewGroup,
  copy: (item: T) => HomeFactsViewItem,
): HomeFactsViewGroup {
  return {
    count: group.count,
    items: group.items.map((item) => copy(item as T)),
    key: group.key,
    label: group.label,
    viewHref: group.viewHref,
  };
}

function copyCollection(collection: HomeFactsViewCollection): HomeFactsViewCollection {
  return {
    count: collection.count,
    items: collection.items.map((item) => copyFollowupItem(item as HomeFactsFollowupItem & { href?: string | null })),
    ...(collection.viewHref === undefined ? {} : { viewHref: collection.viewHref }),
    ...(collection.warning === undefined ? {} : { warning: collection.warning }),
  };
}

function copyTasks(source: HomeFactsViewModel["tasks"]): HomeFactsViewModel["tasks"] {
  return {
    count: source.count,
    groups: source.groups.map((group) => copyGroup(group, (item) => copyTaskItem(item as HomeFactsTaskItem))),
    items: source.items.map((item) => copyTaskItem(item as HomeFactsTaskItem)),
    ...(source.reason === undefined ? {} : { reason: source.reason }),
    sourceLabel: source.sourceLabel,
    state: source.state,
    stateLabel: source.stateLabel,
    title: source.title,
    viewHref: source.viewHref,
    key: "tasks",
  };
}

function copyFollowups(
  source: HomeFactsViewModel["followups"],
): HomeFactsViewModel["followups"] {
  return {
    count: source.count,
    current: copyCollection(source.current),
    groups: source.groups.map((group) => copyGroup(group, (item) => copyFollowupItem(item as HomeFactsFollowupItem & { href?: string | null }))),
    history: copyCollection(source.history),
    items: source.items.map((item) => copyFollowupItem(item as HomeFactsFollowupItem & { href?: string | null })),
    orphan: copyCollection(source.orphan),
    ...(source.reason === undefined ? {} : { reason: source.reason }),
    sourceLabel: source.sourceLabel,
    state: source.state,
    stateLabel: source.stateLabel,
    title: source.title,
    viewHref: source.viewHref,
    key: "followups",
  };
}

function copyPersonal(source: HomeFactsViewModel["personal"]): HomeFactsViewModel["personal"] {
  return {
    count: source.count,
    coverage: source.coverage,
    groups: source.groups.map((group) => copyGroup(group, (item) => copyPersonalItem(item as HomeFactsPersonalItem))),
    items: source.items.map((item) => copyPersonalItem(item as HomeFactsPersonalItem)),
    ...(source.reason === undefined ? {} : { reason: source.reason }),
    sourceLabel: source.sourceLabel,
    state: source.state,
    stateLabel: source.stateLabel,
    title: source.title,
    viewHref: source.viewHref,
    key: "personal",
  };
}

function copyAppointments(source: HomeFactsViewModel["appointments"]): HomeFactsViewModel["appointments"] {
  return {
    count: source.count,
    groups: source.groups.map((group) => copyGroup(group, (item) => copyAppointmentItem(item as HomeFactsAppointmentItem))),
    items: source.items.map((item) => copyAppointmentItem(item as HomeFactsAppointmentItem)),
    ...(source.reason === undefined ? {} : { reason: source.reason }),
    sourceLabel: source.sourceLabel,
    state: source.state,
    stateLabel: source.stateLabel,
    title: source.title,
    viewHref: source.viewHref,
    key: "appointments",
  };
}

function copyFactsViewModel(viewModel: HomeFactsViewModel): HomeFactsViewModel {
  const tasks = copyTasks(viewModel.tasks);
  const followups = copyFollowups(viewModel.followups);
  const personal = copyPersonal(viewModel.personal);
  const appointments = copyAppointments(viewModel.appointments);
  return {
    appointments,
    followups,
    personal,
    sections: [tasks, followups, personal, appointments],
    snapshotAt: viewModel.snapshotAt,
    tasks,
    window: {
      coverage: viewModel.window.coverage,
      from: viewModel.window.from,
      productDate: viewModel.window.productDate,
      timeZone: viewModel.window.timeZone,
      to: viewModel.window.to,
    },
  };
}

function requiredRecommendationString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  return value;
}

function recommendationItem(
  item: PublicGoalRecommendationItem,
): HomeDashboardRecommendationItem {
  if (!item || typeof item !== "object") throw new Error("Recommendation item is invalid.");
  if (!Array.isArray(item.matchedTokens) || item.matchedTokens.some((token) => typeof token !== "string")) {
    throw new Error("Recommendation matched tokens are invalid.");
  }
  if (!Array.isArray(item.sourceEvidenceIds) || item.sourceEvidenceIds.some((id) => typeof id !== "string")) {
    throw new Error("Recommendation evidence ids are invalid.");
  }
  return {
    description: requiredRecommendationString(item.description, "Recommendation description"),
    eventId: requiredRecommendationString(item.eventId, "Recommendation event id"),
    matchedTokens: [...item.matchedTokens],
    publicCode: requiredRecommendationString(item.publicCode, "Recommendation public code"),
    sourceEvidenceIds: [...item.sourceEvidenceIds],
    startsAt: requiredRecommendationString(item.startsAt, "Recommendation startsAt"),
    title: requiredRecommendationString(item.title, "Recommendation title"),
    venue: requiredRecommendationString(item.venue, "Recommendation venue"),
  };
}

function upcomingItem(item: PublicGoalUpcomingEvent): HomeDashboardUpcomingItem {
  if (!item || typeof item !== "object") throw new Error("Upcoming item is invalid.");
  return {
    endsAt: requiredRecommendationString(item.endsAt, "Upcoming endsAt"),
    eventId: requiredRecommendationString(item.eventId, "Upcoming event id"),
    publicCode: requiredRecommendationString(item.publicCode, "Upcoming public code"),
    startsAt: requiredRecommendationString(item.startsAt, "Upcoming startsAt"),
    title: requiredRecommendationString(item.title, "Upcoming title"),
    venue: requiredRecommendationString(item.venue, "Upcoming venue"),
  };
}

/** SC-07 备选约束：snapshot 里「近期可报名」最多带几场（≥ 活动池 8 场，留 4 场余量给去重与剔除）。 */
export const HOME_DASHBOARD_UPCOMING_LIMIT = 12;

const UNAVAILABLE_RECOMMENDATIONS: HomeDashboardSnapshot["recommendations"] = {
  items: [],
  state: "unavailable",
  upcoming: [],
  upcomingTruncated: false,
};

function copyRecommendations(
  result: PublicGoalRecommendationsResult | null,
): HomeDashboardSnapshot["recommendations"] {
  if (
    !result ||
    !["success", "needs_goal", "no_match", "unavailable"].includes(result.state) ||
    !Array.isArray(result.items) ||
    !Array.isArray(result.upcoming)
  ) {
    return { ...UNAVAILABLE_RECOMMENDATIONS };
  }
  // W0036：upcoming 对四种状态都复制并逐项校验（投影掉多余字段）；坏数据整体按 unavailable。
  try {
    const upcoming = result.upcoming.map(upcomingItem);
    return {
      items: result.state === "success" ? result.items.map(recommendationItem) : [],
      state: result.state,
      upcoming: upcoming.slice(0, HOME_DASHBOARD_UPCOMING_LIMIT),
      upcomingTruncated: upcoming.length > HOME_DASHBOARD_UPCOMING_LIMIT,
    };
  } catch {
    return { ...UNAVAILABLE_RECOMMENDATIONS };
  }
}

function unavailableFactsAfterReadFailure(
  actorId: string,
  snapshotAt: string,
): Promise<HomeFactsRouteModel> {
  return loadHomeFacts({
    actorId,
    dependencies: {
      appointmentService: null,
      followupLoader: null,
      personalScheduleService: null,
      taskService: null,
    },
    snapshotAt,
  });
}

export async function loadHomeDashboardSnapshot(
  input: LoadHomeDashboardSnapshotInput,
): Promise<HomeDashboardSnapshot> {
  if (!nonBlank(input.actor.id) || !nonBlank(input.actor.workspaceId)) {
    throw new Error("A canonical dashboard actor is required.");
  }
  if (input.actor.accountId !== undefined && input.actor.accountId !== input.actor.id) {
    throw new Error("Dashboard actor account identity is invalid.");
  }

  const sampledAt = snapshotDate(input.snapshotAt);
  const snapshotIso = sampledAt.toISOString();
  const factsLoader = input.dependencies?.loadFacts ?? ((factsInput: LoadHomeFactsInput) => loadHomeFacts(factsInput));
  const recommendationsFactory = input.dependencies?.createRecommendations ?? createConfiguredPublicGoalRecommendationsRuntime;
  const factsPromise = Promise.resolve()
    .then(() => factsLoader({ actorId: input.actor.id, snapshotAt: snapshotIso }))
    .catch(() => unavailableFactsAfterReadFailure(input.actor.id, snapshotIso));
  const recommendationsPromise = Promise.resolve()
    .then(() => recommendationsFactory({ now: () => new Date(sampledAt.getTime()) }))
    .then((service) => service.recommend({ accountId: input.actor.id }))
    .catch(() => null);
  const [routeFacts, recommendations] = await Promise.all([
    factsPromise,
    recommendationsPromise,
  ]);
  if (routeFacts.snapshotAt !== snapshotIso) {
    throw new Error("Home facts snapshot time drifted during composition.");
  }
  const facts = copyFactsViewModel(homeFactsToViewModel(routeFacts));
  return {
    owner: {
      accountId: input.actor.id,
      workspaceId: input.actor.workspaceId,
    },
    recommendations: copyRecommendations(recommendations),
    snapshotAt: snapshotIso,
    facts,
  };
}

/** 首页补查计划点名活动一次最多带几个 id（计划里的活动条目本来就少）。 */
export const HOME_PLAN_EVENT_IDS_LIMIT = 20;

export interface ResolveHomePlanEventsInput {
  actor: HomeDashboardActor;
  eventIds: readonly string[];
  dependencies?: {
    readCandidates?: (input: { accountId: string; eventIds: readonly string[] }) => Promise<HomeEventPoolCandidate[]>;
  };
}

/**
 * W0036 SC-07 备选约束：按本人身份校验计划点名的活动是否仍可报名（同推荐服务的候选规则），只返回点名的
 * 那几场。id 由调用方给，只作筛选，不扩大读取范围：读的仍是整份公开目录 + 本人报名。
 */
export async function resolveHomePlanEventCandidates(
  input: ResolveHomePlanEventsInput,
): Promise<HomeEventPoolCandidate[]> {
  if (!nonBlank(input.actor.id) || !nonBlank(input.actor.workspaceId)) {
    throw new Error("A canonical dashboard actor is required.");
  }
  const read = input.dependencies?.readCandidates ?? readHomePlanEventCandidates;
  const items = await read({ accountId: input.actor.id, eventIds: input.eventIds });
  return items.map((item) => upcomingItem(item as PublicGoalUpcomingEvent));
}
