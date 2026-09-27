import { readPersonalSchedule } from "../api/personal-schedule";
import type { PersonalScheduleContract } from "../api/contract/tasks";
import { calendarDate, localDateTimeCandidates, localParts, validTimeZone } from "../time/date-time";

/**
 * Sprint 0108: the personal-schedule list and detail read the device mirror.
 * The server mirrors each owned series once (with its occurrence exceptions,
 * see features/sync/domain-read-service.ts); this module derives what
 * GET /api/schedule-items used to return: occurrences in a window, occurrence
 * ids `series:occurrence:YYYY-MM-DD`, per-occurrence edits and cancellations,
 * and the time-dependent state. expandPersonalScheduleOccurrences is a port of
 * orbits features/personal-schedule/recurrence.ts; a parity test runs both.
 */
export interface PersonalScheduleRecurrence { frequency: "daily" | "weekly" | "monthly"; until?: string }
export interface PersonalScheduleSeries { id: string; startsAt: string; endsAt?: string; timeZone: string; allDay?: boolean; recurrence: PersonalScheduleRecurrence }
export interface PersonalScheduleOccurrence { id: string; seriesId: string; occurrenceDate: string; startsAt: string; endsAt?: string }

export function expandPersonalScheduleOccurrences(series: PersonalScheduleSeries, window: { from: string; to: string }, occurrenceDate?: string): PersonalScheduleOccurrence[] {
  const from = Date.parse(window.from), to = Date.parse(window.to);
  const day = 86_400_000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 366 * day) throw new Error("Recurrence window must be finite and at most 366 days.");
  const startAt = Date.parse(series.startsAt), endAt = series.endsAt === undefined ? undefined : Date.parse(series.endsAt);
  if (!series.id || !validTimeZone(series.timeZone) || !Number.isFinite(startAt) || (endAt !== undefined && (!Number.isFinite(endAt) || endAt <= startAt))) throw new Error("Invalid recurrence series.");
  if (!["daily", "weekly", "monthly"].includes(series.recurrence.frequency)) throw new Error("Invalid recurrence frequency.");
  const start = localParts(startAt, series.timeZone), end = endAt === undefined ? undefined : localParts(endAt, series.timeZone);
  const startDay = calendarDate(start.date)!.getTime();
  const until = series.recurrence.until;
  if (until !== undefined && (!calendarDate(until) || until < start.date)) throw new Error("Invalid recurrence end date.");
  const endDays = end ? (calendarDate(end.date)!.getTime() - startDay) / day : 0;
  if (series.allDay && (!end || start.time !== "00:00" || start.second !== "00" || startAt % 1000 !== 0 || end.time !== "00:00" || end.second !== "00" || endAt! % 1000 !== 0 || endDays < 1)) throw new Error("All-day recurrence requires local day boundaries.");
  const fromLocal = localParts(from, series.timeZone), toLocal = localParts(to, series.timeZone);
  const first = calendarDate(fromLocal.date)!.getTime();
  const last = calendarDate(toLocal.date)!.getTime();
  const result: PersonalScheduleOccurrence[] = [];
  occurrences: for (let dateAt = Math.max(first, startDay); dateAt <= last; dateAt += day) {
    const date = new Date(dateAt).toISOString().slice(0, 10);
    if (occurrenceDate !== undefined && date !== occurrenceDate) continue;
    if (until !== undefined && date > until) break;
    if (series.recurrence.frequency === "weekly" && ((dateAt - startDay) / day) % 7 !== 0) continue;
    if (series.recurrence.frequency === "monthly" && date.slice(8) !== start.date.slice(8)) continue;
    const resolved: number[] = [];
    for (const endpoint of end ? [start, end] : [start]) {
      const isEnd = endpoint === end;
      const endpointDate = isEnd ? new Date(dateAt + endDays * day).toISOString().slice(0, 10) : date;
      const candidates = localDateTimeCandidates(endpointDate, endpoint.time, series.timeZone);
      const remainder = Number(endpoint.second) * 1000 + (isEnd ? endAt! : startAt) % 1000;
      if (!isEnd) {
        if (candidates.length && candidates.every(candidate => candidate + remainder < from || candidate + remainder >= to)) continue occurrences;
        if (!candidates.length) {
          const wall = `${date}T${endpoint.time}:${endpoint.second}`;
          if (wall < `${fromLocal.date}T${fromLocal.time}:${fromLocal.second}` || wall >= `${toLocal.date}T${toLocal.time}:${toLocal.second}`) continue occurrences;
        }
      }
      if (candidates.length !== 1) throw new Error(`Recurrence local time is ${candidates.length === 0 ? "nonexistent" : "ambiguous"}: ${endpointDate} ${endpoint.time} ${series.timeZone}`);
      resolved.push(candidates[0]! + remainder);
    }
    const occurrenceStart = resolved[0]!;
    if (occurrenceStart < from || occurrenceStart >= to) continue;
    if (resolved[1] !== undefined && resolved[1] <= occurrenceStart) throw new Error("Recurrence end local time must be after start.");
    result.push({ id: `${series.id}:occurrence:${date}`, seriesId: series.id, occurrenceDate: date, startsAt: new Date(occurrenceStart).toISOString(), ...(resolved[1] !== undefined ? { endsAt: new Date(resolved[1]).toISOString() } : {}) });
  }
  return result;
}

export interface MirrorScheduleException { occurrenceDate: string; cancelled: boolean; patch: Record<string, unknown> }
export interface MirrorScheduleSeries { item: PersonalScheduleContract; exceptions: MirrorScheduleException[] }

