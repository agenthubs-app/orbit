import { eventsToSummaries } from "./events";
import type { FollowupTaskContract } from "../api/contract/followups";

export interface ScheduleItem {
  contactName: string;
  dayLabel: string;
  dueAt: string;
  id: string;
  monthLabel: string;
  organization: string;
  priority: string;
  recommendedAction: string;
  timeLabel: string;
  title: string;
}

export type ScheduleTimelineItemKind = "event" | "followup";

export interface ScheduleTimelineItem {
  actionLabel: string;
  coverPath?: string;
  dayLabel: string;
  detail: string;
  href: string;
  id: string;
  kind: ScheduleTimelineItemKind;
  location?: string;
  participantCountLabel?: string;
  reason: string;
  statusLabel: string;
  subtitle: string;
  timeLabel: string;
  title: string;
}

export interface ScheduleTimelineSection {
  detail: string;
  id: string;
  items: ScheduleTimelineItem[];
  title: string;
}

export interface ScheduleTimelineView {
  emptyMessage: string;
  emptyTitle: string;
  eventHighlights: ScheduleTimelineItem[];
  sections: ScheduleTimelineSection[];
  stats: Array<{ label: string; value: string }>;
  summary: string;
}

interface TimelineItemWithSort extends ScheduleTimelineItem {
  monthLabel: string;
  sortAt: number;
}

const maxTimelineFollowups = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

// 字段名受跨端契约约束：服务端改名，这里立刻编译报错。
function taskField(
  record: Record<string, unknown>,
  fieldName: keyof FollowupTaskContract,
  fallback = ""
): string {
  return stringField(record, fieldName, fallback);
}

function numberField(
  record: Record<string, unknown>,
  fieldName: string
): number | null {
  const value = record[fieldName];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

function nestedStringField(
  record: Record<string, unknown>,
  parentField: string,
  fieldName: string
): string {
  const parent = record[parentField];
  return isRecord(parent) ? stringField(parent, fieldName) : "";
}

function dueLabel(task: Record<string, unknown>): string {
  const dueAt = taskField(task, "dueAt");
  if (dueAt) {
    return dueAt;
  }

  const dueInDays = numberField(task, "dueInDays");
  if (dueInDays === null) {
    return "待定";
  }

  if (dueInDays === 0) {
    return "今天";
  }

  if (dueInDays === 1) {
    return "明天";
  }

  return `${dueInDays} 天后`;
}

const enWeekdayToZh: Record<string, string> = {
  Fri: "周五",
  Mon: "周一",
  Sat: "周六",
  Sun: "周日",
  Thu: "周四",
  Tue: "周二",
  Wed: "周三",
};

function dateParts(value: string):
  | {
      dayLabel: string;
      monthLabel: string;
      timeLabel: string;
    }
  | null {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Tokyo",
    weekday: "short",
    year: "numeric"
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const normalizedWeekday = enWeekdayToZh[partValue("weekday")] ?? "";
  const month = partValue("month");
  const day = partValue("day");
  const year = partValue("year");
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return {
    dayLabel: `${month}月${day}日 ${normalizedWeekday}`.trim(),
    monthLabel: `${year}年${month}月`,
    timeLabel: time
  };
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokyoDatePrefix(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric"
  }).formatToParts(value);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

function todayTimestampWithTime(now: Date, timeLabel: string): string {
  return `${tokyoDatePrefix(now)}T${timeLabel || "09:00"}:00+09:00`;
}

function shouldNormalizeTaskToToday(
  task: Record<string, unknown>,
  rawDueAt: string,
  now: Date
): boolean {
  const dueInDays = numberField(task, "dueInDays");
  const priority = taskField(task, "priority").trim().toLowerCase();

  if (dueInDays !== 0 && priority !== "today") {
    return false;
  }

  const dueTimestamp = timestamp(rawDueAt);
  return dueTimestamp === null || dueTimestamp < now.getTime();
}

function priorityLabel(task: Record<string, unknown>): string {
  const priority = taskField(task, "priority", "follow-up")
    .replace(/[_-]+/gu, " ")
    .trim()
    .toLowerCase();

  const labels: Record<string, string> = {
    follow_up: "待确认",
    high: "优先",
    low: "稍后",
    this_week: "本周",
    today: "待确认",
    tomorrow: "明天"
  };

  return labels[priority] ?? "待确认";
}

function contactNameFor(task: Record<string, unknown>): string {
  return taskField(task, "contactName", "联系人");
}

function taskTitle(task: Record<string, unknown>): string {
  return `跟进 ${contactNameFor(task)}`;
}

function recommendedAction(task: Record<string, unknown>): string {
  const value = taskField(task, "recommendedAction");

  if (!value || /\bcontact[_:-]?\d+|review follow-up\b/i.test(value)) {
    return `跟进 ${contactNameFor(task)} 的关系进展。`;
  }

  return value;
}

function taskToScheduleItem(task: Record<string, unknown>): ScheduleItem {
  const rawDueAt = taskField(task, "dueAt");
  const formatted = rawDueAt ? dateParts(rawDueAt) : null;
  const fallbackDue = dueLabel(task);
  const dueAt = formatted
    ? `${formatted.dayLabel} ${formatted.timeLabel}`
    : fallbackDue;

  return {
    contactName: contactNameFor(task),
    dayLabel: formatted?.dayLabel ?? fallbackDue,
    dueAt,
    id: taskField(task, "taskId", stringField(task, "id", "task")),
    monthLabel: formatted?.monthLabel ?? "",
    organization: taskField(task, "organization"),
    priority: priorityLabel(task),
    recommendedAction: recommendedAction(task),
    timeLabel: formatted?.timeLabel ?? "",
    title: taskTitle(task)
  };
}

export function tasksToScheduleItems(data: unknown): ScheduleItem[] {
  return listFromPayload(data, "tasks")
    .filter(isRecord)
    .map(taskToScheduleItem);
}

function segmentLooksChinese(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value) && !/[\u3040-\u30ff]/u.test(value);
}

