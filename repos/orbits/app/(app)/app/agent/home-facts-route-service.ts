import { ORBIT_DISPLAY_TIME_ZONE } from "../orbit-datetime";
import {
  calendarDate,
  localParts,
  resolveLocalDateTime,
  validTimeZone,
} from "../../../../features/tasks/local-date-time";
import {
  createConfiguredTaskService,
} from "../../../../features/tasks/service-factory";
import type { TaskService } from "../../../../features/tasks/service";
import type { TaskItemDTO } from "../../../../features/tasks/contract";
import {
  createConfiguredPersonalScheduleService,
} from "../../../../features/personal-schedule/service-factory";
import type { PersonalScheduleService } from "../../../../features/personal-schedule/service";
import type { PersonalScheduleContract } from "../../../../shared/contract/tasks";
import {
  createConfiguredAppointmentService,
} from "../../../../features/appointments/runtime";
import type { AppointmentService } from "../../../../features/appointments/service";
import type { AppointmentAggregate } from "../../../../features/appointments/contract";
import {
  createConfiguredRelationshipLifecycleFactsReader,
  type RelationshipLifecycleFactsReader,
} from "../../../../features/followups/storage/relationship-lifecycle-facts-reader";
import {
  loadRelationshipLifecycleTasks,
  type RelationshipLifecycleTaskReadModel,
  type RelationshipLifecycleTaskView,
} from "../tasks/relationship-lifecycle-tasks";

/**
 * The Agent home facts route is deliberately an adapter, not another feature
 * contract. Feature DTOs enter here, are checked at the read boundary, and
 * leave as the small display shapes below.
 */

export const HOME_FACTS_SOURCE_KEYS = [
  "tasks",
  "followups",
  "personal",
  "appointments",
] as const;

export type HomeFactsSourceKey = (typeof HOME_FACTS_SOURCE_KEYS)[number];
export type HomeFactsSourceState = "ready" | "empty" | "unavailable";
export type HomeFactsGroupKey = "overdue" | "plan-past" | "recent" | "undated";
export type HomeFactsPersonalCoverage = "starts-in-window";
export type HomeFactsTemporalState = "upcoming" | "ongoing" | "ended";

const HOME_FACTS_DISPLAY_LIMIT = 3;
const CALENDAR_DAY_MS = 86_400_000;
const HOME_FACTS_VIEW_HREFS: Record<HomeFactsSourceKey, string> = {
  tasks: "/app/tasks",
  followups: "/app/tasks",
  personal: "/app/tasks/personal",
  appointments: "/app/today#arrangements",
};
const GROUP_ORDER: readonly HomeFactsGroupKey[] = [
  "overdue",
  "plan-past",
  "recent",
  "undated",
];

export interface HomeFactsWindow {
  coverage: HomeFactsPersonalCoverage;
  from: string;
  productDate: string;
  timeZone: typeof ORBIT_DISPLAY_TIME_ZONE;
  to: string;
}

export interface HomeFactsGroup<TItem> {
  count: number | null;
  items: readonly TItem[];
  key: HomeFactsGroupKey;
  viewHref: string;
}

export interface HomeFactsSource<TItem> {
  count: number | null;
  items: readonly TItem[];
  reason?: string;
  sourceLabel: string;
  state: HomeFactsSourceState;
  viewHref: string;
}

export interface HomeFactsGroupedSource<TItem> extends HomeFactsSource<TItem> {
  groups: readonly HomeFactsGroup<TItem>[];
}

export interface HomeFactsTaskItem {
  dueAt?: string;
  group: HomeFactsGroupKey;
  href: string;
  id: string;
  key: string;
  plannedDate?: string;
  status: "open";
  title: string;
}

export interface HomeFactsFollowupItem {
  collection: "current" | "history" | "orphan";
  contactId: string | null;
  contactName: string;
  connectionId: string | null;
  dueAt?: string;
  group: HomeFactsGroupKey;
  id: string;
  issue?: string;
  key: string;
  operationHref: string | null;
  organization: string;
  relationshipStage: RelationshipLifecycleTaskView["relationshipStage"];
  status: RelationshipLifecycleTaskView["status"];
  title: string;
  updatedAt: string;
}

