import type { ScheduleItemContract } from "../../api/contract/tasks";
import { localDayStart, shiftCalendarDate, validTimeZone } from "../../time/date-time";
import { calendarDateKeys, type CalendarMode } from "./calendar-projection";

const MAX_WINDOW_MS = 43 * 86_400_000;

/** The appointment read uses the same visible local-date grid as the calendar. */
export function calendarMeetingWindow(dateKey: string, mode: CalendarMode, timeZone: string): { from: string; to: string; variant: string } | null {
  const keys = calendarDateKeys(dateKey, mode);
  if (!keys.length || !validTimeZone(timeZone)) return null;
  const start = localDayStart(keys[0]!, timeZone);
  const end = localDayStart(shiftCalendarDate(keys.at(-1)!, 1), timeZone);
  if (start === null || end === null || end <= start || end - start > MAX_WINDOW_MS) return null;
  const from = new Date(start).toISOString(), to = new Date(end).toISOString();
  return { from, to, variant: `${from}|${to}` };
}

function validInstant(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
}

/** Drop all fields except the small preview the calendar can show offline. */
export function readCalendarMeetings(response: unknown): ScheduleItemContract[] | null {
  if (!response || typeof response !== "object" || !Array.isArray((response as { scheduleItems?: unknown }).scheduleItems)) return null;
  const rows = (response as { scheduleItems: unknown[] }).scheduleItems;
  return rows.flatMap((value): ScheduleItemContract[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const row = value as Record<string, unknown>;
    if (row.kind !== "meeting" || row.category !== "meeting" || (row.state !== "upcoming" && row.state !== "ongoing" && row.state !== "ended")) return [];
    if (typeof row.sourceId !== "string" || !row.sourceId || row.id !== `schedule:${row.sourceId}` || typeof row.title !== "string" || !row.title.trim()) return [];
    if (!validInstant(row.startsAt) || !validInstant(row.endsAt) || Date.parse(row.endsAt) <= Date.parse(row.startsAt)) return [];
    return [{ id: row.id, sourceId: row.sourceId, kind: "meeting", category: "meeting", state: row.state, title: row.title, startsAt: row.startsAt, endsAt: row.endsAt,
      ...(typeof row.location === "string" && row.location ? { location: row.location } : {}) }];
  });
}

export function mergeCalendarScheduleItems(mirror: unknown, meetingPart: unknown): { scheduleItems: Record<string, unknown>[] } {
  const rows = (value: unknown): Record<string, unknown>[] => {
    if (!value || typeof value !== "object" || !Array.isArray((value as { scheduleItems?: unknown }).scheduleItems)) return [];
    return (value as { scheduleItems: unknown[] }).scheduleItems.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row));
  };
  const merged = [...rows(mirror)];
  for (const row of rows(meetingPart)) {
    const index = merged.findIndex(existing => typeof row.id === "string" && existing.id === row.id);
    if (index >= 0) merged[index] = row;
    else merged.push(row);
  }
  return { scheduleItems: merged };
}
