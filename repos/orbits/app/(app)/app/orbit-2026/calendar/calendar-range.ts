import { calendarDate, validTimeZone } from "../../../../../features/tasks/local-date-time";
import { personalScheduleDayStart } from "../../tasks/personal-schedule-editor-model";

export type CalendarMode = "day" | "week" | "month";
const DAY = 86_400_000;
const EXTERNAL_MAX_RANGE = 42 * DAY;
const unavailable = () => new Error("CALENDAR_DATE_UNAVAILABLE");
const dateText = (date: Date) => date.toISOString().slice(0, 10);

/** Calendar navigation operates on dates, never on 24-hour zoned instants. */
export function shiftCalendarDate(date: string, mode: CalendarMode, direction: -1 | 1): string {
  const day = calendarDate(date);
  if (!day) throw unavailable();
  if (mode === "month") {
    const original = day.getUTCDate();
    day.setUTCDate(1);
    day.setUTCMonth(day.getUTCMonth() + direction);
    const last = new Date(day);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    day.setUTCDate(Math.min(original, last.getUTCDate()));
  } else day.setUTCDate(day.getUTCDate() + direction * (mode === "week" ? 7 : 1));
  return dateText(day);
}

export function calendarWindow(date: string, mode: CalendarMode, timeZone: string) {
  const first = calendarDate(date);
  if (!first || !validTimeZone(timeZone)) throw unavailable();
  let length = 1;
  if (mode === "week") {
    first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
    length = 7;
  } else if (mode === "month") {
    // b3 monthGrid: Sunday through Saturday. Do not add a sixth blank week.
    first.setUTCDate(1);
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    length = Math.ceil((first.getUTCDay() + last.getUTCDate()) / 7) * 7;
    first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  }
  const days = Array.from({ length }, (_, offset) => dateText(new Date(first.getTime() + offset * DAY)));
  const from = personalScheduleDayStart(days[0]!, timeZone);
  const to = personalScheduleDayStart(dateText(new Date(first.getTime() + length * DAY)), timeZone);
  if (!from || !to || Date.parse(to) <= Date.parse(from)) throw unavailable();
  // A six-week fall-DST grid is 42 days + one hour. Keep the full local
  // window but split provider reads; never clamp away its final hour.
  const externalRanges: { from: string; to: string }[] = [];
  for (let start = Date.parse(from); start < Date.parse(to); start += EXTERNAL_MAX_RANGE) {
    externalRanges.push({ from: new Date(start).toISOString(), to: new Date(Math.min(start + EXTERNAL_MAX_RANGE, Date.parse(to))).toISOString() });
  }
  return { from, to, days, externalRanges };
}