export interface HomeFactsPersonalItem {
  allDay?: boolean;
  endsAt?: string;
  id: string;
  key: string;
  occurrenceDate?: string;
  seriesId?: string;
  startsAt: string;
  state: PersonalScheduleContract["state"];
  timeZone?: string;
  title: string;
}

export type HomeFactsAppointmentMedium = "in_person" | "video" | "phone";
export type HomeFactsAppointmentStatus = "confirmed" | "reschedule_pending";

export interface HomeFactsAppointmentItem {
  appointmentId: string;
  contactId: string | null;
  durationMinutes: number;
  endsAtUtc: string;
  href: string;
  key: string;
  medium: HomeFactsAppointmentMedium;
  needsReconfirmation: boolean;
  startsAtUtc: string;
  status: HomeFactsAppointmentStatus;
  temporalState: HomeFactsTemporalState;
}

export interface HomeFactsFollowupCollection {
  count: number | null;
  items: readonly HomeFactsFollowupItem[];
  viewHref?: string;
  warning?: string;
}

export interface HomeFactsTaskSource
  extends HomeFactsGroupedSource<HomeFactsTaskItem> {}

export interface HomeFactsFollowupSource
  extends HomeFactsGroupedSource<HomeFactsFollowupItem> {
  current: HomeFactsFollowupCollection;
  history: HomeFactsFollowupCollection;
  orphan: HomeFactsFollowupCollection;
}

export interface HomeFactsPersonalSource
  extends HomeFactsSource<HomeFactsPersonalItem> {
  coverage: HomeFactsPersonalCoverage;
}

export interface HomeFactsAppointmentSource
  extends HomeFactsSource<HomeFactsAppointmentItem> {}

export interface HomeFactsRouteModel {
  appointments: HomeFactsAppointmentSource;
  followups: HomeFactsFollowupSource;
  personal: HomeFactsPersonalSource;
  snapshotAt: string;
  tasks: HomeFactsTaskSource;
  window: HomeFactsWindow;
}

type TaskReader = Pick<TaskService, "list">;
type PersonalScheduleReader = Pick<PersonalScheduleService, "list">;
type AppointmentReader = Pick<AppointmentService, "list">;
type FollowupLoader = (
  input: { actorId: string },
) => Promise<RelationshipLifecycleTaskReadModel> | RelationshipLifecycleTaskReadModel;

/** Narrow seams keep tests on memory readers and keep feature DTOs out of presenters. */
export interface HomeFactsRouteDependencies {
  appointmentService?: AppointmentReader | null;
  appointmentServiceFactory?: () => AppointmentReader | null;
  followupLoader?: FollowupLoader | null;
  followupReaderFactory?: () => RelationshipLifecycleFactsReader | null;
  personalScheduleService?: PersonalScheduleReader | null;
  personalScheduleServiceFactory?: () => PersonalScheduleReader | null;
  taskService?: TaskReader | null;
  taskServiceFactory?: () => TaskReader | null;
}

export interface LoadHomeFactsInput {
  actorId?: string | null;
  dependencies?: HomeFactsRouteDependencies;
  snapshotAt?: string | Date;
}

interface HomeFactsCandidate<TItem extends { group: HomeFactsGroupKey }> {
  item: TItem;
  sortKey: string;
}

interface HomeFactsWindowContext {
  fromMs: number;
  productDate: string;
  snapshotMs: number;
  toDate: string;
  toMs: number;
  window: HomeFactsWindow;
}

const SOURCE_LABELS: Record<HomeFactsSourceKey, string> = {
  tasks: "待办事项",
  followups: "关系跟进",
  personal: "个人日程",
  appointments: "约见",
};

function unavailableBaseSource<TItem>(
  source: HomeFactsSourceKey,
  reason: string,
): HomeFactsSource<TItem> {
  return {
    count: null,
    items: [],
    reason,
    sourceLabel: SOURCE_LABELS[source],
    state: "unavailable",
    viewHref: HOME_FACTS_VIEW_HREFS[source],
  };
}

