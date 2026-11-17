/**
 * contact-reach R40 (DESIGN D4/D5): one set of rules for meeting slots, shared by
 * the Web and the App (npm run sync:contract copies this file to the App).
 *
 *   isSlotAllowed            does a slot fit the person's 可约时间 (weekday, hours,
 *                            lunch, minimum notice)? Busy time is not considered.
 *   availabilityGrid         the 30-minute grid for some local days; every cell is
 *                            allowed | busy | off | unknown.
 *   seedMeetingSlots         the first free slot of each of the next days, up to 3
 *                            (only slots confirmed free: availability complete and
 *                            not busy, with the buffer around busy time).
 *   sliceMeetingCandidates   painted ranges → non-overlapping candidates of one
 *                            meeting length (R43 D4): sent (≤ max), extra, short.
 *   formatMeetingSlotsText   the paragraph inserted into an e-mail body (ja/zh/en).
 *   formatMeetingRangesText  the same paragraph written as ranges (R43 D5).
 *   replaceMeetingSlotsText  put that paragraph into a body, replacing the one
 *                            inserted before and leaving everything else untouched.
 *
 * Every function takes the time zone the client resolved (device mode: the
 * client's Intl zone; fixed mode: the stored zone) and "now" in milliseconds.
 * The server never guesses a zone.
 */
import type {
  SchedulingAvailabilitySettings,
  SchedulingMinimumNotice,
  SchedulingWeekday,
} from "../contract/scheduling-availability";
import { isoTimestamp, isValidTimeZone, parseTimestamp, zonedWallClock } from "./compute-text";

export interface MeetingSlot {
  startsAt: string;
  endsAt: string;
}

/** Busy time read from the calendars (same shape as the Web's MeetingAvailability). */
export interface MeetingBusyAvailability {
  from: string;
  to: string;
  /** false when a calendar could not be read completely. */
  complete: boolean;
  items: readonly { startsAt: string; endsAt?: string; allDay?: boolean; timeZone?: string }[];
}

export type MeetingSlotState = "allowed" | "busy" | "off" | "unknown";

export interface MeetingSlotCell {
  /** Local "HH:mm" of the row. */
  time: string;
  /** null when the local time does not exist or is ambiguous (daylight-saving change). */
  startsAt: string | null;
  endsAt: string | null;
  state: MeetingSlotState;
}

export interface MeetingSlotGridDay {
  /** Local "YYYY-MM-DD". */
  date: string;
  weekday: SchedulingWeekday;
  cells: MeetingSlotCell[];
}

export interface MeetingSlotGrid {
  /** Local "HH:mm" rows, every 30 minutes from `start` up to (not including) `end`. */
  rows: string[];
  days: MeetingSlotGridDay[];
}

export type MeetingSlotLanguage = "ja" | "zh" | "en";
export type MeetingSlotMedium = "in_person" | "video" | "phone";

/** 改造前写死的规则：周一至五 9:00–18:00、无午休、60 分、提前 15 分钟、无缓冲、跟随设备时区。 */
export const DEFAULT_SCHEDULING_AVAILABILITY: SchedulingAvailabilitySettings = {
  weekdays: ["mon", "tue", "wed", "thu", "fri"],
  start: "09:00",
  end: "18:00",
  lunch: null,
  durationMinutes: 60,
  minimumNotice: "15m",
  bufferMinutes: 0,
  timeZoneMode: "device",
  timeZone: null,
};

const MINUTE = 60_000;
const DAY = 86_400_000;
const STEP_MINUTES = 30;
const MAX_BUSY_ITEMS = 2000;
/** Index = (days since 1970-01-01 + 4) % 7 → Sunday first. */
const WEEKDAY_BY_INDEX: readonly SchedulingWeekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const NOTICE_MINUTES: Record<SchedulingMinimumNotice, number> = { "15m": 15, "1h": 60, "4h": 240, "1d": 1440, "2d": 2880 };

export function minimumNoticeMinutes(notice: SchedulingMinimumNotice): number {
  return NOTICE_MINUTES[notice] ?? 15;
}

// ---- local calendar helpers (no runtime parsing: Date.UTC and compute-text only) ----

function dateParts(date: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const back = isoTimestamp(utc)?.slice(0, 10);
  return back === date ? [year, month, day] : null;
}

function timeMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

