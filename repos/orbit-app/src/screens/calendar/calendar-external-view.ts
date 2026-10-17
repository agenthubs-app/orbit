import type { CalendarExternalEventContract } from "../../api/contract/calendar-external-events";
import { calendarDate, localParts, shiftCalendarDate, validTimeZone } from "../../time/date-time";

/** External events remain read-only provider data; this only indexes visible days. */
export function calendarExternalEventsByDay(
  events: readonly CalendarExternalEventContract[], dates: readonly string[], timeZone: string,
): Map<string, CalendarExternalEventContract[]> {
  const byDay = new Map(dates.map(date => [date, [] as CalendarExternalEventContract[]]));
  if (!validTimeZone(timeZone)) return byDay;
  for (const event of events) {
    let first: string;
    let last: string;
    if (event.allDay) {
      if (!calendarDate(event.startsAt) || event.endsAt && !calendarDate(event.endsAt)) continue;
      first = event.startsAt;
      last = event.endsAt ? shiftCalendarDate(event.endsAt, -1) : first;
    } else {
      const start = Date.parse(event.startsAt), end = event.endsAt ? Date.parse(event.endsAt) : start + 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      first = localParts(start, timeZone).date;
      last = localParts(end - 1, timeZone).date;
    }
    if (last < first) continue;
    for (const [date, items] of byDay) if (date >= first && date <= last) items.push(event);
  }
  return byDay;
}