function unavailableSource<TItem>(
  source: HomeFactsSourceKey,
  reason: string,
): HomeFactsGroupedSource<TItem> {
  return {
    ...unavailableBaseSource<TItem>(source, reason),
    groups: GROUP_ORDER.map((key) => ({
      count: null,
      items: [],
      key,
      viewHref: HOME_FACTS_VIEW_HREFS[source],
    })),
  };
}

function unavailablePersonalSource(reason: string): HomeFactsPersonalSource {
  return {
    ...unavailableBaseSource<HomeFactsPersonalItem>("personal", reason),
    coverage: "starts-in-window",
  };
}

function unavailableAppointmentSource(reason: string): HomeFactsAppointmentSource {
  return unavailableBaseSource<HomeFactsAppointmentItem>("appointments", reason);
}

function emptyFollowupCollections(): {
  current: HomeFactsFollowupCollection;
  history: HomeFactsFollowupCollection;
  orphan: HomeFactsFollowupCollection;
} {
  const empty = {
    count: 0,
    items: [],
    viewHref: HOME_FACTS_VIEW_HREFS.followups,
  } as const;
  return { current: empty, history: empty, orphan: empty };
}

function unavailableFollowupSource(
  reason: string,
  sourceLabel = SOURCE_LABELS.followups,
): HomeFactsFollowupSource {
  const unavailable = unavailableSource<HomeFactsFollowupItem>("followups", reason);
  const empty = {
    count: null,
    items: [],
    viewHref: HOME_FACTS_VIEW_HREFS.followups,
  } as const;
  return {
    ...unavailable,
    current: empty,
    history: empty,
    orphan: empty,
    sourceLabel,
  };
}

function emptyFollowupSource(
  sourceLabel = SOURCE_LABELS.followups,
): HomeFactsFollowupSource {
  const collections = emptyFollowupCollections();
  return {
    ...groupedSource("followups", sourceLabel, []),
    ...collections,
  };
}

function groupRank(key: HomeFactsGroupKey): number {
  return GROUP_ORDER.indexOf(key);
}

function compareCandidates<TItem extends { group: HomeFactsGroupKey; id?: string; key?: string }>(
  left: HomeFactsCandidate<TItem>,
  right: HomeFactsCandidate<TItem>,
): number {
  const groupDelta = groupRank(left.item.group) - groupRank(right.item.group);
  if (groupDelta !== 0) return groupDelta;
  const sortDelta = left.sortKey.localeCompare(right.sortKey);
  if (sortDelta !== 0) return sortDelta;
  return (left.item.key ?? left.item.id ?? "").localeCompare(
    right.item.key ?? right.item.id ?? "",
  );
}

function groupedSource<TItem extends { group: HomeFactsGroupKey }>(
  source: HomeFactsSourceKey,
  sourceLabel: string,
  candidates: readonly HomeFactsCandidate<TItem>[],
): HomeFactsGroupedSource<TItem> {
  const sorted = [...candidates].sort(compareCandidates);
  const visible = sorted.slice(0, HOME_FACTS_DISPLAY_LIMIT).map(({ item }) => item);

  return {
    count: sorted.length,
    groups: GROUP_ORDER.map((key) => ({
      count: sorted.filter((candidate) => candidate.item.group === key).length,
      items: visible.filter((item) => item.group === key),
      key,
      viewHref: HOME_FACTS_VIEW_HREFS[source],
    })),
    items: visible,
    sourceLabel,
    state: sorted.length > 0 ? "ready" : "empty",
    viewHref: HOME_FACTS_VIEW_HREFS[source],
  };
}

function readSnapshotAt(value: string | Date | undefined): {
  iso: string;
  ms: number;
} {
  const date =
    value === undefined
      ? new Date()
      : value instanceof Date
        ? new Date(value.getTime())
        : new Date(validInstant(value, "Home facts snapshotAt"));
  const ms = date.getTime();
  if (!Number.isFinite(ms)) {
    throw new Error("Home facts snapshotAt must be a valid instant.");
  }
  return { iso: date.toISOString(), ms };
}

