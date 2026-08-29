import * as holidayJp from "@holiday-jp/holiday_jp";
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

export type ScheduleTimelineItemKind = "event" | "followup" | "meeting" | "personal";

export interface ScheduleTimelineItem {
  actionLabel: string;
  coverPath?: string;
  dateKey: string;
  dayLabel: string;
  detail: string;
  durationMinutes: number;
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

export interface ScheduleCalendarDay {
  dateKey: string;
  dayNumber: string;
  holidayName?: string;
  isHoliday: boolean;
  isSelected: boolean;
  isSaturday: boolean;
  isSunday: boolean;
  isToday: boolean;
  items: ScheduleTimelineItem[];
  weekdayLabel: string;
}

export interface ScheduleCalendarView {
  allDayItems: ScheduleTimelineItem[];
  days: ScheduleCalendarDay[];
  emptyMessage: string;
  emptyTitle: string;
  items: ScheduleTimelineItem[];
  monthLabel: string;
  selectedDateKey: string;
  selectedDayLabel: string;
  selectedHolidayName?: string;
  timedItems: ScheduleTimelineItem[];
  weekLabel: string;
}

export interface JapaneseCalendarDateInfo {
  holidayName?: string;
  isHoliday: boolean;
  isSaturday: boolean;
  isSunday: boolean;
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
      dateKey: string;
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
    dateKey: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
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
  return stringField(task, "title") || `联系 ${contactNameFor(task)}`;
}

function recommendedAction(task: Record<string, unknown>): string {
  const value = taskField(task, "recommendedAction");

  if (!value && stringField(task, "notes")) {
    return stringField(task, "notes");
  }

  if (!value || /\bcontact[_:-]?\d+|review follow-up\b/i.test(value)) {
    return `联系 ${contactNameFor(task)}，确认下一步。`;
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
  now: Date,
  limit = maxTimelineFollowups
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
        actionLabel: "处理待办",
        dateKey: normalizedDate?.dateKey ?? "",
        dayLabel: normalizedDate?.dayLabel ?? item.dayLabel,
        detail: item.recommendedAction,
        durationMinutes: 30,
        href: stringField(task, "id")
          ? `/tasks/${encodeURIComponent(stringField(task, "id"))}`
          : "/followups",
        id: item.id,
        kind: "followup" as const,
        monthLabel: normalizedDate?.monthLabel ?? item.monthLabel,
        reason: item.recommendedAction,
        sortAt,
        statusLabel: item.priority,
        subtitle: item.organization || "人脉待办",
        timeLabel: normalizedDate?.timeLabel ?? item.timeLabel,
        title: item.title
      };
    })
    .sort((left, right) => left.sortAt - right.sortAt)
    .slice(0, limit);
}

function canonicalScheduleTimelineItems(scheduleItems: unknown): TimelineItemWithSort[] {
  return listFromPayload(scheduleItems, "scheduleItems")
    .filter(isRecord)
    .filter((item) => stringField(item, "state") !== "cancelled")
    .flatMap((item): TimelineItemWithSort[] => {
      const kindValue = stringField(item, "kind");
      const kind: Exclude<ScheduleTimelineItemKind, "followup"> =
        kindValue === "meeting" || kindValue === "personal" ? kindValue : "event";
      const rawStartsAt = stringField(item, "startsAt");
      const startsAt = timestamp(rawStartsAt);
      const formatted = rawStartsAt ? dateParts(rawStartsAt) : null;
      const rawEndsAt = stringField(item, "endsAt");
      const endsAt = timestamp(rawEndsAt);
      if (startsAt === null || !formatted) return [];
      const id = stringField(item, "id");
      const sourceId = stringField(item, "sourceId");
      const location = stringField(item, "location");
      const labels = kind === "meeting"
        ? { action: "查看会面", reason: "会面前确认目标、参与人和需要准备的材料。", subtitle: location || "会面" }
        : kind === "personal"
          ? { action: "查看日程", reason: "这是你安排的个人日程。", subtitle: location || "个人日程" }
          : { action: "查看活动安排", reason: "先确认活动时间、地点和参会目标。", subtitle: location || "活动安排" };
      return [{
        actionLabel: labels.action,
        dateKey: formatted.dateKey,
        dayLabel: formatted.dayLabel,
        detail: [formatted.timeLabel, location].filter(Boolean).join(" · "),
        durationMinutes: endsAt !== null && endsAt > startsAt
          ? Math.max(30, Math.min(240, Math.round((endsAt - startsAt) / 60_000)))
          : 60,
        href: kind === "event" && sourceId.startsWith("event")
          ? `/schedule/events/${encodeURIComponent(sourceId)}`
          : "/schedule",
        id,
        kind,
        ...(location ? { location } : {}),
        monthLabel: formatted.monthLabel,
        reason: labels.reason,
        sortAt: startsAt,
        statusLabel: stringField(item, "state") === "ongoing" ? "进行中" : "已安排",
        subtitle: labels.subtitle,
        timeLabel: formatted.timeLabel,
        title: stringField(item, "title", "日程"),
      }];
    });
}

