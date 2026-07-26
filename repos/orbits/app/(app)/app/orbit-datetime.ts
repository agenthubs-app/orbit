/**
 * Shared date/time formatting for the product surface.
 *
 * `dateLocale` was copy-pasted into at least five files (orbit-agent-hero,
 * orbit-real-landing-page, home/orbit-real-home, o/orbit-real-organizer-public,
 * events/[id]/orbit-real-event-detail) and a couple of call sites hardcoded
 * "zh-CN" outright, so an English or Japanese reader still got Chinese dates.
 *
 * More importantly, some surfaces skipped formatting altogether: UI audit
 * 2026-07-26 C4 found raw ISO-8601 rendered straight into the UI —
 * "2026-06-28T10:30:00.000Z" under each row on /app/platform, and
 * "2026-07-07T09:06:00+09:00" in the relationship inbox, where the timestamp
 * was physically wider than the person's name.
 *
 * All Orbit product times are presented in the product's home timezone rather
 * than the viewer's, so an event time reads the same for an organizer abroad as
 * for an attendee in the room.
 */
import type { OrbitLanguage } from "./orbit-language-core";

export const ORBIT_DISPLAY_TIME_ZONE = "Asia/Tokyo";

export function dateLocale(language: OrbitLanguage): string {
  if (language === "en") return "en-US";
  if (language === "ja") return "ja-JP";
  return "zh-CN";
}

function parse(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Date + time, e.g. "6月28日 19:30". Returns `fallback` for values that are
 * absent or unparseable, so a bad record shows a readable placeholder instead
 * of "Invalid Date".
 */
export function formatOrbitDateTime(
  value: string | number | Date | null | undefined,
  language: OrbitLanguage,
  fallback = "—",
): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = parse(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat(dateLocale(language), {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: ORBIT_DISPLAY_TIME_ZONE,
  }).format(date);
}

/** Date only, e.g. "6月28日". */
export function formatOrbitDate(
  value: string | number | Date | null | undefined,
  language: OrbitLanguage,
  fallback = "—",
): string {
  if (value === null || value === undefined || value === "") return fallback;
  const date = parse(value);
  if (!date) return fallback;

  return new Intl.DateTimeFormat(dateLocale(language), {
    day: "numeric",
    month: "short",
    timeZone: ORBIT_DISPLAY_TIME_ZONE,
  }).format(date);
}