/** Build the half-open product-zone calendar window without using process TZ. */
export function buildHomeFactsWindow(snapshotAt: string | Date): HomeFactsWindowContext {
  const snapshot = readSnapshotAt(snapshotAt);
  const productDate = localParts(snapshot.iso, ORBIT_DISPLAY_TIME_ZONE).date;
  const productDateValue = calendarDate(productDate);
  if (!productDateValue) {
    throw new Error("Home facts product date could not be validated.");
  }

  const toDate = new Date(
    productDateValue.getTime() + 7 * CALENDAR_DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  if (!calendarDate(toDate)) {
    throw new Error("Home facts window end date could not be validated.");
  }

  const from = resolveLocalDateTime(
    productDate,
    "00:00",
    ORBIT_DISPLAY_TIME_ZONE,
  );
  const to = resolveLocalDateTime(toDate, "00:00", ORBIT_DISPLAY_TIME_ZONE);
  if (!from || !to) {
    throw new Error("Home facts product-day boundary could not be resolved.");
  }

  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    throw new Error("Home facts window boundaries are invalid.");
  }

  return {
    fromMs,
    productDate,
    snapshotMs: snapshot.ms,
    toDate,
    toMs,
    window: {
      coverage: "starts-in-window",
      from: new Date(fromMs).toISOString(),
      productDate,
      timeZone: ORBIT_DISPLAY_TIME_ZONE,
      to: new Date(toMs).toISOString(),
    },
  };
}

function validInstant(value: unknown, label: string): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !calendarDate(value.slice(0, 10))
  ) {
    throw new Error(`${label} is not a valid instant.`);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} is not a valid instant.`);
  }
  return parsed;
}

function validText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing.`);
  }
  return value;
}

function validCalendarDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !calendarDate(value)) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return value;
}

function isProductDateInWindow(
  value: string,
  context: HomeFactsWindowContext,
): boolean {
  return value >= context.productDate && value < context.toDate;
}

function productDateForInstant(
  value: string,
  context: HomeFactsWindowContext,
): string {
  const date = localParts(value, ORBIT_DISPLAY_TIME_ZONE).date;
  return validCalendarDate(date, "product date");
}

function taskGroup(
  task: TaskItemDTO,
  context: HomeFactsWindowContext,
): HomeFactsGroupKey | null {
  const dueAt = task.dueAt;
  const dueMs = dueAt === undefined ? null : validInstant(dueAt, "Task dueAt");
  const plannedDate =
    task.plannedDate === undefined
      ? undefined
      : validCalendarDate(task.plannedDate, "Task plannedDate");

  if (dueMs !== null && dueMs < context.snapshotMs) return "overdue";
  if (plannedDate !== undefined && plannedDate < context.productDate) {
    return "plan-past";
  }

  const dueDate = dueAt
    ? productDateForInstant(dueAt, context)
    : undefined;
  if (
    (plannedDate !== undefined && isProductDateInWindow(plannedDate, context)) ||
    (dueDate !== undefined && isProductDateInWindow(dueDate, context))
  ) {
    return "recent";
  }

  if (plannedDate === undefined && dueAt === undefined) return "undated";
  return null;
}

function taskCandidate(
  task: TaskItemDTO,
  actorId: string,
  context: HomeFactsWindowContext,
): HomeFactsCandidate<HomeFactsTaskItem> | null {
  if (
    task.status !== "open" ||
    task.accountId !== actorId ||
    task.ownerUserId !== actorId
  ) {
    throw new Error("Task actor ownership or status is invalid.");
  }
  const dueAt =
    task.dueAt === undefined
      ? undefined
      : new Date(validInstant(task.dueAt, "Task dueAt")).toISOString();
  const id = validText(task.id, "Task id");
  const title = validText(task.title, "Task title");
  const group = taskGroup(task, context);
  if (!group) return null;

  return {
    item: {
      ...(dueAt !== undefined ? { dueAt } : {}),
      group,
      href: `/app/tasks/${encodeURIComponent(id)}`,
      id,
      key: `tasks:${id}`,
      ...(task.plannedDate !== undefined ? { plannedDate: task.plannedDate } : {}),
      status: "open",
      title,
    },
    sortKey: dueAt ?? task.plannedDate ?? "9999-12-31",
  };
}