function eventTimelineItems(
  events: unknown,
  now: Date,
  includePastEvents = false
): TimelineItemWithSort[] {
  const summaryById = new Map(
    eventsToSummaries(events).map((event) => [event.id, event])
  );

  return listFromPayload(events, "events")
    .filter(isRecord)
    .filter(
      (event) => includePastEvents || shouldShowEvent(event, now.getTime())
    )
    .map((event) => {
      const rawStartsAt = stringField(event, "startsAt");
      const rawEndsAt = stringField(event, "endsAt");
      const formatted = rawStartsAt ? dateParts(rawStartsAt) : null;
      const startsAt = timestamp(rawStartsAt) ?? Number.MAX_SAFE_INTEGER;
      const endsAt = timestamp(rawEndsAt);
      const durationMinutes =
        endsAt !== null && startsAt !== Number.MAX_SAFE_INTEGER && endsAt > startsAt
          ? Math.max(30, Math.min(240, Math.round((endsAt - startsAt) / 60_000)))
          : 90;
      const id = stringField(event, "id", "event");
      const summary = summaryById.get(id);
      const title = summary?.title ?? "活动";
      const location =
        summary?.location ||
        stringField(event, "venue") ||
        stringField(event, "location");

      return {
        actionLabel: "查看活动安排",
        ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
        dateKey: formatted?.dateKey ?? "",
        dayLabel: formatted?.dayLabel ?? "时间待定",
        detail: [
          formatted?.timeLabel ? `活动时间 ${formatted.timeLabel}` : "",
          location
        ]
          .filter(Boolean)
          .join(" · "),
        durationMinutes,
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
    dateKey: item.dateKey,
    dayLabel: item.dayLabel,
    detail: item.detail,
    durationMinutes: item.durationMinutes,
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

  return `${prefix}有 ${input.followupCount} 项待办和 ${input.eventCount} 场活动需要判断。`;
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
    emptyMessage: "待办、活动和需要提前准备的人脉事项会出现在这里。",
    emptyTitle: "暂无安排",
    eventHighlights: eventItems
      .sort((left, right) => left.sortAt - right.sortAt)
      .slice(0, 2)
      .map(publicTimelineItem),
    sections,
    stats: [
      { label: "待办", value: String(followups.length) },
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

function dateForKey(dateKey: string): Date | null {
  const parsed = Date.parse(`${dateKey}T12:00:00+09:00`);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

const japaneseHolidayNameZh: Record<string, string> = {
  "こどもの日": "儿童节",
  "みどりの日": "绿之日",
  "スポーツの日": "体育日",
  "休日": "法定休息日",
  "元日": "元旦",
  "勤労感謝の日": "劳动感谢日",
  "天皇誕生日": "天皇诞辰日",
  "山の日": "山之日",
  "建国記念の日": "建国纪念日",
  "成人の日": "成人日",
  "振替休日": "补休日",
  "敬老の日": "敬老日",
  "文化の日": "文化日",
  "春分の日": "春分日",
  "海の日": "海之日",
  "秋分の日": "秋分日",
  "憲法記念日": "宪法纪念日",
  "昭和の日": "昭和日"
};

export function japanCalendarDateInfo(
  dateKey: string
): JapaneseCalendarDateInfo {
  const date = dateForKey(dateKey);

  if (!date) {
    return {
      isHoliday: false,
      isSaturday: false,
      isSunday: false
    };
  }

  const holiday = holidayJp.between(date, date)[0];
  const weekday = date.getUTCDay();

  return {
    ...(holiday
      ? {
          holidayName:
            japaneseHolidayNameZh[holiday.name] ?? "日本法定节假日"
        }
      : {}),
    isHoliday: Boolean(holiday),
    isSaturday: weekday === 6,
    isSunday: weekday === 0
  };
}

export function shiftScheduleDateKey(dateKey: string, days: number): string {
  const date = dateForKey(dateKey);

  if (!date) {
    return dateKey;
  }

  date.setUTCDate(date.getUTCDate() + days);
  return tokyoDatePrefix(date);
}

export function shiftScheduleMonthDateKey(
  dateKey: string,
  months: number
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateKey);

  if (!dateForKey(dateKey) || !match) {
    return dateKey;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const targetDay = Math.min(
    day,
    new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  );

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function weekdayLabelFor(dateKey: string): string {
  return dateParts(`${dateKey}T12:00:00+09:00`)?.dayLabel.split(" ")[1] ?? "";
}

function startOfWeek(dateKey: string): string {
  const date = dateForKey(dateKey);

  if (!date) {
    return dateKey;
  }

  const sundayOffset = -date.getUTCDay();
  return shiftScheduleDateKey(dateKey, sundayOffset);
}

function shortDateLabel(dateKey: string): string {
  const parts = dateKey.split("-");
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

export function scheduleToCalendarView({
  events,
  now = new Date(),
  scheduleItems = { scheduleItems: [] },
  selectedDateKey,
  tasks
}: {
  events: unknown;
  now?: Date;
  scheduleItems?: unknown;
  selectedDateKey?: string;
  tasks: unknown;
}): ScheduleCalendarView {
  const todayDateKey = tokyoDatePrefix(now);
  const selected = dateForKey(selectedDateKey ?? "")
    ? (selectedDateKey as string)
    : todayDateKey;
  const weekStart = startOfWeek(selected);
  const timeline = scheduleToTimelineView({ events, now, tasks });
  const items = [
    ...followupTimelineItems(tasks, now, Number.MAX_SAFE_INTEGER),
    ...eventTimelineItems(events, now, true),
    ...canonicalScheduleTimelineItems(scheduleItems)
  ]
    .sort((left, right) => left.sortAt - right.sortAt)
    .map(publicTimelineItem);
  const days = Array.from({ length: 7 }, (_, index) => {
    const dateKey = shiftScheduleDateKey(weekStart, index);
    const dateItems = items.filter((item) => item.dateKey === dateKey);
    const calendarDateInfo = japanCalendarDateInfo(dateKey);

    return {
      dateKey,
      dayNumber: String(Number(dateKey.split("-")[2])),
      ...calendarDateInfo,
      isSelected: dateKey === selected,
      isToday: dateKey === todayDateKey,
      items: dateItems,
      weekdayLabel: weekdayLabelFor(dateKey)
    };
  });
  const selectedDay = days.find((day) => day.isSelected);
  const selectedItems = selectedDay?.items ?? [];
  const selectedHolidayName = selectedDay?.holidayName;
  const selectedParts = dateParts(`${selected}T12:00:00+09:00`);
  const weekEnd = shiftScheduleDateKey(weekStart, 6);

  return {
    allDayItems: selectedItems.filter((item) => !item.timeLabel),
    days,
    emptyMessage: timeline.emptyMessage,
    emptyTitle: timeline.emptyTitle,
    items,
    monthLabel: selectedParts?.monthLabel ?? "",
    selectedDateKey: selected,
    selectedDayLabel: selectedParts?.dayLabel ?? "时间待定",
    ...(selectedHolidayName ? { selectedHolidayName } : {}),
    timedItems: selectedItems.filter((item) => item.timeLabel),
    weekLabel: `${shortDateLabel(weekStart)} - ${shortDateLabel(weekEnd)}`
  };
}
