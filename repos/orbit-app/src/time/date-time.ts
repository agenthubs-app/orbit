/** Calendar dates are not instants. All conversions require an explicit zone. */
export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; }
  catch { return false; }
}

export function localParts(value: Date | string | number, timeZone: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}`, second: part("second") };
}

export function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day ? date : null;
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = calendarDate(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Sample surrounding offsets, then verify each candidate by exact round trip.
// Both sides of ordinary, half-hour and date-line transitions are included.
export function localDateTimeCandidates(date: string, time: string, timeZone: string): number[] {
  if (!calendarDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !validTimeZone(timeZone)) return [];
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const parts = localParts(sample, timeZone);
    offsets.add(Date.parse(`${parts.date}T${parts.time}:${parts.second}Z`) - sample);
  }
  return [...offsets].map(offset => wall - offset).filter(candidate => {
    const parts = localParts(candidate, timeZone);
    return parts.date === date && parts.time === time && parts.second === "00";
  }).sort((a, b) => a - b);
}

export function resolveLocalDateTime(date: string, time: string, timeZone: string): string | null {
  const candidates = localDateTimeCandidates(date, time, timeZone);
  return candidates.length === 1 ? new Date(candidates[0]!).toISOString() : null;
}

/** The first instant of a calendar day, including zones whose midnight is skipped. */
export function localDayStart(date: string, timeZone: string): number | null {
  if (!calendarDate(date) || !validTimeZone(timeZone)) return null;
  const midnight = localDateTimeCandidates(date, "00:00", timeZone);
  if (midnight.length) return midnight[0]!;
  // A midnight gap may advance to 01:00 or skip an entire calendar date.
  const center = Date.parse(`${date}T00:00:00Z`);
  let low = center - 48 * 3_600_000;
  let high = center + 48 * 3_600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localParts(middle, timeZone).date < date) low = middle;
    else high = middle;
  }
  return high;
}