function taskServiceFrom(
  dependencies: HomeFactsRouteDependencies,
): TaskReader | null {
  if (dependencies.taskService !== undefined) return dependencies.taskService;
  if (dependencies.taskServiceFactory) return dependencies.taskServiceFactory();
  return createConfiguredTaskService();
}

async function loadTasks(
  actorId: string,
  context: HomeFactsWindowContext,
  dependencies: HomeFactsRouteDependencies,
): Promise<HomeFactsTaskSource> {
  try {
    const service = taskServiceFrom(dependencies);
    if (!service) {
      return unavailableSource<HomeFactsTaskItem>(
        "tasks",
        "待办来源未配置或读取失败。",
      );
    }
    const tasks = await service.list({ actorId, status: "open" });
    if (!Array.isArray(tasks)) throw new Error("Task source did not return a list.");
    return groupedSource(
      "tasks",
      SOURCE_LABELS.tasks,
      tasks.flatMap((task) => {
        const candidate = taskCandidate(task, actorId, context);
        return candidate ? [candidate] : [];
      }),
    );
  } catch {
    return unavailableSource<HomeFactsTaskItem>(
      "tasks",
      "待办来源未配置或读取失败。",
    );
  }
}

function followupGroup(
  item: RelationshipLifecycleTaskView,
  context: HomeFactsWindowContext,
): HomeFactsGroupKey | null {
  if (item.dueAt === undefined) return "undated";
  const dueMs = validInstant(item.dueAt, "Follow-up dueAt");
  if (dueMs < context.snapshotMs) return "overdue";
  return isProductDateInWindow(
    productDateForInstant(item.dueAt, context),
    context,
  )
    ? "recent"
    : null;
}

function followupCandidate(
  item: RelationshipLifecycleTaskView,
  collection: HomeFactsFollowupItem["collection"],
  context: HomeFactsWindowContext,
): HomeFactsCandidate<HomeFactsFollowupItem> | null {
  const dueAt =
    item.dueAt === undefined
      ? undefined
      : new Date(validInstant(item.dueAt, "Follow-up dueAt")).toISOString();
  const id = validText(item.id, "Follow-up id");
  const title = validText(item.title, "Follow-up title");
  const group = followupGroup(item, context);
  if (!group) return null;
  if (item.dueAt !== undefined) validInstant(item.dueAt, "Follow-up dueAt");

  const mapped: HomeFactsFollowupItem = {
    collection,
    contactId: item.contactId,
    contactName: item.contactName,
    connectionId: item.connectionId,
    ...(dueAt !== undefined ? { dueAt } : {}),
    group,
    id,
    ...(item.issue ? { issue: item.issue } : {}),
    key: `followups:${id}`,
    operationHref: item.operationHref,
    organization: item.organization,
    relationshipStage: item.relationshipStage,
    status: item.status,
    title,
    updatedAt: item.updatedAt,
  };

  return {
    item: mapped,
    sortKey: dueAt ?? "9999-12-31",
  };
}

function followupCollection(
  items: readonly RelationshipLifecycleTaskView[],
  collection: HomeFactsFollowupItem["collection"],
  context: HomeFactsWindowContext,
): { candidates: HomeFactsCandidate<HomeFactsFollowupItem>[]; items: HomeFactsFollowupItem[] } {
  const candidates: HomeFactsCandidate<HomeFactsFollowupItem>[] = [];
  for (const item of items) {
    const candidate = followupCandidate(item, collection, context);
    if (candidate) candidates.push(candidate);
  }
  return { candidates, items: candidates.sort(compareCandidates).map(({ item }) => item) };
}