function timeText(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The local date `offset` days after `date` ("YYYY-MM-DD"), or null for an invalid date. */
export function addLocalDays(date: string, offset: number): string | null {
  const parts = dateParts(date);
  if (!parts) return null;
  return isoTimestamp(Date.UTC(parts[0], parts[1] - 1, parts[2] + offset))?.slice(0, 10) ?? null;
}

/** The weekday of a local date. */
export function localWeekday(date: string): SchedulingWeekday | null {
  const parts = dateParts(date);
  if (!parts) return null;
  const days = Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / DAY);
  return WEEKDAY_BY_INDEX[(((days + 4) % 7) + 7) % 7] ?? null;
}

/** The local date of an instant in a zone. */
export function localDateOf(now: number, timeZone: string): string | null {
  if (!Number.isFinite(now) || !isValidTimeZone(timeZone)) return null;
  return zonedWallClock(now, timeZone).date;
}

/** Every instant whose wall clock in `timeZone` is `date time:00` (0, 1 or 2 of them). */
function localInstants(date: string, time: string, timeZone: string): number[] {
  const parts = dateParts(date), minutes = timeMinutes(time);
  if (!parts || !Number.isFinite(minutes)) return [];
  const wall = Date.UTC(parts[0], parts[1] - 1, parts[2], Math.floor(minutes / 60), minutes % 60);
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const clock = zonedWallClock(sample, timeZone);
    const sampleParts = dateParts(clock.date), sampleMinutes = timeMinutes(clock.time);
    if (!sampleParts || !Number.isFinite(sampleMinutes)) continue;
    const sampleWall = Date.UTC(sampleParts[0], sampleParts[1] - 1, sampleParts[2], Math.floor(sampleMinutes / 60), sampleMinutes % 60, Number(clock.second));
    offsets.add(sampleWall - sample);
  }
  return [...offsets].map((offset) => wall - offset).filter((candidate) => {
    const clock = zonedWallClock(candidate, timeZone);
    return clock.date === date && clock.time === time && clock.second === "00";
  }).sort((a, b) => a - b);
}

/** The one instant of a local date and time; null when it does not exist or is ambiguous. */
function resolveLocal(date: string, time: string, timeZone: string): number | null {
  const instants = localInstants(date, time, timeZone);
  return instants.length === 1 ? instants[0]! : null;
}

/** The first instant of a local day (midnight, or the first minute after a skipped midnight). */
function dayStart(date: string, timeZone: string): number | null {
  const midnight = localInstants(date, "00:00", timeZone);
  if (midnight.length) return midnight[0]!;
  const parts = dateParts(date);
  if (!parts) return null;
  const center = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  let low = center - 48 * 3_600_000, high = center + 48 * 3_600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (zonedWallClock(middle, timeZone).date < date) low = middle; else high = middle;
  }
  return zonedWallClock(high, timeZone).date === date ? high : null;
}

// ---- busy time ----

interface Interval { start: number; end: number }
interface BusyRead { from: number; to: number; complete: boolean; busy: Interval[] }

/** null when the availability cannot be read (invalid ranges, too many items). */
function readBusy(availability: MeetingBusyAvailability, timeZone: string): BusyRead | null {
  if (availability.items.length > MAX_BUSY_ITEMS) return null;
  const from = parseTimestamp(availability.from), to = parseTimestamp(availability.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  const busy: Interval[] = [];
  for (const item of availability.items) {
    let interval: Interval | null;
    if (item.allDay && dateParts(item.startsAt)) {
      const endDate = item.endsAt && dateParts(item.endsAt) ? item.endsAt : addLocalDays(item.startsAt, 1);
      const start = dayStart(item.startsAt, timeZone), end = endDate ? dayStart(endDate, timeZone) : null;
      interval = start !== null && end !== null ? { start, end } : null;
    } else {
      const start = parseTimestamp(item.startsAt), end = item.endsAt ? parseTimestamp(item.endsAt) : NaN;
      if (Number.isFinite(end)) interval = { start, end };
      else {
        // A point has unknown duration: its whole local day is busy.
        const day = Number.isFinite(start) ? zonedWallClock(start, timeZone).date : null;
        const next = day ? addLocalDays(day, 1) : null;
        const dayFrom = day ? dayStart(day, timeZone) : null, dayTo = next ? dayStart(next, timeZone) : null;
        interval = dayFrom !== null && dayTo !== null ? { start: dayFrom, end: dayTo } : null;
      }
    }
    if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end <= interval.start) return null;
    busy.push(interval);
  }
  return { from, to, complete: availability.complete, busy };
}