function preferredChineseSegment(value: string): string {
  const markerMatch = /ZH:\s*([^/]+?)(?:\s+EN:|\s+JA:|$)/u.exec(value);
  if (markerMatch?.[1]?.trim()) {
    return markerMatch[1].trim();
  }

  const segments = value
    .split(/\s*\/\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.find(segmentLooksChinese) ?? value.trim();
}

function cleanEventDisplayText(value: string): string {
  return value.replace(/报名测试会/gu, "报名会").trim();
}

function eventTitle(event: Record<string, unknown>): string {
  const sourceLabel = nestedStringField(event, "sourceMetadata", "label");
  const rawTitle = sourceLabel || stringField(event, "title") || stringField(event, "name");
  return cleanEventDisplayText(preferredChineseSegment(rawTitle)) || "活动";
}

function eventStatusLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "cancelled" || normalized === "canceled") {
    return "已取消";
  }

  if (normalized === "completed" || normalized === "ended") {
    return "已结束";
  }

  if (normalized === "confirmed" || normalized === "scheduled") {
    return "已确认";
  }

  if (normalized === "active" || normalized === "live") {
    return "进行中";
  }

  return value || "待确认";
}

function shouldShowEvent(event: Record<string, unknown>, now: number): boolean {
  const status = eventStatusLabel(stringField(event, "status", "scheduled"));

  if (status === "已结束" || status === "已取消") {
    return false;
  }

  const startsAt = timestamp(stringField(event, "startsAt"));
  return startsAt === null || startsAt >= now || status === "进行中";
}

function followupTimelineItems(
  tasks: unknown,
  now: Date
): TimelineItemWithSort[] {
  return listFromPayload(tasks, "tasks")
    .filter(isRecord)
    .map((task) => {
      const item = taskToScheduleItem(task);
      const rawDueAt = taskField(task, "dueAt");
      const normalizedDueAt = shouldNormalizeTaskToToday(task, rawDueAt, now)
        ? todayTimestampWithTime(now, item.timeLabel)
        : rawDueAt;
      const normalizedDate = normalizedDueAt ? dateParts(normalizedDueAt) : null;
      const sortAt =
        timestamp(normalizedDueAt) ??
        timestamp(rawDueAt) ??
        Number.MAX_SAFE_INTEGER;

      return {
        actionLabel: "处理跟进",
        dayLabel: normalizedDate?.dayLabel ?? item.dayLabel,
        detail: item.recommendedAction,
        href: "/followups",
        id: item.id,
        kind: "followup" as const,
        monthLabel: normalizedDate?.monthLabel ?? item.monthLabel,
        reason: item.recommendedAction,
        sortAt,
        statusLabel: item.priority,
        subtitle: item.organization || "关系跟进",
        timeLabel: normalizedDate?.timeLabel ?? item.timeLabel,
        title: item.title
      };
    })
    .sort((left, right) => left.sortAt - right.sortAt)
    .slice(0, maxTimelineFollowups);
}

