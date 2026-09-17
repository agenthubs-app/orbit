import { calendarDate, localDateTimeCandidates, localParts, validTimeZone } from "../tasks/local-date-time";

export interface PersonalScheduleRecurrence {
  frequency: "daily" | "weekly" | "monthly";
  until?: string;
}

export interface PersonalScheduleSeries {
  id: string;
  startsAt: string;
  endsAt?: string;
  timeZone: string;
  allDay?: boolean;
  recurrence: PersonalScheduleRecurrence;
}

export interface PersonalScheduleOccurrence {
  id: string;
  seriesId: string;
  occurrenceDate: string;
  startsAt: string;
  endsAt?: string;
}

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
  // Work is bounded by the requested window, not the age of the series.
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
        // A gap has no instant to compare. Check its local wall time against
        // the window before rejecting it; gaps outside the window are irrelevant.
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
