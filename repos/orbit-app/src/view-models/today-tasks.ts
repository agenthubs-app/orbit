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

const categoryLabels: Record<TaskCategory, string> = {
  relationship: "人脉",
  meeting: "会面",
  event: "活动",
  work: "工作",
  personal: "个人",
  other: "其他",
};

export interface TodayTaskRowView {
  id: string;
  title: string;
  categoryLabel: string;
  dueLabel: string;
  dueTone: "danger" | "muted" | "normal";
  priority: "normal" | "high";
}

export interface TaskListRowView extends TodayTaskRowView {
  dateLabel: string;
  notes?: string;
  status: "open" | "completed" | "cancelled";
  updatedAt: string;
}

export interface TaskDetailView {
  id: string;
  title: string;
  notes: string;
  status: TaskItemContract["status"];
  statusLabel: string;
  category: TaskCategory;
  categoryLabel: string;
  plannedDate?: string;
  dueAt?: string;
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
    actionLabel: "加入待办";
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

function tokyoParts(value: string) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    month: part("month"),
    weekday: part("weekday").replace("周", "周"),
  };
}

function dateLabel(date: string): string {
  const parts = tokyoParts(`${date}T12:00:00+09:00`);
  return `${parts.month}月${parts.day}日 ${parts.weekday}`;
}

function timeLabel(value: string): string {
  const parts = tokyoParts(value);
  return `${parts.hour}:${parts.minute}`;
}

function dateTimeLabel(value: string): string {
  const parts = tokyoParts(value);
  return `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
}

function taskDue(
  task: TaskItemContract,
  now: Date,
): Pick<TodayTaskRowView, "dueLabel" | "dueTone"> {
  if (task.dueAt) {
    if (Date.parse(task.dueAt) < now.getTime()) {
      return { dueLabel: "已逾期", dueTone: "danger" };
    }
    return { dueLabel: timeLabel(task.dueAt), dueTone: "normal" };
  }
  if (task.plannedDate) {
    return { dueLabel: "今天", dueTone: "muted" };
  }
  return { dueLabel: "", dueTone: "muted" };
}

function taskRow(task: TaskItemContract, now: Date): TodayTaskRowView {
  return {
    id: task.id,
    title: task.title,
    categoryLabel: categoryLabels[task.category],
    ...taskDue(task, now),
    priority: task.priority,
  };
}

export function todayToView(payload: unknown, now = new Date()): TodayView {
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
  const rawDate = text(root.date) ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
  }).format(now);

  return {
    dateLabel: dateLabel(rawDate),
    summary: `${tasks.length} 项待办 · ${schedule.length} 项日程`,
    tasks: tasks.map((item) => taskRow(item, now)),
    completedCount,
    completedLabel: `已完成 ${completedCount}`,
    suggestions: suggestions.map((item) => ({
      id: item.id,
      title: item.title,
      reason: item.reason,
      categoryLabel: categoryLabels[item.category],
      actionLabel: "加入待办",
    })),
    schedule: schedule.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.location ?? categoryLabels[item.category],
      kind: item.kind,
      sourceId: item.sourceId,
      stateLabel:
        item.state === "ended"
          ? "已结束"
          : item.state === "ongoing"
            ? "进行中"
            : item.state === "cancelled"
              ? "已取消"
              : timeLabel(item.startsAt),
    })),
  };
}

export function todayHomeSummary(
  payload: unknown,
  now = new Date(),
): TodayHomeSummaryView {
  const root = isRecord(payload) ? payload : {};
  const summary = isRecord(root.summary) ? root.summary : {};
  const today = todayToView(payload, now);
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

export function tasksToListView(
  payload: unknown,
  view: "open" | "completed",
  now = new Date(),
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
      ...taskRow(item, now),
      ...(item.notes ? { notes: item.notes } : {}),
      status: item.status,
      dateLabel: item.completedAt
        ? dateTimeLabel(item.completedAt)
        : item.dueAt
          ? dateTimeLabel(item.dueAt)
          : item.plannedDate
            ? dateLabel(item.plannedDate)
            : "未安排日期",
      updatedAt: item.updatedAt,
    }));
  return { items, view };
}

export function taskDetailToView(payload: unknown): TaskDetailView | null {
  const root = isRecord(payload) ? payload : {};
  const task = taskFrom(root.task);
  if (!task) return null;
  return {
    id: task.id,
    title: task.title,
    notes: task.notes ?? "",
    status: task.status,
    statusLabel:
      task.status === "completed"
        ? "已完成"
        : task.status === "cancelled"
          ? "已取消"
          : "待办",
    category: task.category,
    categoryLabel: categoryLabels[task.category],
    ...(task.plannedDate ? { plannedDate: task.plannedDate } : {}),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    priority: task.priority,
    updatedAt: task.updatedAt,
  };
}

const activityLabels: Readonly<Record<string, string>> = {
  created: "创建待办",
  updated: "修改待办",
  rescheduled: "调整日期",
  completed: "完成待办",
  reopened: "恢复待办",
  cancelled: "取消待办",
  deleted: "删除待办",
};

export function taskActivitiesToView(payload: unknown): TaskActivityView[] {
  const root = isRecord(payload) ? payload : {};
  if (!Array.isArray(root.activities)) return [];
  return root.activities.flatMap((value): TaskActivityView[] => {
    if (!isRecord(value)) return [];
    const id = text(value.id);
    const occurredAt = text(value.occurredAt);
    const label = activityLabels[String(value.type)];
    if (!id || !occurredAt || !label || !Number.isFinite(Date.parse(occurredAt))) {
      return [];
    }
    return [{ id, label, dateLabel: dateTimeLabel(occurredAt) }];
  });
}