function followupServiceCollections(
  result: Extract<RelationshipLifecycleTaskReadModel, { state: "success" }>,
  context: HomeFactsWindowContext,
): {
  candidates: HomeFactsCandidate<HomeFactsFollowupItem>[];
  collections: {
    current: HomeFactsFollowupCollection;
    history: HomeFactsFollowupCollection;
    orphan: HomeFactsFollowupCollection;
  };
} {
  const current = followupCollection(result.currentTasks, "current", context);
  return {
    candidates: current.candidates,
    collections: {
      current: {
        count: current.items.length,
        items: current.items.slice(0, HOME_FACTS_DISPLAY_LIMIT),
        viewHref: HOME_FACTS_VIEW_HREFS.followups,
      },
      history: {
        count: result.historyCount,
        items: [],
        viewHref: HOME_FACTS_VIEW_HREFS.followups,
      },
      orphan: {
        count: result.orphanCount,
        items: [],
        viewHref: HOME_FACTS_VIEW_HREFS.followups,
        ...(result.orphanCount > 0
          ? { warning: "存在失联跟进，请在待办中处理。" }
          : {}),
      },
    },
  };
}

function followupLoaderFrom(
  dependencies: HomeFactsRouteDependencies,
): FollowupLoader | null {
  if (dependencies.followupLoader !== undefined) return dependencies.followupLoader;
  const readerFactory =
    dependencies.followupReaderFactory ??
    createConfiguredRelationshipLifecycleFactsReader;
  return ({ actorId }) =>
    loadRelationshipLifecycleTasks({
      actorId,
      reader: readerFactory(),
    });
}

async function loadFollowups(
  actorId: string,
  context: HomeFactsWindowContext,
  dependencies: HomeFactsRouteDependencies,
): Promise<HomeFactsFollowupSource> {
  try {
    const loader = followupLoaderFrom(dependencies);
    if (!loader) return unavailableFollowupSource("关系跟进来源未配置或读取失败。");
    const result = await loader({ actorId });
    if (result.state === "unavailable") {
      return unavailableFollowupSource(
        result.reason ?? "关系跟进来源未配置或读取失败。",
        result.sourceLabel,
      );
    }
    if (result.state !== "success") return emptyFollowupSource(result.sourceLabel);

    const loaded = followupServiceCollections(result, context);
    return {
      ...groupedSource("followups", result.sourceLabel, loaded.candidates),
      ...loaded.collections,
    };
  } catch {
    return unavailableFollowupSource("关系跟进来源未配置或读取失败。");
  }
}

function personalServiceFrom(
  dependencies: HomeFactsRouteDependencies,
): PersonalScheduleReader | null {
  if (dependencies.personalScheduleService !== undefined) {
    return dependencies.personalScheduleService;
  }
  if (dependencies.personalScheduleServiceFactory) {
    return dependencies.personalScheduleServiceFactory();
  }
  return createConfiguredPersonalScheduleService();
}

function personalItem(
  item: PersonalScheduleContract,
  actorId: string,
  context: HomeFactsWindowContext,
): HomeFactsPersonalItem | null {
  if (item.accountId !== actorId || item.ownerUserId !== actorId) {
    throw new Error("Personal schedule actor ownership is invalid.");
  }
  const id = validText(item.id, "Personal schedule id");
  const title = validText(item.title, "Personal schedule title");
  const startsMs = validInstant(item.startsAt, "Personal schedule startsAt");
  const endsMs = item.endsAt !== undefined
    ? validInstant(item.endsAt, "Personal schedule endsAt")
    : undefined;
  if (endsMs !== undefined && endsMs <= startsMs) {
    throw new Error("Personal schedule endsAt must follow startsAt.");
  }
  if (
    item.timeZone !== undefined &&
    !validTimeZone(item.timeZone)
  ) {
    throw new Error("Personal schedule timeZone is invalid.");
  }
  if (item.occurrenceDate !== undefined) {
    validCalendarDate(item.occurrenceDate, "Personal schedule occurrenceDate");
  }
  if (item.seriesId !== undefined) validText(item.seriesId, "Personal schedule seriesId");
  if (startsMs < context.fromMs || startsMs >= context.toMs) return null;
  if (item.state === "cancelled") return null;

  const state: Exclude<PersonalScheduleContract["state"], "cancelled"> =
    context.snapshotMs < startsMs
      ? "upcoming"
      : endsMs !== undefined && context.snapshotMs < endsMs
        ? "ongoing"
        : "ended";

  return {
    ...(item.allDay !== undefined ? { allDay: item.allDay } : {}),
    ...(item.endsAt !== undefined ? { endsAt: new Date(endsMs!).toISOString() } : {}),
    id,
    key: `personal:${id}`,
    ...(item.occurrenceDate ? { occurrenceDate: item.occurrenceDate } : {}),
    ...(item.seriesId ? { seriesId: item.seriesId } : {}),
    startsAt: new Date(startsMs).toISOString(),
    state,
    ...(item.timeZone ? { timeZone: item.timeZone } : {}),
    title,
  };
}