function eventTimelineItems(events: unknown, now: Date): TimelineItemWithSort[] {
  const summaryById = new Map(
    eventsToSummaries(events).map((event) => [event.id, event])
  );

  return listFromPayload(events, "events")
    .filter(isRecord)
    .filter((event) => shouldShowEvent(event, now.getTime()))
    .map((event) => {
      const rawStartsAt = stringField(event, "startsAt");
      const formatted = rawStartsAt ? dateParts(rawStartsAt) : null;
      const startsAt = timestamp(rawStartsAt) ?? Number.MAX_SAFE_INTEGER;
      const id = stringField(event, "id", "event");
      const title = eventTitle(event);
      const summary = summaryById.get(id);
      const location =
        summary?.location ||
        stringField(event, "venue") ||
        stringField(event, "location");

      return {
        actionLabel: "查看活动安排",
        ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
        dayLabel: formatted?.dayLabel ?? "时间待定",
        detail: [
          formatted?.timeLabel ? `活动时间 ${formatted.timeLabel}` : "",
          location
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/schedule/events/${encodeURIComponent(id)}`,
        id,
        kind: "event",
        ...(location ? { location } : {}),
        monthLabel: formatted?.monthLabel ?? "",
        ...(summary?.participantCountLabel
          ? { participantCountLabel: summary.participantCountLabel }
          : {}),
        reason: "先看活动时间、地点和参会目标，再决定要准备的介绍。",
        sortAt: startsAt,
        statusLabel:
          summary?.status ??
          eventStatusLabel(stringField(event, "status", "scheduled")),
        subtitle: location || "活动安排",
        timeLabel: formatted?.timeLabel ?? "",
        title
      };
    });
}

function sectionId(item: TimelineItemWithSort): string {
  return item.monthLabel ? `${item.monthLabel}-${item.dayLabel}` : item.dayLabel;
}

function publicTimelineItem(item: TimelineItemWithSort): ScheduleTimelineItem {
  return {
    actionLabel: item.actionLabel,
    ...(item.coverPath ? { coverPath: item.coverPath } : {}),
    dayLabel: item.dayLabel,
    detail: item.detail,
    href: item.href,
    id: item.id,
    kind: item.kind,
    ...(item.location ? { location: item.location } : {}),
    ...(item.participantCountLabel
      ? { participantCountLabel: item.participantCountLabel }
      : {}),
    reason: item.reason,
    statusLabel: item.statusLabel,
    subtitle: item.subtitle,
    timeLabel: item.timeLabel,
    title: item.title
  };
}

function timelineSections(items: TimelineItemWithSort[]): ScheduleTimelineSection[] {
  const sections = new Map<string, ScheduleTimelineSection>();

  for (const item of items) {
    const id = sectionId(item);
    const existing = sections.get(id);
    const publicItem = publicTimelineItem(item);

    if (existing) {
      existing.items.push(publicItem);
      existing.detail = `${existing.items.length} 项安排`;
    } else {
      sections.set(id, {
        detail: "1 项安排",
        id,
        items: [publicItem],
        title: item.dayLabel
      });
    }
  }

  return Array.from(sections.values());
}

function summaryCopy(input: {
  eventCount: number;
  followupCount: number;
  now: Date;
  sections: ScheduleTimelineSection[];
}): string {
  const today = dateParts(input.now.toISOString())?.dayLabel;
  const prefix = input.sections[0]?.title === today ? "今天" : "近期";

  return `${prefix}有 ${input.followupCount} 个跟进和 ${input.eventCount} 场活动需要判断。`;
}

export function scheduleToTimelineView({
  events,
  now = new Date(),
  tasks
}: {
  events: unknown;
  now?: Date;
  tasks: unknown;
}): ScheduleTimelineView {
  const followups = followupTimelineItems(tasks, now);
  const eventItems = eventTimelineItems(events, now);
  const items = [...followups, ...eventItems].sort((left, right) => {
    if (left.sortAt !== right.sortAt) {
      return left.sortAt - right.sortAt;
    }

    return left.kind.localeCompare(right.kind);
  });
  const sections = timelineSections(items);

  return {
    emptyMessage: "跟进、活动和需要提前准备的关系事项会出现在这里。",
    emptyTitle: "暂无安排",
    eventHighlights: eventItems
      .sort((left, right) => left.sortAt - right.sortAt)
      .slice(0, 2)
      .map(publicTimelineItem),
    sections,
    stats: [
      { label: "跟进", value: String(followups.length) },
      { label: "活动", value: String(eventItems.length) },
      { label: "日期", value: String(sections.length) }
    ],
    summary: summaryCopy({
      eventCount: eventItems.length,
      followupCount: followups.length,
      now,
      sections
    })
  };
}