function collides(read: BusyRead, start: number, end: number, bufferMinutes: number): boolean {
  const before = start - bufferMinutes * MINUTE, after = end + bufferMinutes * MINUTE;
  return read.busy.some((range) => range.start < after && range.end > before);
}

// ---- settings rules ----

function settingsWindow(settings: SchedulingAvailabilitySettings) {
  const start = timeMinutes(settings.start), end = timeMinutes(settings.end);
  const lunchStart = settings.lunch ? timeMinutes(settings.lunch.start) : NaN;
  const lunchEnd = settings.lunch ? timeMinutes(settings.lunch.end) : NaN;
  return { start, end, lunchStart, lunchEnd, weekdays: new Set(settings.weekdays) };
}

function allowedAt(settings: SchedulingAvailabilitySettings, hours: ReturnType<typeof settingsWindow>, startMs: number, endMs: number, timeZone: string, now: number): boolean {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  if (startMs <= now + minimumNoticeMinutes(settings.minimumNotice) * MINUTE) return false;
  const startClock = zonedWallClock(startMs, timeZone), endClock = zonedWallClock(endMs, timeZone);
  const weekday = localWeekday(startClock.date);
  if (!weekday || !hours.weekdays.has(weekday)) return false;
  const startMinute = timeMinutes(startClock.time);
  // A slot ending exactly at local midnight reads as 24:00 of the same day.
  const endMinute = endClock.date === startClock.date ? timeMinutes(endClock.time)
    : endClock.date === addLocalDays(startClock.date, 1) && endClock.time === "00:00" ? 24 * 60 : NaN;
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) return false;
  if (startMinute < hours.start || endMinute > hours.end) return false;
  if (Number.isFinite(hours.lunchStart) && startMinute < hours.lunchEnd && endMinute > hours.lunchStart) return false;
  return true;
}

/** Does the slot fit the settings (weekday, hours, lunch, minimum notice)? Busy time is not considered. */
export function isSlotAllowed(settings: SchedulingAvailabilitySettings, slot: MeetingSlot, input: { timeZone: string; now: number }): boolean {
  if (!isValidTimeZone(input.timeZone) || !Number.isFinite(input.now)) return false;
  return allowedAt(settings, settingsWindow(settings), parseTimestamp(slot.startsAt), parseTimestamp(slot.endsAt), input.timeZone, input.now);
}

/**
 * The grid for `days` (local dates). Rows run every 30 minutes from the settings'
 * start up to its end. A cell is
 *   off      outside the settings (weekday, hours, lunch, too soon, or a local time
 *            that does not exist);
 *   busy     overlaps busy time (with the buffer on both sides);
 *   unknown  the calendars were not read completely, the cell is outside the window
 *            that was read, or no availability was given — it may still be picked by hand;
 *   allowed  confirmed free.
 * `durationMinutes` defaults to the settings' duration.
 */
export function availabilityGrid(settings: SchedulingAvailabilitySettings, input: {
  timeZone: string;
  now: number;
  days: readonly string[];
  availability: MeetingBusyAvailability | null;
  durationMinutes?: number;
}): MeetingSlotGrid {
  const hours = settingsWindow(settings);
  const rows: string[] = [];
  if (Number.isFinite(hours.start) && Number.isFinite(hours.end)) {
    for (let minute = hours.start; minute < hours.end; minute += STEP_MINUTES) rows.push(timeText(minute));
  }
  const zoneValid = isValidTimeZone(input.timeZone) && Number.isFinite(input.now);
  const duration = input.durationMinutes ?? settings.durationMinutes;
  const read = zoneValid && input.availability ? readBusy(input.availability, input.timeZone) : null;
  const days: MeetingSlotGridDay[] = [];
  for (const date of input.days) {
    const weekday = localWeekday(date);
    if (!weekday) continue;
    const cells = rows.map((time): MeetingSlotCell => {
      const start = zoneValid ? resolveLocal(date, time, input.timeZone) : null;
      if (start === null || !Number.isFinite(duration) || duration <= 0) return { time, startsAt: null, endsAt: null, state: "off" };
      const end = start + duration * MINUTE;
      const slot = { time, startsAt: isoTimestamp(start), endsAt: isoTimestamp(end) };
      if (!allowedAt(settings, hours, start, end, input.timeZone, input.now)) return { ...slot, state: "off" };
      if (!read) return { ...slot, state: "unknown" };
      if (collides(read, start, end, settings.bufferMinutes)) return { ...slot, state: "busy" };
      if (!read.complete || start < read.from || end > read.to) return { ...slot, state: "unknown" };
      return { ...slot, state: "allowed" };
    });
    days.push({ date, weekday, cells });
  }
  return { rows, days };
}

