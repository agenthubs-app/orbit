import { contactsToSummaries, type ContactSummary } from "./contacts";
import { todayToView, type TodayTaskRowView } from "./today-tasks";
import type { ScheduleItemContract } from "../api/contract/tasks";

const timeZone = "Asia/Tokyo";
const categories = ["relationship", "meeting", "event", "work", "personal", "other"];
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && validDate(value.slice(0, 10)) &&
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) &&
    Number.isFinite(Date.parse(value));
}

function tokyoDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day;
}

function dateNumber(date: string): string {
  return Number(date.slice(5, 7)) + "." + Number(date.slice(8, 10));
}

export function homeDateView(now: Date, selectedDateKey?: string) {
  const today = tokyoDate(now);
  const selected = validDate(selectedDateKey) ? selectedDateKey : today;
  const date = new Date(selected + "T12:00:00+09:00");
  const weekday = date.getUTCDay();
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - (weekday + 6) % 7);
  return {
    selectedDateKey: selected,
    dateLabel: dateNumber(selected),
    weekdayLabel: weekdays[weekday]!,
    isToday: selected === today,
    week: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setUTCDate(day.getUTCDate() + index);
      const dateKey = tokyoDate(day);
      return { dateKey, dayNumber: String(day.getUTCDate()), weekdayLabel: weekdays[day.getUTCDay()]!, isSelected: dateKey === selected, isToday: dateKey === today };
    })
  };
}

// Validate only the fields this consumer uses; this is not a replacement for
// the server/shared task contract. A bad collection is a visible failure.
export function homeTasksToView(payload: unknown, selectedDateKey: string, now: Date): TodayTaskRowView[] | null {
  if (!validDate(selectedDateKey) || !record(payload) || !Array.isArray(payload.tasks)) return null;
  const tasks: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  for (const item of payload.tasks) {
    if (!record(item) || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.title) ||
      !categories.includes(String(item.category)) || !["open", "completed", "cancelled"].includes(String(item.status)) ||
      !["normal", "high"].includes(String(item.priority)) ||
      (item.plannedDate !== undefined && !validDate(item.plannedDate)) ||
      (item.dueAt !== undefined && !validTimestamp(item.dueAt))) return null;
    ids.add(item.id);
    // Same selection rule as the existing TodayService, applied to this day.
    if (item.status === "open" && (
      (typeof item.plannedDate === "string" && item.plannedDate <= selectedDateKey) ||
      (typeof item.dueAt === "string" && tokyoDate(new Date(item.dueAt)) <= selectedDateKey)
    )) tasks.push(item);
  }
  tasks.sort((left, right) => String(left.dueAt ?? left.plannedDate + "T23:59:59").localeCompare(String(right.dueAt ?? right.plannedDate + "T23:59:59")));
  const rows = todayToView({ date: selectedDateKey, tasks, suggestions: [], schedule: [], completedCount: 0 }, now).tasks;
  const today = tokyoDate(now);
  return rows.map((row, index) => {
    const source = tasks[index]!;
    return !source.dueAt && typeof source.plannedDate === "string" && source.plannedDate !== today
      ? { ...row, dueLabel: dateNumber(source.plannedDate).replace(".", "/") }
      : row;
  });
}

export interface HomeScheduleRow {
  id: string;
  title: string;
  timeLabel: string;
  detail: string;
  state: ScheduleItemContract["state"];
  href: string;
}

export function homeScheduleToView(payload: unknown, selectedDateKey: string, now: Date): HomeScheduleRow[] | null {
  if (!validDate(selectedDateKey) || !record(payload) || !Array.isArray(payload.scheduleItems)) return null;
  const startOfDay = Date.parse(selectedDateKey + "T00:00:00+09:00");
  const endOfDay = startOfDay + 86_400_000;
  const rows: Array<HomeScheduleRow & { start: number }> = [];
  const ids = new Set<string>();
  for (const item of payload.scheduleItems) {
    if (!record(item) || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.title) || !nonempty(item.sourceId) ||
      !["meeting", "event", "personal"].includes(String(item.kind)) ||
      !["upcoming", "ongoing", "ended", "cancelled"].includes(String(item.state)) ||
      !validTimestamp(item.startsAt) || (item.endsAt !== undefined && !validTimestamp(item.endsAt)) ||
      (item.location !== undefined && typeof item.location !== "string")) return null;
    ids.add(item.id);
    const start = Date.parse(item.startsAt);
    const end = typeof item.endsAt === "string" ? Date.parse(item.endsAt) : null;
    if (end !== null && end <= start) return null;
    if (item.state === "cancelled" || start >= endOfDay || (end === null ? start < startOfDay : end <= startOfDay)) continue;
    const state = start > now.getTime() ? "upcoming" : end !== null && end > now.getTime() ? "ongoing" : "ended";
    const startDate = tokyoDate(new Date(start));
    const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(start));
    const duration = end === null ? "" : Math.round((end - start) / 60_000) + " 分钟";
    rows.push({
      start, id: item.id, title: item.title, state,
      timeLabel: (startDate === selectedDateKey ? "" : dateNumber(startDate) + " ") + time,
      detail: [item.location, duration].filter(Boolean).join(" · "),
      href: item.kind === "event" ? "/schedule/events/" + encodeURIComponent(item.sourceId) : "/schedule"
    });
  }
  return rows.sort((left, right) => left.start - right.start).map(({ start: _start, ...row }) => row);
}

export function homeFollowupsToView(payload: unknown): ContactSummary[] | null {
  if (!record(payload) || !Array.isArray(payload.contacts) ||
    !["success", "empty"].includes(String(payload.state)) ||
    (payload.state === "empty") !== (payload.contacts.length === 0)) return null;
  const ids = new Set<string>();
  for (const item of payload.contacts) {
    if (!record(item) || !nonempty(item.id) || ids.has(item.id) || !nonempty(item.displayName) ||
      !["active", "needs_follow_up", "nurture", "archived"].includes(String(item.status))) return null;
    ids.add(item.id);
  }
  return contactsToSummaries({ contacts: payload.contacts.filter(item => item.status === "needs_follow_up") });
}