async function loadPersonal(
  actorId: string,
  context: HomeFactsWindowContext,
  dependencies: HomeFactsRouteDependencies,
): Promise<HomeFactsPersonalSource> {
  try {
    const service = personalServiceFrom(dependencies);
    if (!service) return unavailablePersonalSource("个人日程来源未配置或读取失败。");
    const records = await service.list({
      actorId,
      from: context.window.from,
      to: context.window.to,
    });
    if (!Array.isArray(records)) throw new Error("Personal schedule source did not return a list.");
    const items = records
      .flatMap((record) => {
        const item = personalItem(record, actorId, context);
        return item ? [item] : [];
      })
      .sort((left, right) => {
        const startDelta = left.startsAt.localeCompare(right.startsAt);
        return startDelta !== 0 ? startDelta : left.key.localeCompare(right.key);
      });
    return {
      count: items.length,
      coverage: "starts-in-window",
      items: items.slice(0, HOME_FACTS_DISPLAY_LIMIT),
      sourceLabel: SOURCE_LABELS.personal,
      state: items.length > 0 ? "ready" : "empty",
      viewHref: HOME_FACTS_VIEW_HREFS.personal,
    };
  } catch {
    return unavailablePersonalSource("个人日程来源未配置或读取失败。");
  }
}

function appointmentServiceFrom(
  dependencies: HomeFactsRouteDependencies,
): AppointmentReader | null {
  if (dependencies.appointmentService !== undefined) {
    return dependencies.appointmentService;
  }
  if (dependencies.appointmentServiceFactory) {
    return dependencies.appointmentServiceFactory();
  }
  return createConfiguredAppointmentService();
}

function appointmentTemporalState(
  startsMs: number,
  endsMs: number,
  snapshotMs: number,
): HomeFactsTemporalState {
  if (snapshotMs < startsMs) return "upcoming";
  if (snapshotMs < endsMs) return "ongoing";
  return "ended";
}

function appointmentItem(
  appointment: AppointmentAggregate,
  actorId: string,
  context: HomeFactsWindowContext,
): HomeFactsAppointmentItem | null {
  if (
    appointment.ownerActorId !== actorId &&
    appointment.inviteeActorId !== actorId
  ) {
    throw new Error("Appointment actor participation is invalid.");
  }
  if (appointment.status === "cancelled" || appointment.status === "completed") {
    return null;
  }
  if (appointment.status !== "confirmed" && appointment.status !== "reschedule_pending") {
    return null;
  }
  if (!appointment.confirmed) {
    throw new Error("A confirmed appointment status requires a saved confirmation.");
  }

  const confirmed = appointment.confirmed;
  const startsMs = validInstant(confirmed.startsAtUtc, "Appointment startsAtUtc");
  if (!Number.isSafeInteger(confirmed.durationMinutes) || confirmed.durationMinutes <= 0) {
    throw new Error("Appointment duration is invalid.");
  }
  if (
    confirmed.medium.kind !== "in_person" &&
    confirmed.medium.kind !== "video" &&
    confirmed.medium.kind !== "phone"
  ) {
    throw new Error("Appointment medium is invalid.");
  }
  if (startsMs < context.fromMs || startsMs >= context.toMs) return null;

  const endsMs = startsMs + confirmed.durationMinutes * 60_000;
  if (!Number.isFinite(endsMs) || endsMs <= startsMs) {
    throw new Error("Appointment end time is invalid.");
  }
  const appointmentId = validText(appointment.appointmentId, "Appointment id");
  const contactId =
    typeof appointment.contactIdsByActor?.[actorId] === "string"
      ? appointment.contactIdsByActor[actorId]!
      : null;

  return {
    appointmentId,
    contactId,
    durationMinutes: confirmed.durationMinutes,
    endsAtUtc: new Date(endsMs).toISOString(),
    href: HOME_FACTS_VIEW_HREFS.appointments,
    key: `appointments:${appointmentId}`,
    medium: confirmed.medium.kind,
    needsReconfirmation: appointment.status === "reschedule_pending",
    startsAtUtc: new Date(startsMs).toISOString(),
    status: appointment.status,
    temporalState: appointmentTemporalState(startsMs, endsMs, context.snapshotMs),
  };
}

