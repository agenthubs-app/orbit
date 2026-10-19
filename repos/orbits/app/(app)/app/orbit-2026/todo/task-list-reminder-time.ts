import { localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";

export function nextMorningReminderAt(now: Date, timeZone: string): string | null {
  if (!Number.isFinite(now.getTime()) || !validTimeZone(timeZone)) return null;
  const today = localParts(now, timeZone).date;
  const nextDay = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return resolveLocalDateTime(nextDay, "08:00", timeZone);
}