const PATCH_CLEARABLE = ["location", "endsAt", "allDay", "timeZone", "meetingMethod", "meetingUrl", "contactIds", "noteIds", "recurrence", "reminderMinutes"] as const;

function patched(item: PersonalScheduleContract, patch: Record<string, unknown>): PersonalScheduleContract {
  const result = { ...item, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null)) } as Record<string, unknown>;
  for (const key of PATCH_CLEARABLE) if (patch[key] === null) delete result[key];
  return result as unknown as PersonalScheduleContract;
}

/** The server's publicItem: state is derived from the clock, except cancelled. */
export function withCurrentState(item: PersonalScheduleContract, now: number): PersonalScheduleContract {
  const state = item.state === "cancelled" ? "cancelled" : now < Date.parse(item.startsAt) ? "upcoming" : item.endsAt && now < Date.parse(item.endsAt) ? "ongoing" : "ended";
  return { ...item, state };
}

function isException(value: unknown): value is MirrorScheduleException {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.occurrenceDate === "string" && calendarDate(candidate.occurrenceDate) !== null && typeof candidate.cancelled === "boolean"
    && !!candidate.patch && typeof candidate.patch === "object" && !Array.isArray(candidate.patch);
}

/** Null when any mirrored row is not the owner's valid personal schedule. Cancelled series are dropped. */
export function personalScheduleSeriesFromMirror(records: readonly { payload: unknown }[], actorId: string): MirrorScheduleSeries[] | null {
  const result: MirrorScheduleSeries[] = [];
  for (const record of records) {
    const payload = record.payload as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") return null;
    if (payload.kind !== "personal") continue;
    const { occurrenceExceptions, ...dto } = payload;
    const item = readPersonalSchedule({ scheduleItem: dto });
    if (!item || item.accountId !== actorId || item.ownerUserId !== actorId || item.seriesId !== undefined) return null;
    const exceptions = occurrenceExceptions === undefined ? [] : Array.isArray(occurrenceExceptions) && occurrenceExceptions.every(isException) ? occurrenceExceptions : null;
    if (!exceptions) return null;
    if (item.state !== "cancelled") result.push({ item, exceptions });
  }
  return result;
}

function occurrencesOf(series: MirrorScheduleSeries, window: { from: string; to: string }, now: number, exactDate?: string): PersonalScheduleContract[] {
  const { item, exceptions } = series;
  if (!item.recurrence) return [withCurrentState(item, now)];
  if (!item.timeZone) return [];
  const recurring = { ...item, timeZone: item.timeZone, recurrence: item.recurrence };
  const anchors = new Map(expandPersonalScheduleOccurrences(recurring, window, exactDate).map(occurrence => [occurrence.occurrenceDate, occurrence]));
  for (const exception of exceptions) {
    if (exception.cancelled || (exactDate !== undefined && exception.occurrenceDate !== exactDate) || anchors.has(exception.occurrenceDate)) continue;
    // An edit can move an occurrence from outside the window into it.
    const day = calendarDate(exception.occurrenceDate)!.getTime();
    const anchor = expandPersonalScheduleOccurrences(recurring, { from: new Date(day - 2 * 86_400_000).toISOString(), to: new Date(day + 2 * 86_400_000).toISOString() }, exception.occurrenceDate)[0];
    if (anchor) anchors.set(exception.occurrenceDate, anchor);
  }
  const result: PersonalScheduleContract[] = [];
  for (const anchor of anchors.values()) {
    const exception = exceptions.find(value => value.occurrenceDate === anchor.occurrenceDate);
    if (exception?.cancelled) continue;
    const instance = patched({ ...item, ...anchor, sourceId: item.id }, exception?.patch ?? {});
    const time = Date.parse(instance.startsAt);
    if (time >= Date.parse(window.from) && time < Date.parse(window.to)) result.push(withCurrentState(instance, now));
  }
  return result;
}

/** What GET /api/schedule-items?from&to returned: occurrences starting inside [from, to), by start time. */
export function personalScheduleWindow(series: readonly MirrorScheduleSeries[], window: { from: string; to: string }, now: number): PersonalScheduleContract[] {
  return series.flatMap(entry => occurrencesOf(entry, window, now))
    .filter(item => Date.parse(item.startsAt) >= Date.parse(window.from) && Date.parse(item.startsAt) < Date.parse(window.to))
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
}

/** What GET /api/schedule-items/:id returned, for a series id or an occurrence id. */
export function personalScheduleById(series: readonly MirrorScheduleSeries[], id: string, now: number): PersonalScheduleContract | null {
  const match = /^(.*):occurrence:(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!match || !calendarDate(match[2]!)) {
    const entry = series.find(value => value.item.id === id);
    return entry ? withCurrentState(entry.item, now) : null;
  }
  const entry = series.find(value => value.item.id === match[1]);
  if (!entry?.item.recurrence) return null;
  const exception = entry.exceptions.find(value => value.occurrenceDate === match[2]);
  const moved = typeof exception?.patch.startsAt === "string" ? Date.parse(exception.patch.startsAt) : NaN;
  const day = Number.isFinite(moved) ? moved : calendarDate(match[2]!)!.getTime();
  return occurrencesOf(entry, { from: new Date(day - 2 * 86_400_000).toISOString(), to: new Date(day + 2 * 86_400_000).toISOString() }, now, match[2]).find(item => item.id === id) ?? null;
}
