import { localParts } from "../time/date-time";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type MessageKey } from "../i18n/messages";
import type {
  ScheduleItemContract,
  TaskCategory,
  TaskItemContract,
  TaskSuggestionContract,
} from "../api/contract/tasks";

const categories: readonly TaskCategory[] = [
  "relationship",
  "meeting",
  "event",
  "work",
  "personal",
  "other",
];

const categoryLabelKeys: Record<TaskCategory, MessageKey> = {
  relationship: "workflow.categoryRelationship",
  meeting: "workflow.categoryMeeting",
  event: "workflow.categoryEvent",
  work: "workflow.categoryWork",
  personal: "workflow.categoryPersonal",
  other: "workflow.categoryOther",
};

export interface TodayTaskRowView {
  location?: string;
  id: string;
  title: string;
  categoryLabel: string;
  dueLabel: string;
  dueTone: "danger" | "muted" | "normal";
  priority: "normal" | "high";
}

export interface TaskListRowView extends TodayTaskRowView {
  dateLabel: string;
  plannedDate?: string;
  dueAt?: string;
  notes?: string;
  status: "open" | "completed" | "cancelled";
  updatedAt: string;
}

export interface TaskDetailView {
  location?: string;
  id: string;
  title: string;
  notes: string;
  status: TaskItemContract["status"];
  statusLabel: string;
  category: TaskCategory;
  categoryLabel: string;
  plannedDate?: string;
  dueAt?: string;
  createdAt?: string;
  sourceLabel?: string;
  relatedContactId?: string;
  relatedEventId?: string;
  sourceNoteId?: string;
  sourceNoteVersion?: number;
  priority: TaskItemContract["priority"];
  updatedAt: string;
}

export interface TaskActivityView {
  id: string;
  label: string;
  dateLabel: string;
}

export interface TodayView {
  dateLabel: string;
  summary: string;
  tasks: readonly TodayTaskRowView[];
  completedCount: number;
  completedLabel: string;
  suggestions: readonly {
    id: string;
    title: string;
    reason: string;
    categoryLabel: string;
    actionLabel: string;
  }[];
  schedule: readonly {
    id: string;
    title: string;
    detail: string;
    kind: ScheduleItemContract["kind"];
    sourceId: string;
    stateLabel: string;
  }[];
}

export interface TodayHomeActionView {
  context: string;
  href: string;
  id: string;
  index: number;
  kind: "task" | "schedule";
  title: string;
}