async function loadAppointments(
  actorId: string,
  context: HomeFactsWindowContext,
  dependencies: HomeFactsRouteDependencies,
): Promise<HomeFactsAppointmentSource> {
  try {
    const service = appointmentServiceFrom(dependencies);
    if (!service) return unavailableAppointmentSource("约见来源未配置或读取失败。");
    const records = await service.list({ actorId });
    if (!Array.isArray(records)) throw new Error("Appointment source did not return a list.");
    const items = records
      .flatMap((record) => {
        const item = appointmentItem(record, actorId, context);
        return item ? [item] : [];
      })
      .sort((left, right) => {
        const startDelta = left.startsAtUtc.localeCompare(right.startsAtUtc);
        return startDelta !== 0
          ? startDelta
          : left.appointmentId.localeCompare(right.appointmentId);
      });
    return {
      count: items.length,
      items: items.slice(0, HOME_FACTS_DISPLAY_LIMIT),
      sourceLabel: SOURCE_LABELS.appointments,
      state: items.length > 0 ? "ready" : "empty",
      viewHref: HOME_FACTS_VIEW_HREFS.appointments,
    };
  } catch {
    return unavailableAppointmentSource("约见来源未配置或读取失败。");
  }
}

function unavailableModel(
  snapshotAt: string,
  window: HomeFactsWindow,
): HomeFactsRouteModel {
  return {
    appointments: unavailableAppointmentSource("缺少已认证 actor，无法读取约见。"),
    followups: unavailableFollowupSource("缺少已认证 actor，无法读取关系跟进。"),
    personal: unavailablePersonalSource("缺少已认证 actor，无法读取个人日程。"),
    snapshotAt,
    tasks: unavailableSource<HomeFactsTaskItem>(
      "tasks",
      "缺少已认证 actor，无法读取待办。",
    ),
    window,
  };
}

/**
 * Read the four home facts in one server-side round. This is parallel I/O,
 * not a cross-source transaction; each source owns its own failure boundary.
 */
export async function loadHomeFacts(
  input: LoadHomeFactsInput,
  dependencies: HomeFactsRouteDependencies = {},
): Promise<HomeFactsRouteModel> {
  const snapshot = readSnapshotAt(input.snapshotAt);
  const context = buildHomeFactsWindow(snapshot.iso);
  const actorId = input.actorId?.trim() ?? "";
  const resolvedDependencies = input.dependencies ?? dependencies;

  if (!actorId) return unavailableModel(snapshot.iso, context.window);

  const [tasks, followups, personal, appointments] = await Promise.all([
    loadTasks(actorId, context, resolvedDependencies),
    loadFollowups(actorId, context, resolvedDependencies),
    loadPersonal(actorId, context, resolvedDependencies),
    loadAppointments(actorId, context, resolvedDependencies),
  ]);

  return {
    appointments,
    followups,
    personal,
    snapshotAt: snapshot.iso,
    tasks,
    window: context.window,
  };
}