/**
 * Automatic preselection: from tomorrow (local), the first confirmed-free slot of
 * each allowed day (one per day), until `count` (3) are found within `horizonDays`
 * (14). Fewer than `count` → [] (as before: the person picks by hand). Incomplete
 * calendars → [] (only confirmed-free slots are preselected).
 */
export function seedMeetingSlots(settings: SchedulingAvailabilitySettings, input: {
  timeZone: string;
  now: number;
  availability: MeetingBusyAvailability;
  count?: number;
  horizonDays?: number;
  durationMinutes?: number;
}): MeetingSlot[] {
  const count = input.count ?? 3, horizon = input.horizonDays ?? 14;
  const duration = input.durationMinutes ?? settings.durationMinutes;
  if (!input.availability.complete || !Number.isFinite(input.now) || !isValidTimeZone(input.timeZone)) return [];
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const read = readBusy(input.availability, input.timeZone);
  if (!read || read.to - read.from > 15 * DAY) return [];
  const hours = settingsWindow(settings);
  if (!Number.isFinite(hours.start) || !Number.isFinite(hours.end)) return [];
  const today = zonedWallClock(input.now, input.timeZone).date;
  const result: MeetingSlot[] = [];
  for (let offset = 1; offset <= horizon && result.length < count; offset++) {
    const day = addLocalDays(today, offset);
    const weekday = day ? localWeekday(day) : null;
    if (!day || !weekday || !hours.weekdays.has(weekday)) continue;
    for (let minute = hours.start; minute + duration <= hours.end; minute += STEP_MINUTES) {
      const start = resolveLocal(day, timeText(minute), input.timeZone);
      if (start === null) continue;
      const end = start + duration * MINUTE;
      if (start < read.from || end > read.to) continue;
      if (!allowedAt(settings, hours, start, end, input.timeZone, input.now)) continue;
      if (collides(read, start, end, settings.bufferMinutes)) continue;
      result.push({ startsAt: isoTimestamp(start)!, endsAt: isoTimestamp(end)! });
      break;
    }
  }
  return result.length === count ? result : [];
}

// ---- text ----

const WEEKDAY_LABEL: Record<MeetingSlotLanguage, Record<SchedulingWeekday, string>> = {
  ja: { mon: "月", tue: "火", wed: "水", thu: "木", fri: "金", sat: "土", sun: "日" },
  zh: { mon: "周一", tue: "周二", wed: "周三", thu: "周四", fri: "周五", sat: "周六", sun: "周日" },
  en: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
};
const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MEDIUM_LABEL: Record<"ja" | "zh", Record<MeetingSlotMedium, string>> = {
  ja: { video: "オンライン", in_person: "対面", phone: "お電話" },
  zh: { video: "线上", in_person: "面谈", phone: "电话" },
};
const EN_MEETING: Record<MeetingSlotMedium | "none", (minutes: number) => string> = {
  video: (minutes) => `a ${minutes}-minute online meeting`,
  in_person: (minutes) => `a ${minutes}-minute meeting in person`,
  phone: (minutes) => `a ${minutes}-minute phone call`,
  none: (minutes) => `a ${minutes}-minute meeting`,
};
/** The first line of an inserted paragraph, in any language (used to find it again): slots (R40) and ranges (R43). */
const INTRO_PATTERNS = [
  /^以下の日時のいずれかで、.*お時間をいただけますでしょうか.*$/,
  /^以下时间您是否方便？.*$/,
  /^Would any of these times work for .*\?$/,
  /^以下の時間帯のうち、.*お時間をいただけますでしょうか.*$/,
  /^以下时间段里，任选.*您是否方便？.*$/,
  /^Would any \d+ minutes within these times work for .*\?$/,
];
const SLOT_LINE = /^(?:・|- )/;
const CLOSING_PATTERNS = [
  /よろしくお願い/,
  /^(?:期待|谢谢|多谢|此致|祝好|顺祝|顺颂)/,
  /^(?:best|regards|kind regards|warm regards|thanks|thank you|sincerely|cheers|all the best)\b/i,
];