export interface TodayHomeSummaryView {
  items: readonly TodayHomeActionView[];
  openTaskCount: number;
  suggestionCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function category(value: unknown): TaskCategory | null {
  return categories.includes(value as TaskCategory)
    ? (value as TaskCategory)
    : null;
}

function taskFrom(value: unknown): TaskItemContract | null {
  if (!isRecord(value)) return null;
  const parsedCategory = category(value.category);
  if (
    !text(value.id) ||
    !text(value.title) ||
    !parsedCategory ||
    !["open", "completed", "cancelled"].includes(String(value.status))
  ) {
    return null;
  }
  return {
    ...(value as unknown as TaskItemContract),
    id: value.id as string,
    title: value.title as string,
    category: parsedCategory,
    priority: value.priority === "high" ? "high" : "normal",
  };
}

function suggestionFrom(value: unknown): TaskSuggestionContract | null {
  if (!isRecord(value)) return null;
  const parsedCategory = category(value.category);
  if (!text(value.id) || !text(value.title) || !text(value.reason) || !parsedCategory) {
    return null;
  }
  return {
    ...(value as unknown as TaskSuggestionContract),
    id: value.id as string,
    title: value.title as string,
    reason: value.reason as string,
    category: parsedCategory,
  };
}

function scheduleFrom(value: unknown): ScheduleItemContract | null {
  if (!isRecord(value)) return null;
  const parsedCategory = category(value.category);
  if (
    !text(value.id) ||
    !text(value.title) ||
    !text(value.startsAt) ||
    !text(value.sourceId) ||
    !parsedCategory ||
    !["meeting", "event", "personal"].includes(String(value.kind)) ||
    !["upcoming", "ongoing", "ended", "cancelled"].includes(String(value.state))
  ) {
    return null;
  }
  return value as unknown as ScheduleItemContract;
}

function localeTag(language: OrbitLanguage): string {
  return language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
}

function tokyoParts(value: string, timeZone = "Asia/Tokyo", language: OrbitLanguage = "zh") {
  const parts = new Intl.DateTimeFormat(localeTag(language), {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    month: part("month"),
    // Native Intl can fold weekday into day and lose time-part types when combined.
    weekday: new Intl.DateTimeFormat(localeTag(language), { timeZone, weekday: "short" }).format(new Date(value)),
  };
}

function dateLabel(date: string, language: OrbitLanguage): string {
  const value = new Date(`${date}T12:00:00Z`);
  if (language === "zh") {
    const parts = tokyoParts(value.toISOString(), "UTC", language);
    return `${parts.month}月${parts.day}日 ${parts.weekday}`;
  }
  return new Intl.DateTimeFormat(localeTag(language), { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" }).format(value);
}

function timeLabel(value: string, timeZone: string): string {
  const parts = tokyoParts(value, timeZone);
  return `${parts.hour}:${parts.minute}`;
}

function dateTimeLabel(value: string, timeZone: string, language: OrbitLanguage): string {
  if (language === "zh") {
    const parts = tokyoParts(value, timeZone, language);
    return `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
  }
  return new Intl.DateTimeFormat(localeTag(language), { day: "numeric", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "short", timeZone }).format(new Date(value));
}

function taskDue(
  task: TaskItemContract,
  now: Date,
  timeZone: string,
  language: OrbitLanguage,
): Pick<TodayTaskRowView, "dueLabel" | "dueTone"> {
  const t = createTranslator(language);
  if (task.dueAt) {
    if (Date.parse(task.dueAt) < now.getTime()) {
      return { dueLabel: t("todayVm.overdue"), dueTone: "danger" };
    }
    return { dueLabel: timeLabel(task.dueAt, timeZone), dueTone: "normal" };
  }
  if (task.plannedDate) {
    return { dueLabel: t("todayVm.today"), dueTone: "muted" };
  }
  return { dueLabel: "", dueTone: "muted" };
}

function taskRow(task: TaskItemContract, now: Date, timeZone: string, language: OrbitLanguage): TodayTaskRowView {
  return {
    ...(task.location ? { location: task.location } : {}),
    id: task.id,
    title: task.title,
    categoryLabel: createTranslator(language)(categoryLabelKeys[task.category]),
    ...taskDue(task, now, timeZone, language),
    priority: task.priority,
  };
}

export function todayToView(payload: unknown, now = new Date(), timeZone = "Asia/Tokyo", language: OrbitLanguage = "zh"): TodayView {
  const t = createTranslator(language);
  const root = isRecord(payload) ? payload : {};
  const tasks = Array.isArray(root.tasks)
    ? root.tasks.map(taskFrom).filter((item): item is TaskItemContract => item !== null)
    : [];
  const suggestions = Array.isArray(root.suggestions)
    ? root.suggestions
        .map(suggestionFrom)
        .filter((item): item is TaskSuggestionContract => item !== null)
    : [];
  const schedule = Array.isArray(root.schedule)
    ? root.schedule
        .map(scheduleFrom)
        .filter((item): item is ScheduleItemContract => item !== null)
    : [];
  const completedCount =
    typeof root.completedCount === "number" && root.completedCount >= 0
      ? root.completedCount
      : 0;
  const rawDate = text(root.date) ?? localParts(now, timeZone).date;

  return {
    dateLabel: dateLabel(rawDate, language),
    summary: t("todayVm.summary", { tasks: tasks.length, schedule: schedule.length }),
    tasks: tasks.map((item) => taskRow(item, now, timeZone, language)),
    completedCount,
    completedLabel: t("todayVm.completed", { count: completedCount }),
    suggestions: suggestions.map((item) => ({
      id: item.id,
      title: item.title,
      reason: item.reason,
      categoryLabel: t(categoryLabelKeys[item.category]),
      actionLabel: t("todayVm.addTask"),
    })),
    schedule: schedule.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.location ?? t(categoryLabelKeys[item.category]),
      kind: item.kind,
      sourceId: item.sourceId,
      stateLabel:
        item.state === "ended"
          ? t("todayVm.ended")
          : item.state === "ongoing"
            ? t("todayVm.ongoing")
            : item.state === "cancelled"
              ? t("todayVm.cancelled")
              : timeLabel(item.startsAt, timeZone),
    })),
  };
}

export function todayHomeSummary(
  payload: unknown,
  now = new Date(),
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = "zh",
): TodayHomeSummaryView {
  const root = isRecord(payload) ? payload : {};
  const summary = isRecord(root.summary) ? root.summary : {};
  const today = todayToView(payload, now, timeZone, language);
  const items = [
    ...today.tasks.map((task) => ({
      context: [task.categoryLabel, task.dueLabel].filter(Boolean).join(" · "),
      href: `/tasks/${encodeURIComponent(task.id)}`,
      id: task.id,
      kind: "task" as const,
      title: task.title,
    })),
    ...today.schedule.map((item) => ({
      context: [item.stateLabel, item.detail].filter(Boolean).join(" · "),
      href: "/schedule",
      id: item.id,
      kind: "schedule" as const,
      title: item.title,
    })),
  ]
    .slice(0, 3)
    .map((item, index) => ({ ...item, index: index + 1 }));

  return {
    items,
    openTaskCount:
      typeof summary.openTaskCount === "number" && summary.openTaskCount >= 0
        ? summary.openTaskCount
        : today.tasks.length,
    suggestionCount:
      typeof summary.suggestionCount === "number" && summary.suggestionCount >= 0
        ? summary.suggestionCount
        : today.suggestions.length,
  };
}

export interface HomeQuestion {
  kind: "tasks" | "followup" | "preparation" | "discovery";
  label: string;
}

export function todayHomeQuestions(
  payload: unknown,
  now = new Date(),
  language: OrbitLanguage = "zh",
): readonly HomeQuestion[] {
  const t = createTranslator(language);
  const root = isRecord(payload) ? payload : {};
  const tasks = (Array.isArray(root.tasks) ? root.tasks : [])
    .map(taskFrom)
    .filter((task): task is TaskItemContract => task !== null && task.status === "open");
  const schedule = (Array.isArray(root.schedule) ? root.schedule : [])
    .map(scheduleFrom)
    .filter((item): item is ScheduleItemContract => item !== null);
  const urgent = tasks.some((task) => task.priority === "high" ||
    (typeof task.dueAt === "string" && Date.parse(task.dueAt) <= now.getTime()));
  const preparation = schedule.some((item) =>
    (item.kind === "meeting" || item.kind === "event") &&
    item.state === "upcoming" && Date.parse(item.startsAt) > now.getTime());
  const followup = tasks.some((task) => task.category === "relationship");
  const primary: HomeQuestion = urgent
    ? { kind: "tasks", label: t("todayVm.questionTasks") }
    : preparation
      ? { kind: "preparation", label: t("todayVm.questionPreparation") }
      : followup
        ? { kind: "followup", label: t("todayVm.questionFollowup") }
        : { kind: "tasks", label: t("todayVm.questionTasks") };

  return [primary, { kind: "discovery", label: t("todayVm.questionDiscovery") }];
}

export function tasksToListView(
  payload: unknown,
  view: "open" | "completed",
  now = new Date(),
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = "zh",
) {
  const root = isRecord(payload) ? payload : {};
  const tasks = Array.isArray(root.tasks)
    ? root.tasks.map(taskFrom).filter((item): item is TaskItemContract => item !== null)
    : [];
  const items: TaskListRowView[] = tasks
    .filter((item) => item.status === view)
    .sort((left, right) => {
      const leftDate = view === "completed"
        ? left.completedAt ?? left.updatedAt
        : left.dueAt ?? left.plannedDate;
      const rightDate = view === "completed"
        ? right.completedAt ?? right.updatedAt
        : right.dueAt ?? right.plannedDate;
      const leftTime = leftDate ? Date.parse(leftDate) : Number.POSITIVE_INFINITY;
      const rightTime = rightDate ? Date.parse(rightDate) : Number.POSITIVE_INFINITY;
      return view === "completed" ? rightTime - leftTime : leftTime - rightTime;
    })
    .map((item) => ({
      ...taskRow(item, now, timeZone, language),
      ...(item.notes ? { notes: item.notes } : {}),
      ...(item.plannedDate ? { plannedDate: item.plannedDate } : {}),
      ...(item.dueAt ? { dueAt: item.dueAt } : {}),
      status: item.status,
      dateLabel: item.completedAt
        ? dateTimeLabel(item.completedAt, timeZone, language)
        : item.dueAt
          ? dateTimeLabel(item.dueAt, timeZone, language)
          : item.plannedDate
            ? dateLabel(item.plannedDate, language)
            : createTranslator(language)("todayVm.unplanned"),
      updatedAt: item.updatedAt,
    }));
  return { items, view };
}

export function taskDetailToView(payload: unknown, language: OrbitLanguage = "zh"): TaskDetailView | null {
  const root = isRecord(payload) ? payload : {};
  const task = taskFrom(root.task);
  if (!task) return null;
  const t = createTranslator(language);
  const sourceLabels: Record<TaskItemContract["source"], string> = {
    manual: t("todayVm.sourceManual"), ai_confirmed: t("todayVm.sourceAi"), contact: t("todayVm.sourceContact"), event: t("todayVm.sourceEvent"), inbox: t("todayVm.sourceInbox"),
  };
  return {
    id: task.id,
    title: task.title,
    notes: task.notes ?? "",
    ...(text(task.location) ? { location: text(task.location)! } : {}),
    status: task.status,
    statusLabel:
      task.status === "completed"
        ? t("todayVm.statusCompleted")
        : task.status === "cancelled"
          ? t("todayVm.cancelled")
          : t("todayVm.statusOpen"),
    category: task.category,
    categoryLabel: t(categoryLabelKeys[task.category]),
    ...(task.plannedDate ? { plannedDate: task.plannedDate } : {}),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(text(task.createdAt) && Number.isFinite(Date.parse(task.createdAt)) ? { createdAt: task.createdAt } : {}),
    ...(Object.hasOwn(sourceLabels, task.source) ? { sourceLabel: sourceLabels[task.source] } : {}),
    ...(text(task.relatedContactId) ? { relatedContactId: task.relatedContactId } : {}),
    ...(text(task.relatedEventId) ? { relatedEventId: task.relatedEventId } : {}),
    ...(text(task.sourceNoteId) && Number.isSafeInteger(task.sourceNoteVersion) && Number(task.sourceNoteVersion) >= 1
      ? { sourceNoteId: task.sourceNoteId, sourceNoteVersion: Number(task.sourceNoteVersion) }
      : {}),
    priority: task.priority,
    updatedAt: task.updatedAt,
  };
}

const activityLabelKeys: Readonly<Record<string, MessageKey>> = {
  created: "todayVm.activityCreated",
  updated: "todayVm.activityUpdated",
  rescheduled: "todayVm.activityRescheduled",
  completed: "todayVm.activityCompleted",
  reopened: "todayVm.activityReopened",
  cancelled: "todayVm.activityCancelled",
  deleted: "todayVm.activityDeleted",
};

export function taskActivitiesToView(payload: unknown, timeZone = "Asia/Tokyo", language: OrbitLanguage = "zh"): TaskActivityView[] {
  const root = isRecord(payload) ? payload : {};
  if (!Array.isArray(root.activities)) return [];
  return root.activities.flatMap((value): TaskActivityView[] => {
    if (!isRecord(value)) return [];
    const id = text(value.id);
    const occurredAt = text(value.occurredAt);
    const labelKey = activityLabelKeys[String(value.type)];
    if (!id || !occurredAt || !labelKey || !Number.isFinite(Date.parse(occurredAt))) {
      return [];
    }
    return [{ id, label: createTranslator(language)(labelKey), dateLabel: dateTimeLabel(occurredAt, timeZone, language) }];
  });
}
