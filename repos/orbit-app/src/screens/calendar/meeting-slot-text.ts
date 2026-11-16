// contact-reach R42: how a candidate time reads on screen (design ②④⑥⑦, same wording as Web R41's meeting-slot-text):
// 「11/18（火）10:00 – 11:00」. Dates and times are shown in the zone the slot was picked in.
import type { MeetingDetailsMedium } from "../../api/contract/appointments";
import type { SchedulingAvailabilitySettings, SchedulingMinimumNotice, SchedulingWeekday } from "../../api/contract/scheduling-availability";
import { localWeekday } from "../../api/compute/meeting-slots";
import type { MessageKey, OrbitTranslator } from "../../i18n/messages";

const WEEKDAY_KEY: Record<SchedulingWeekday, MessageKey> = { mon: "calendar.slot.mon", tue: "calendar.slot.tue", wed: "calendar.slot.wed", thu: "calendar.slot.thu", fri: "calendar.slot.fri", sat: "calendar.slot.sat", sun: "calendar.slot.sun" };
const NOTICE_KEY: Record<SchedulingMinimumNotice, MessageKey> = { "15m": "calendar.slot.notice15m", "1h": "calendar.slot.notice1h", "4h": "calendar.slot.notice4h", "1d": "calendar.slot.notice1d", "2d": "calendar.slot.notice2d" };
const MEDIUM_KEY: Record<MeetingDetailsMedium["kind"], MessageKey> = { video: "calendar.slot.video", in_person: "calendar.slot.inPerson", phone: "calendar.slot.phone" };
export const ALL_WEEKDAYS: readonly SchedulingWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const weekdayLabel = (day: SchedulingWeekday, t: OrbitTranslator) => t(WEEKDAY_KEY[day]);
export const noticeLabel = (notice: SchedulingMinimumNotice, t: OrbitTranslator) => t(NOTICE_KEY[notice]);
export const mediumLabel = (kind: MeetingDetailsMedium["kind"], t: OrbitTranslator) => t(MEDIUM_KEY[kind]);

/** The wall clock of an instant in a zone ("YYYY-MM-DD", "HH:mm"). */
export function wallClock(instant: string, zone: string): { date: string; time: string } | null {
  const at = Date.parse(instant);
  if (!Number.isFinite(at)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  } catch { return null; }
}

/** 「11/18（火）」 / 「Tue, 11/18」 for a local date. */
export function dayLabel(date: string, t: OrbitTranslator): string {
  const weekday = localWeekday(date);
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return weekday ? t("calendar.slot.day", { md, wd: weekdayLabel(weekday, t) }) : md;
}

/** 「11/18（火）10:00 – 11:00」 */
export function slotLabel(slot: { startsAt: string; endsAt: string }, zone: string, t: OrbitTranslator): string {
  const from = wallClock(slot.startsAt, zone), to = wallClock(slot.endsAt, zone);
  if (!from || !to) return "";
  return t("calendar.slot.range", { day: dayLabel(from.date, t), from: from.time, to: to.time });
}

/** The parts of the picker's rules line: 「平日 09:00–18:00 · 15分前まで」. */
export function rulesSummary(settings: SchedulingAvailabilitySettings, t: OrbitTranslator): { days: string; start: string; end: string; notice: string } {
  const set = new Set(settings.weekdays);
  const weekdaysOnly = set.size === 5 && ALL_WEEKDAYS.slice(0, 5).every((day) => set.has(day));
  const days = weekdaysOnly ? t("calendar.pick.weekdays") : ALL_WEEKDAYS.filter((day) => set.has(day)).map((day) => weekdayLabel(day, t)).join(t("calendar.slot.listJoin"));
  return { days, start: settings.start, end: settings.end, notice: noticeLabel(settings.minimumNotice, t) };
}