function introLine(language: MeetingSlotLanguage, minutes: number, medium: MeetingSlotMedium | null): string {
  if (language === "ja") return `以下の日時のいずれかで、${minutes} 分ほどお時間をいただけますでしょうか${medium ? `（${MEDIUM_LABEL.ja[medium]}）` : ""}。`;
  if (language === "zh") return `以下时间您是否方便？想约您 ${minutes} 分钟左右${medium ? `（${MEDIUM_LABEL.zh[medium]}）` : ""}。`;
  return `Would any of these times work for ${EN_MEETING[medium ?? "none"](minutes)}?`;
}

function slotLine(language: MeetingSlotLanguage, slot: MeetingSlot, timeZone: string): string | null {
  const start = parseTimestamp(slot.startsAt), end = parseTimestamp(slot.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const from = zonedWallClock(start, timeZone), to = zonedWallClock(end, timeZone);
  const weekday = localWeekday(from.date);
  if (!weekday) return null;
  const month = Number(from.date.slice(5, 7)), day = Number(from.date.slice(8, 10));
  const range = `${from.time}–${to.time}`;
  if (language === "en") return `- ${WEEKDAY_LABEL.en[weekday]}, ${MONTH_EN[month - 1]} ${day}, ${range}`;
  return language === "ja" ? `・${month}/${day}（${WEEKDAY_LABEL.ja[weekday]}）${range}` : `・${month}/${day}（${WEEKDAY_LABEL.zh[weekday]}）${range}`;
}

/**
 * The paragraph for an e-mail body (design ③), e.g.
 *   以下の日時のいずれかで、30 分ほどお時間をいただけますでしょうか（オンライン）。
 *   ・11/18（火）10:00–10:30
 * Dates and times are in `timeZone`. Empty string when no slot can be written.
 */
export function formatMeetingSlotsText(slots: readonly MeetingSlot[], input: {
  language: MeetingSlotLanguage;
  timeZone: string;
  durationMinutes: number;
  medium?: MeetingSlotMedium | null;
}): string {
  if (!isValidTimeZone(input.timeZone)) return "";
  const lines = [...slots]
    .sort((a, b) => parseTimestamp(a.startsAt) - parseTimestamp(b.startsAt))
    .map((slot) => slotLine(input.language, slot, input.timeZone))
    .filter((line): line is string => line !== null);
  if (!lines.length) return "";
  return [introLine(input.language, input.durationMinutes, input.medium ?? null), ...lines].join("\n");
}

const EN_RANGE_MEETING: Record<MeetingSlotMedium | "none", string> = {
  video: "an online meeting",
  in_person: "a meeting in person",
  phone: "a phone call",
  none: "a meeting",
};

function rangesIntroLine(language: MeetingSlotLanguage, minutes: number, medium: MeetingSlotMedium | null): string {
  if (language === "ja") return `以下の時間帯のうち、${minutes} 分ほどお時間をいただけますでしょうか${medium ? `（${MEDIUM_LABEL.ja[medium]}）` : ""}。`;
  if (language === "zh") return `以下时间段里，任选 ${minutes} 分钟您是否方便？${medium ? `（${MEDIUM_LABEL.zh[medium]}）` : ""}`;
  return `Would any ${minutes} minutes within these times work for ${EN_RANGE_MEETING[medium ?? "none"]}?`;
}

/** A valid slot's [start, end] in milliseconds, or null. */
function slotSpan(slot: MeetingSlot): [number, number] | null {
  const start = parseTimestamp(slot.startsAt), end = parseTimestamp(slot.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
}

export interface MeetingCandidateSlices {
  /** The candidates that go out (at most `max`), in time order. */
  sent: MeetingSlot[];
  /** Candidates after the first `max`: drawn lighter, not sent. */
  extra: MeetingSlot[];
  /** Ranges shorter than one meeting: drawn as an outline, not sent. */
  short: MeetingSlot[];
}

/**
 * Painted ranges → candidates (R43 D4). Each range is cut from its start into
 * non-overlapping pieces of `durationMinutes` (10:00–12:00 · 60 → 10:00, 11:00);
 * a tail shorter than one meeting is dropped, a range shorter than one meeting is
 * `short`. Candidates are numbered in time order across days; the first `max` (5)
 * are `sent`, the rest `extra`. Invalid ranges are ignored.
 */
export function sliceMeetingCandidates(ranges: readonly MeetingSlot[], durationMinutes: number, max = 5): MeetingCandidateSlices {
  const result: MeetingCandidateSlices = { sent: [], extra: [], short: [] };
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return result;
  const step = durationMinutes * MINUTE;
  const spans = ranges.map(slotSpan).filter((span): span is [number, number] => span !== null).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [start, end] of spans) {
    if (end - start < step) { result.short.push({ startsAt: isoTimestamp(start)!, endsAt: isoTimestamp(end)! }); continue; }
    for (let at = start; at + step <= end; at += step) {
      const slot = { startsAt: isoTimestamp(at)!, endsAt: isoTimestamp(at + step)! };
      (result.sent.length < max ? result.sent : result.extra).push(slot);
    }
  }
  return result;
}

/**
 * The e-mail paragraph written as ranges (R43 D5): no cutting, no limit of 5; only
 * ranges at least one meeting long are written. e.g.
 *   以下の時間帯のうち、60 分ほどお時間をいただけますでしょうか（オンライン）。
 *   ・11/18（水）09:00–11:00
 * Lines read like formatMeetingSlotsText's. Empty string when nothing can be written.
 */
export function formatMeetingRangesText(ranges: readonly MeetingSlot[], input: {
  language: MeetingSlotLanguage;
  timeZone: string;
  durationMinutes: number;
  medium?: MeetingSlotMedium | null;
}): string {
  if (!isValidTimeZone(input.timeZone) || !Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) return "";
  const step = input.durationMinutes * MINUTE;
  const lines = ranges
    .map((range) => ({ range, span: slotSpan(range) }))
    .filter((item): item is { range: MeetingSlot; span: [number, number] } => item.span !== null && item.span[1] - item.span[0] >= step)
    .sort((a, b) => a.span[0] - b.span[0])
    .map((item) => slotLine(input.language, item.range, input.timeZone))
    .filter((line): line is string => line !== null);
  if (!lines.length) return "";
  return [rangesIntroLine(input.language, input.durationMinutes, input.medium ?? null), ...lines].join("\n");
}

/** [first line, line after the last] of the inserted paragraph, or null. */
function findInserted(lines: readonly string[]): [number, number] | null {
  for (let index = 0; index < lines.length; index++) {
    if (!INTRO_PATTERNS.some((pattern) => pattern.test(lines[index]!.trim()))) continue;
    let end = index + 1;
    while (end < lines.length && SLOT_LINE.test(lines[end]!.trim())) end++;
    return [index, end];
  }
  return null;
}

/**
 * Put `block` (from formatMeetingSlotsText or formatMeetingRangesText) into an e-mail body:
 *   1. `previous` (the block inserted last time) found verbatim → replaced;
 *   2. otherwise a paragraph this function's format recognises (its first line
 *      followed by "・"/"- " lines) → replaced;
 *   3. otherwise inserted as its own paragraph before the closing line
 *      (よろしくお願いします / 期待… / Best regards…), or appended at the end.
 * Everything else in the body stays as the person wrote it. An empty `block`
 * removes the inserted paragraph.
 */
export function replaceMeetingSlotsText(body: string, block: string, options: { previous?: string | null } = {}): string {
  const previous = options.previous?.trim();
  if (previous) {
    const at = body.indexOf(previous);
    if (at >= 0) return splice(body.slice(0, at), body.slice(at + previous.length), block);
  }
  const lines = body.split("\n");
  const found = findInserted(lines);
  if (found) {
    const before = found[0] > 0 ? `${lines.slice(0, found[0]).join("\n")}\n` : "";
    const after = found[1] < lines.length ? `\n${lines.slice(found[1]).join("\n")}` : "";
    return splice(before, after, block);
  }
  if (!block) return body;
  const trimmed = body.replace(/\s+$/, "");
  if (!trimmed) return block;
  const paragraphs = trimmed.split(/\n[ \t]*\n/);
  const last = paragraphs[paragraphs.length - 1]!.trim();
  if (paragraphs.length > 1 && CLOSING_PATTERNS.some((pattern) => pattern.test(last))) {
    const at = trimmed.lastIndexOf(paragraphs[paragraphs.length - 1]!);
    return `${trimmed.slice(0, at).replace(/\s+$/, "")}\n\n${block}\n\n${trimmed.slice(at)}`;
  }
  return `${trimmed}\n\n${block}`;
}

/** Join the text around the inserted paragraph; a removal leaves at most one blank line at the seam. */
function splice(before: string, after: string, block: string): string {
  if (block) return `${before}${block}${after}`;
  const head = before.replace(/\n+$/, ""), tail = after.replace(/^\n+/, "");
  if (!head || !tail) return head || tail;
  return `${head}\n\n${tail}`;
}
