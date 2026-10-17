import { localDayStart, shiftCalendarDate, validTimeZone } from "../../time/date-time";
import { calendarDateKeys, type CalendarMode } from "./calendar-projection";

const MAX_RANGE_MS = 42 * 86_400_000;

/** Google reads are online-only and cover the whole visible local-date grid. */
export function calendarExternalRanges(dateKey: string, mode: CalendarMode, timeZone: string): Array<{ from: string; to: string }> {
  const dates = calendarDateKeys(dateKey, mode);
  if (!dates.length || !validTimeZone(timeZone)) return [];
  const from = localDayStart(dates[0]!, timeZone);
  const to = localDayStart(shiftCalendarDate(dates.at(-1)!, 1), timeZone);
  if (from === null || to === null || to <= from) return [];
  const ranges: Array<{ from: string; to: string }> = [];
  for (let cursor = from; cursor < to; cursor += MAX_RANGE_MS) {
    ranges.push({ from: new Date(cursor).toISOString(), to: new Date(Math.min(cursor + MAX_RANGE_MS, to)).toISOString() });
  }
  return ranges;
}
