import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";
import { personalScheduleDayStart } from "../../tasks/personal-schedule-editor-model";
import { CalendarReadError, createCalendarReadClient } from "./calendar-read-client";
import { MeetingProposalError } from "./meeting-proposal-client";

export interface MeetingAvailability { from: string; to: string; complete: boolean; items: { startsAt: string; endsAt?: string; allDay?: boolean; timeZone?: string }[] }
function nextDay(date: string, offset = 1) { const value = calendarDate(date); if (!value) throw new MeetingProposalError("invalid"); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); }
function intervals(availability: MeetingAvailability, zone: string) {
  return availability.items.map(item => {
    if (item.allDay && calendarDate(item.startsAt)) return { start: Date.parse(personalScheduleDayStart(item.startsAt, zone)!), end: Date.parse(personalScheduleDayStart(item.endsAt ?? nextDay(item.startsAt), zone)!) };
    const start = Date.parse(item.startsAt), end = item.endsAt ? Date.parse(item.endsAt) : NaN;
    if (Number.isFinite(end)) return { start, end };
    // A point has unknown duration. Keep its whole local day unavailable for
    // automatic selection instead of inventing a free interval around it.
    const day = localParts(start, zone).date;
    return { start: Date.parse(personalScheduleDayStart(day, zone)!), end: Date.parse(personalScheduleDayStart(nextDay(day), zone)!) };
  });
}
export function seedAvailableMeetingCandidates(now: number, zone: string, availability: MeetingAvailability): { startsAt: string; endsAt: string }[] {
  if (!availability.complete || !Number.isFinite(now) || !validTimeZone(zone) || availability.items.length > 2000) return [];
  try {
    const from = Date.parse(availability.from), to = Date.parse(availability.to), busy = intervals(availability, zone);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 15 * 86_400_000 || busy.some(range => !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start)) return [];
    const result: { startsAt: string; endsAt: string }[] = [], today = localParts(now, zone).date;
    for (let offset = 1; offset <= 14 && result.length < 3; offset++) {
      const day = nextDay(today, offset), weekday = calendarDate(day)!.getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      for (let minute = 9 * 60; minute <= 17 * 60; minute += 30) {
        const start = resolveLocalDateTime(day, `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`, zone);
        if (!start) continue;
        const at = Date.parse(start), end = at + 60 * 60_000;
        if (at < from || end > to || at <= now + 15 * 60_000 || busy.some(range => range.start < end && range.end > at)) continue;
        result.push({ startsAt: start, endsAt: new Date(end).toISOString() }); break;
      }
    }
    return result.length === 3 ? result : [];
  } catch { return []; }
}

export function createMeetingAvailabilityClient(options: { fetch?: typeof fetch } = {}) {
  const client = createCalendarReadClient(options);
  return { async load(zone: string, now: number, signal?: AbortSignal): Promise<MeetingAvailability> {
    signal?.throwIfAborted();
    if (!validTimeZone(zone) || !Number.isFinite(now)) throw new MeetingProposalError("invalid");
    const day = nextDay(localParts(now, zone).date), from = personalScheduleDayStart(day, zone), to = personalScheduleDayStart(nextDay(day, 14), zone);
    if (!from || !to) throw new MeetingProposalError("invalid");
    const controller = new AbortController(), activeSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const protect = <T,>(promise: Promise<T>): Promise<T | null> => promise.catch(error => {
      if (error instanceof CalendarReadError && error.code === "denied") { controller.abort(); throw new MeetingProposalError("denied"); }
      signal?.throwIfAborted(); return null;
    });
    const [native, external] = await Promise.all([protect(client.internal({ from, to }, "ja", activeSignal)), protect(client.external([{ from, to }], activeSignal))]);
    signal?.throwIfAborted();
    return { from, to, complete: Boolean(native && external && native.skipped === 0 && external.skipped === 0 && ["connected", "not_connected"].includes(external.connection)), items: [...(native?.items ?? []).map(item => ({ startsAt: item.startsAt, endsAt: item.endsAt, allDay: item.allDay, timeZone: item.timeZone })), ...(external?.events ?? []).map(item => ({ startsAt: item.startsAt, endsAt: item.endsAt, allDay: item.allDay }))] };
  } };
}
