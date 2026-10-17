import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { calendarDate } from "./local-date-time";

// A six-week local grid can include an extra DST hour. External reads keep
// their separate 42*24h cap and split at the client boundary.
const MAX_CALENDAR_WINDOW = 43 * 86_400_000;
const instant = z.string().datetime({ offset: true }).refine(value => calendarDate(value.slice(0, 10)) !== null && Number.isFinite(Date.parse(value)));
const schema = z.object({ scope: z.literal("calendar"), from: instant, to: instant, language: z.enum(["ja", "zh", "en"]).default("ja") }).strict()
  .refine(value => Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= MAX_CALENDAR_WINDOW);
export function calendarScheduleQuery(params: URLSearchParams) {
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw new AppError("VALIDATION_ERROR", "Invalid calendar window.");
  const parsed = schema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new AppError("VALIDATION_ERROR", "Invalid calendar window.");
  const { scope: _scope, ...window } = parsed.data;
  return window;
}

export function calendarScheduleOverlaps(item: { startsAt: string; endsAt?: string }, window: { from: string; to: string }) {
  const start = Date.parse(item.startsAt), end = item.endsAt === undefined ? undefined : Date.parse(item.endsAt);
  if (!Number.isFinite(start) || (end !== undefined && (!Number.isFinite(end) || end <= start))) throw Error("CALENDAR_SCHEDULE_TIME_INVALID");
  return start < Date.parse(window.to) && (end === undefined ? start >= Date.parse(window.from) : end > Date.parse(window.from));
}
