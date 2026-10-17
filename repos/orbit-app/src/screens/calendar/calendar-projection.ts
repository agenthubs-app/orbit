import type { OrbitLanguage } from "../../api/contract/language";
import { localParts } from "../../time/date-time";
import { personalScheduleSeriesFromMirror, personalScheduleWindow } from "../../view-models/personal-schedule-occurrences";
import { japanCalendarDateInfo, scheduleToCalendarView, shiftScheduleDateKey, shiftScheduleMonthDateKey, type ScheduleCalendarDay, type ScheduleTimelineItem } from "../../view-models/schedule";

export type CalendarMode = "day" | "week" | "month";

function validDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function calendarDateKeys(dateKey: string, mode: CalendarMode): string[] {
  if (!validDateKey(dateKey)) return [];
  if (mode === "day") return [dateKey];
  if (mode === "week") {
    const sunday = shiftScheduleDateKey(dateKey, -new Date(`${dateKey}T00:00:00Z`).getUTCDay());
    return Array.from({ length: 7 }, (_, index) => shiftScheduleDateKey(sunday, index));
  }
  const year = Number(dateKey.slice(0, 4)), month = Number(dateKey.slice(5, 7));
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const offset = new Date(`${first}T00:00:00Z`).getUTCDay();
  const start = shiftScheduleDateKey(first, -offset);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const count = Math.max(35, Math.ceil((offset + daysInMonth) / 7) * 7);
  return Array.from({ length: count }, (_, index) => shiftScheduleDateKey(start, index));
}

export function shiftCalendarSelection(dateKey: string, mode: CalendarMode, direction: -1 | 1): string {
  return mode === "month" ? shiftScheduleMonthDateKey(dateKey, direction) : shiftScheduleDateKey(dateKey, direction * (mode === "week" ? 7 : 1));
}

type RawItem = Record<string, unknown>;
type CalendarInput = {
  actorId: string;
  dateKey: string;
  events: unknown;
  language: OrbitLanguage;
  mode: CalendarMode;
  now: Date;
  scheduleItems: unknown;
  tasks: unknown;
  timeZone: string;
};
export type CalendarOverlap = { ids: [string, string]; titles: [string, string]; dateKey: string };
export type CalendarProjection = { kind: "invalid_schedule" } | {
  kind: "ready";
  dateKeys: string[];
  days: ScheduleCalendarDay[];
  items: ScheduleTimelineItem[];
  overlaps: CalendarOverlap[];
  selectedDateKey: string;
  selectedItems: ScheduleTimelineItem[];
};

function rows(value: unknown, field: string): RawItem[] {
  if (!value || typeof value !== "object" || !(field in value)) return [];
  const list = (value as Record<string, unknown>)[field];
  return Array.isArray(list) ? list.filter((entry): entry is RawItem => !!entry && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function expandedSchedule(input: CalendarInput, keys: string[]): RawItem[] | null {
  const original = rows(input.scheduleItems, "scheduleItems");
  const recurring = original.filter(item => item.kind === "personal" && item.recurrence && !item.seriesId);
  if (!recurring.length) return original;
  if (!input.actorId) return null;
  const series = personalScheduleSeriesFromMirror(recurring.map(payload => ({ payload })), input.actorId);
  if (!series) return null;
  const first = Date.parse(`${keys[0]}T00:00:00Z`) - 2 * 86_400_000;
  const last = Date.parse(`${keys.at(-1)}T00:00:00Z`) + 3 * 86_400_000;
  try {
    const occurrences = personalScheduleWindow(series, { from: new Date(first).toISOString(), to: new Date(last).toISOString() }, input.now.getTime());
    return [...original.filter(item => !recurring.includes(item)), ...occurrences as unknown as RawItem[]];
  } catch {
    return null;
  }
}

function overlapsFor(items: RawItem[], eventItems: RawItem[], timeZone: string): CalendarOverlap[] {
  const timed = [...items, ...eventItems].flatMap(item => {
    if (item.allDay === true || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.startsAt !== "string" || typeof item.endsAt !== "string") return [];
    const start = Date.parse(item.startsAt), end = Date.parse(item.endsAt);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [{ id: item.id, title: item.title, start, end }] : [];
  });
  const pairs: CalendarOverlap[] = [];
  for (let left = 0; left < timed.length; left++) for (let right = left + 1; right < timed.length; right++) {
    const a = timed[left]!, b = timed[right]!;
    if (a.id === b.id || a.start >= b.end || b.start >= a.end) continue;
    pairs.push({ ids: [a.id, b.id], titles: [a.title, b.title], dateKey: localParts(Math.max(a.start, b.start), timeZone).date });
  }
  return pairs;
}

export function calendarProjection(input: CalendarInput): CalendarProjection {
  const keys = calendarDateKeys(input.dateKey, input.mode);
  if (!keys.length) return { kind: "invalid_schedule" };
  const scheduleItems = expandedSchedule(input, keys);
  if (!scheduleItems) return { kind: "invalid_schedule" };
  const view = scheduleToCalendarView({
    events: input.events, language: input.language, now: input.now, scheduleItems: { scheduleItems },
    selectedDateKey: input.dateKey, tasks: input.tasks, timeZone: input.timeZone, weekStartsOn: 0,
  });
  const today = localParts(input.now, input.timeZone).date;
  const formatter = new Intl.DateTimeFormat(input.language === "zh" ? "zh-CN" : input.language === "ja" ? "ja-JP" : "en-US", { timeZone: "UTC", weekday: "short" });
  const days = keys.map((dateKey): ScheduleCalendarDay => ({
    dateKey,
    dayNumber: String(Number(dateKey.slice(8))),
    ...japanCalendarDateInfo(dateKey, input.language),
    isSelected: dateKey === input.dateKey,
    isToday: dateKey === today,
    items: view.items.filter(item => item.dateKey === dateKey || Boolean(item.endDateKey && item.dateKey < dateKey && item.endDateKey >= dateKey)),
    weekdayLabel: formatter.format(new Date(`${dateKey}T12:00:00Z`)),
  }));
  return {
    kind: "ready", dateKeys: keys, days, items: view.items,
    overlaps: overlapsFor(scheduleItems, rows(input.events, "events"), input.timeZone),
    selectedDateKey: input.dateKey,
    selectedItems: days.find(day => day.isSelected)?.items ?? [],
  };
}
