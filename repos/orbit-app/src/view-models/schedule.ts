import { localParts, resolveLocalDateTime } from "../time/date-time";
import * as holidayJp from "@holiday-jp/holiday_jp";
import { eventsToSummaries } from "./events";
import type { FollowupTaskContract } from "../api/contract/followups";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type OrbitTranslator } from "../i18n/messages";

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
  endDateKey?: string;
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

function dueLabel(task: Record<string, unknown>, t: OrbitTranslator): string {
  const dueAt = taskField(task, "dueAt");
  if (dueAt) {
    return dueAt;
  }

  const dueInDays = numberField(task, "dueInDays");
  if (dueInDays === null) {
    return t("scheduleVm.tbd");
  }

  if (dueInDays === 0) {
    return t("scheduleVm.today");
  }

  if (dueInDays === 1) {
    return t("scheduleVm.tomorrow");
  }

  return t("scheduleVm.daysLater", { count: dueInDays });
}

function localeTag(language: OrbitLanguage): string {
  return language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
}

function dateParts(value: string, timeZone = "Asia/Tokyo", language: OrbitLanguage = "zh"):
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
    timeZone,
    year: "numeric"
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const normalizedWeekday = new Intl.DateTimeFormat(localeTag(language), { timeZone, weekday: "short" }).format(date);
  const month = partValue("month");
  const day = partValue("day");
  const year = partValue("year");
  const time = [partValue("hour"), partValue("minute")]
    .filter(Boolean)
    .join(":");

  return {
    dateKey: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    dayLabel: language === "zh" ? `${month}月${day}日 ${normalizedWeekday}`.trim() : new Intl.DateTimeFormat(localeTag(language), { day: "numeric", month: "short", timeZone, weekday: "short" }).format(date),
    monthLabel: language === "zh" ? `${year}年${month}月` : new Intl.DateTimeFormat(localeTag(language), { month: "long", timeZone, year: "numeric" }).format(date),
    timeLabel: time
  };
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokyoDatePrefix(value: Date, timeZone = "Asia/Tokyo"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(value);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("year")}-${partValue("month")}-${partValue("day")}`;
}

function todayTimestampWithTime(now: Date, timeLabel: string, timeZone: string): string {
  return resolveLocalDateTime(tokyoDatePrefix(now, timeZone), timeLabel || "09:00", timeZone) ?? "";
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

function priorityLabel(task: Record<string, unknown>, t: OrbitTranslator): string {
  const priority = taskField(task, "priority", "follow-up")
    .replace(/[_-]+/gu, " ")
    .trim()
    .toLowerCase();

  const labels: Record<string, string> = {
    follow_up: t("scheduleVm.pendingReview"),
    high: t("scheduleVm.priorityHigh"),
    low: t("scheduleVm.priorityLow"),
    this_week: t("scheduleVm.thisWeek"),
    today: t("scheduleVm.pendingReview"),
    tomorrow: t("scheduleVm.tomorrow")
  };

  return labels[priority] ?? t("scheduleVm.tbd");
}

function contactNameFor(task: Record<string, unknown>, t: OrbitTranslator): string {
  return taskField(task, "contactName", t("scheduleVm.contact"));
}

function taskTitle(task: Record<string, unknown>, t: OrbitTranslator): string {
  return stringField(task, "title") || t("scheduleVm.contactNamed", { name: t.literal(contactNameFor(task, t)) });
}

function recommendedAction(task: Record<string, unknown>, t: OrbitTranslator): string {
  const value = taskField(task, "recommendedAction");

  if (!value && stringField(task, "notes")) {
    return stringField(task, "notes");
  }

  if (!value || /\bcontact[_:-]?\d+|review follow-up\b/i.test(value)) {
    return t("scheduleVm.contactNext", { name: t.literal(contactNameFor(task, t)) });
  }

  return value;
}

function taskToScheduleItem(task: Record<string, unknown>, timeZone = "Asia/Tokyo", language: OrbitLanguage = "zh"): ScheduleItem {
  const t = createTranslator(language);
  const rawDueAt = taskField(task, "dueAt");
  const formatted = rawDueAt ? dateParts(rawDueAt, timeZone, language) : null;
  const fallbackDue = dueLabel(task, t);
  const dueAt = formatted
    ? `${formatted.dayLabel} ${formatted.timeLabel}`
    : fallbackDue;

  return {
    contactName: contactNameFor(task, t),
    dayLabel: formatted?.dayLabel ?? fallbackDue,
    dueAt,
    id: taskField(task, "taskId", stringField(task, "id", "task")),
    monthLabel: formatted?.monthLabel ?? "",
    organization: taskField(task, "organization"),
    priority: priorityLabel(task, t),
    recommendedAction: recommendedAction(task, t),
    timeLabel: formatted?.timeLabel ?? "",
    title: taskTitle(task, t)
  };
}

export function tasksToScheduleItems(data: unknown, timeZone = "Asia/Tokyo", language: OrbitLanguage = "zh"): ScheduleItem[] {
  return listFromPayload(data, "tasks")
    .filter(isRecord)
    .map(task => taskToScheduleItem(task, timeZone, language));
}

function eventStatusLabel(value: string, t: OrbitTranslator): string {
  const normalized = value.trim().toLowerCase();

  if (normalized === "cancelled" || normalized === "canceled") {
    return t("todayVm.cancelled");
  }

  if (normalized === "completed" || normalized === "ended") {
    return t("todayVm.ended");
  }

  if (normalized === "confirmed" || normalized === "scheduled") {
    return t("schedulePreview.statusConfirmed");
  }

  if (normalized === "active" || normalized === "live") {
    return t("todayVm.ongoing");
  }

  return value || t("scheduleVm.tbd");
}

function shouldShowEvent(event: Record<string, unknown>, now: number): boolean {
  const status = stringField(event, "status", "scheduled").trim().toLowerCase();
  if (["cancelled", "canceled", "completed", "ended"].includes(status)) {
    return false;
  }

  const startsAt = timestamp(stringField(event, "startsAt"));
  return startsAt === null || startsAt >= now || status === "active" || status === "live";
}

function followupTimelineItems(
  tasks: unknown,
  now: Date,
  limit = maxTimelineFollowups,
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = "zh"
): TimelineItemWithSort[] {
  const t = createTranslator(language);
  return listFromPayload(tasks, "tasks")
    .filter(isRecord)
    .map((task) => {
      const item = taskToScheduleItem(task, timeZone, language);
      const plannedDate = stringField(task, "plannedDate");
      const calendarOnly = !taskField(task, "dueAt") && /^\d{4}-\d{2}-\d{2}$/.test(plannedDate) ? dateParts(`${plannedDate}T12:00:00Z`, "UTC", language) : null;
      const rawDueAt = taskField(task, "dueAt");
      const normalizedDueAt = shouldNormalizeTaskToToday(task, rawDueAt, now)
        ? todayTimestampWithTime(now, item.timeLabel, timeZone)
        : rawDueAt;
      const normalizedDate = normalizedDueAt ? dateParts(normalizedDueAt, timeZone, language) : null;
      const sortAt =
        timestamp(normalizedDueAt) ??
        timestamp(rawDueAt) ??
        Number.MAX_SAFE_INTEGER;

      return {
        actionLabel: stringField(task, "id") ? t("scheduleVm.handleTask") : t("scheduleVm.viewSuggestion"),
        dateKey: calendarOnly?.dateKey ?? normalizedDate?.dateKey ?? "",
        dayLabel: calendarOnly?.dayLabel ?? normalizedDate?.dayLabel ?? item.dayLabel,
        detail: [item.recommendedAction, stringField(task, "location")].filter(Boolean).join(" · "),
        ...(stringField(task, "location") ? { location: stringField(task, "location") } : {}),
        durationMinutes: 30,
        href: stringField(task, "id")
          ? `/tasks/${encodeURIComponent(stringField(task, "id"))}`
          : "/tasks?scope=relationship",
        id: item.id,
        kind: "followup" as const,
        monthLabel: calendarOnly?.monthLabel ?? normalizedDate?.monthLabel ?? item.monthLabel,
        reason: item.recommendedAction,
        sortAt,
        statusLabel: item.priority,
        subtitle: [item.organization || (stringField(task, "category") === "relationship" ? t("scheduleVm.relationshipTask") : t("scheduleVm.task")), stringField(task, "location")].filter(Boolean).join(" · "),
        timeLabel: calendarOnly ? "" : normalizedDate?.timeLabel ?? item.timeLabel,
        title: item.title
      };
    })
    .sort((left, right) => left.sortAt - right.sortAt)
    .slice(0, limit);
}

function canonicalScheduleTimelineItems(scheduleItems: unknown, timeZone: string, language: OrbitLanguage): TimelineItemWithSort[] {
  const t = createTranslator(language);
  return listFromPayload(scheduleItems, "scheduleItems")
    .filter(isRecord)
    .filter((item) => stringField(item, "state") !== "cancelled")
    .flatMap((item): TimelineItemWithSort[] => {
      const kindValue = stringField(item, "kind");
      const kind: Exclude<ScheduleTimelineItemKind, "followup"> =
        kindValue === "meeting" || kindValue === "personal" ? kindValue : "event";
      const rawStartsAt = stringField(item, "startsAt");
      const startsAt = timestamp(rawStartsAt);
      const formatted = rawStartsAt ? dateParts(rawStartsAt, timeZone, language) : null;
      const rawEndsAt = stringField(item, "endsAt");
      const endsAt = timestamp(rawEndsAt);
      if (startsAt === null || !formatted) return [];
      const id = stringField(item, "id");
      const sourceId = stringField(item, "sourceId");
      const location = stringField(item, "location");
      const labels = kind === "meeting"
        ? { action: t("scheduleVm.viewMeeting"), reason: t("scheduleVm.meetingReason"), subtitle: location || t("scheduleVm.meeting") }
        : kind === "personal"
          ? { action: t("scheduleVm.viewSchedule"), reason: t("scheduleVm.personalReason"), subtitle: location || t("scheduleVm.personalSchedule") }
          : { action: t("scheduleVm.viewEvent"), reason: t("scheduleVm.eventReason"), subtitle: location || t("scheduleVm.eventSchedule") };
      return [{
        actionLabel: labels.action,
        dateKey: formatted.dateKey,
        ...(endsAt !== null && endsAt > startsAt ? { endDateKey: localParts(endsAt - 1, timeZone).date } : {}),
        dayLabel: formatted.dayLabel,
        detail: [formatted.timeLabel, location].filter(Boolean).join(" · "),
        durationMinutes: endsAt !== null && endsAt > startsAt
          ? Math.max(30, Math.min(240, Math.round((endsAt - startsAt) / 60_000)))
          : 60,
        href: kind === "event"
          ? `/schedule/events/${encodeURIComponent(sourceId)}`
          : kind === "meeting"
            ? id === `schedule:${sourceId}`
              ? `/schedule/meetings/${encodeURIComponent(sourceId)}?source=appointment`
              : `/schedule/meetings/${encodeURIComponent(id)}?source=schedule`
            : `/schedule/personal/${encodeURIComponent(id)}`,
        id,
        kind,
        ...(location ? { location } : {}),
        monthLabel: formatted.monthLabel,
        reason: labels.reason,
        sortAt: startsAt,
        statusLabel: stringField(item, "state") === "ongoing" ? t("todayVm.ongoing") : t("scheduleVm.scheduled"),
        subtitle: labels.subtitle,
        timeLabel: formatted.timeLabel,
        title: stringField(item, "title", t("scheduleVm.schedule")),
      }];
    });
}

function eventTimelineItems(
  events: unknown,
  now: Date,
  includePastEvents = false,
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = "zh"
): TimelineItemWithSort[] {
  const t = createTranslator(language);
  const summaryById = new Map(
    eventsToSummaries(events, timeZone).map((event) => [event.id, event])
  );

  return listFromPayload(events, "events")
    .filter(isRecord)
    .filter(
      (event) => includePastEvents || shouldShowEvent(event, now.getTime())
    )
    .map((event) => {
      const rawStartsAt = stringField(event, "startsAt");
      const rawEndsAt = stringField(event, "endsAt");
      const formatted = rawStartsAt ? dateParts(rawStartsAt, timeZone, language) : null;
      const startsAt = timestamp(rawStartsAt) ?? Number.MAX_SAFE_INTEGER;
      const endsAt = timestamp(rawEndsAt);
      const durationMinutes =
        endsAt !== null && startsAt !== Number.MAX_SAFE_INTEGER && endsAt > startsAt
          ? Math.max(30, Math.min(240, Math.round((endsAt - startsAt) / 60_000)))
          : 90;
      const id = stringField(event, "id", "event");
      const summary = summaryById.get(id);
      const title = summary?.title ?? t("scheduleVm.event");
      const location =
        summary?.location ||
        stringField(event, "venue") ||
        stringField(event, "location");

      return {
        actionLabel: t("scheduleVm.viewEvent"),
        ...(summary?.coverPath ? { coverPath: summary.coverPath } : {}),
        dateKey: formatted?.dateKey ?? "",
        ...(endsAt !== null && endsAt > startsAt ? { endDateKey: localParts(endsAt - 1, timeZone).date } : {}),
        dayLabel: formatted?.dayLabel ?? t("scheduleVm.timeTbd"),
        detail: [
          formatted?.timeLabel ? t("scheduleVm.eventTime", { time: formatted.timeLabel }) : "",
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
        reason: t("scheduleVm.eventPreparation"),
        sortAt: startsAt,
        statusLabel:
          summary?.status ??
          eventStatusLabel(stringField(event, "status", "scheduled"), t),
        subtitle: location || t("scheduleVm.eventSchedule"),
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
    ...(item.endDateKey ? { endDateKey: item.endDateKey } : {}),
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

function timelineSections(items: TimelineItemWithSort[], t: OrbitTranslator): ScheduleTimelineSection[] {
  const sections = new Map<string, ScheduleTimelineSection>();

  for (const item of items) {
    const id = sectionId(item);
    const existing = sections.get(id);
    const publicItem = publicTimelineItem(item);

    if (existing) {
      existing.items.push(publicItem);
      existing.detail = t("scheduleVm.itemCount", { count: existing.items.length });
    } else {
      sections.set(id, {
        detail: t("scheduleVm.itemCount", { count: 1 }),
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
  timeZone: string;
  language: OrbitLanguage;
}): string {
  const today = dateParts(input.now.toISOString(), input.timeZone, input.language)?.dayLabel;
  const t = createTranslator(input.language);
  return t(input.sections[0]?.title === today ? "scheduleVm.summaryToday" : "scheduleVm.summaryRecent", { tasks: input.followupCount, events: input.eventCount });
}

export function scheduleToTimelineView({
  events,
  now = new Date(),
  tasks,
  timeZone = "Asia/Tokyo",
  language = "zh"
}: {
  events: unknown;
  now?: Date;
  tasks: unknown;
  timeZone?: string;
  language?: OrbitLanguage;
}): ScheduleTimelineView {
  const t = createTranslator(language);
  const followups = followupTimelineItems(tasks, now, maxTimelineFollowups, timeZone, language);
  const eventItems = eventTimelineItems(events, now, false, timeZone, language);
  const items = [...followups, ...eventItems].sort((left, right) => {
    if (left.sortAt !== right.sortAt) {
      return left.sortAt - right.sortAt;
    }

    return left.kind.localeCompare(right.kind);
  });
  const sections = timelineSections(items, t);

  return {
    emptyMessage: t("scheduleVm.emptyMessage"),
    emptyTitle: t("scheduleVm.emptyTitle"),
    eventHighlights: eventItems
      .sort((left, right) => left.sortAt - right.sortAt)
      .slice(0, 2)
      .map(publicTimelineItem),
    sections,
    stats: [
      { label: t("scheduleVm.statTasks"), value: String(followups.length) },
      { label: t("scheduleVm.statEvents"), value: String(eventItems.length) },
      { label: t("scheduleVm.statDates"), value: String(sections.length) }
    ],
    summary: summaryCopy({
      eventCount: eventItems.length,
      followupCount: followups.length,
      now,
      sections, timeZone, language
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
  dateKey: string,
  language: OrbitLanguage = "zh"
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
          holidayName: language === "zh"
            ? japaneseHolidayNameZh[holiday.name] ?? createTranslator(language)("scheduleVm.japanHoliday")
            : holiday.name || createTranslator(language)("scheduleVm.japanHoliday")
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

function weekdayLabelFor(dateKey: string, language: OrbitLanguage): string {
  const date = dateForKey(dateKey);
  return date ? new Intl.DateTimeFormat(localeTag(language), { timeZone: "UTC", weekday: "short" }).format(date) : "";
}

function startOfWeek(dateKey: string, weekStartsOn: 0 | 1 = 0): string {
  const date = dateForKey(dateKey);

  if (!date) {
    return dateKey;
  }

  const offset = -((date.getUTCDay() - weekStartsOn + 7) % 7);
  return shiftScheduleDateKey(dateKey, offset);
}

function shortDateLabel(dateKey: string, language: OrbitLanguage): string {
  const parts = dateKey.split("-");
  if (language === "zh") return `${Number(parts[1])}月${Number(parts[2])}日`;
  const date = dateForKey(dateKey);
  return date ? new Intl.DateTimeFormat(localeTag(language), { day: "numeric", month: "short", timeZone: "UTC" }).format(date) : dateKey;
}

export function scheduleToCalendarView({
  events,
  now = new Date(),
  scheduleItems = { scheduleItems: [] },
  selectedDateKey,
  tasks,
  weekStartsOn = 0,
  timeZone = "Asia/Tokyo",
  language = "zh"
}: {
  events: unknown;
  now?: Date;
  scheduleItems?: unknown;
  selectedDateKey?: string;
  tasks: unknown;
  weekStartsOn?: 0 | 1;
  timeZone?: string;
  language?: OrbitLanguage;
}): ScheduleCalendarView {
  const t = createTranslator(language);
  const todayDateKey = tokyoDatePrefix(now, timeZone);
  const selected = dateForKey(selectedDateKey ?? "")
    ? (selectedDateKey as string)
    : todayDateKey;
  const weekStart = startOfWeek(selected, weekStartsOn);
  const timeline = scheduleToTimelineView({ events, now, tasks, timeZone, language });
  const items = [
    ...followupTimelineItems(tasks, now, Number.MAX_SAFE_INTEGER, timeZone, language),
    ...eventTimelineItems(events, now, true, timeZone, language),
    ...canonicalScheduleTimelineItems(scheduleItems, timeZone, language)
  ]
    .sort((left, right) => left.sortAt - right.sortAt)
    .map(publicTimelineItem);
  const days = Array.from({ length: 7 }, (_, index) => {
    const dateKey = shiftScheduleDateKey(weekStart, index);
    const dateItems = items.filter((item) => item.dateKey === dateKey || (item.endDateKey && item.dateKey < dateKey && item.endDateKey >= dateKey));
    const calendarDateInfo = japanCalendarDateInfo(dateKey, language);

    return {
      dateKey,
      dayNumber: String(Number(dateKey.split("-")[2])),
      ...calendarDateInfo,
      isSelected: dateKey === selected,
      isToday: dateKey === todayDateKey,
      items: dateItems,
      weekdayLabel: weekdayLabelFor(dateKey, language)
    };
  });
  const selectedDay = days.find((day) => day.isSelected);
  const selectedItems = selectedDay?.items ?? [];
  const selectedHolidayName = selectedDay?.holidayName;
  const selectedParts = dateParts(`${selected}T12:00:00+09:00`, "Asia/Tokyo", language);
  const weekEnd = shiftScheduleDateKey(weekStart, 6);

  return {
    allDayItems: selectedItems.filter((item) => !item.timeLabel),
    days,
    emptyMessage: timeline.emptyMessage,
    emptyTitle: timeline.emptyTitle,
    items,
    monthLabel: selectedParts?.monthLabel ?? "",
    selectedDateKey: selected,
    selectedDayLabel: selectedParts?.dayLabel ?? t("scheduleVm.timeTbd"),
    ...(selectedHolidayName ? { selectedHolidayName } : {}),
    timedItems: selectedItems.filter((item) => item.timeLabel),
    weekLabel: `${shortDateLabel(weekStart, language)} - ${shortDateLabel(weekEnd, language)}`
  };
}
