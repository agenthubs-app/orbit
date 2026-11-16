// contact-reach R41: how a candidate time reads on screen (design ②④⑥): 「11/18（火）10:00 – 11:00」.
// Dates and times are in the zone the slot was picked in; the words come from the task copy table.
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { MeetingDetailsMedium } from "../../../../../shared/contract/appointments";
import type { SchedulingAvailabilitySettings, SchedulingMinimumNotice, SchedulingWeekday } from "../../../../../shared/contract/scheduling-availability";
import { localWeekday } from "../../../../../shared/compute/meeting-slots";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import { fillCopy } from "../ui";

const WEEKDAY_KEY = { mon: "wdMon", tue: "wdTue", wed: "wdWed", thu: "wdThu", fri: "wdFri", sat: "wdSat", sun: "wdSun" } as const satisfies Record<SchedulingWeekday, keyof typeof taskCopy>;
const NOTICE_KEY = { "15m": "notice15m", "1h": "notice1h", "4h": "notice4h", "1d": "notice1d", "2d": "notice2d" } as const satisfies Record<SchedulingMinimumNotice, keyof typeof taskCopy>;
const MEDIUM_KEY = { video: "mediumVideo", in_person: "mediumInPerson", phone: "mediumPhone" } as const;
const ALL_DAYS: readonly SchedulingWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export const weekdayLabel = (day: SchedulingWeekday, language: OrbitLanguage) => pickCopy(taskCopy[WEEKDAY_KEY[day]], language);
export const noticeLabel = (notice: SchedulingMinimumNotice, language: OrbitLanguage) => pickCopy(taskCopy[NOTICE_KEY[notice]], language);
export const mediumLabel = (kind: MeetingDetailsMedium["kind"], language: OrbitLanguage) => pickCopy(taskCopy[MEDIUM_KEY[kind]], language);

function wall(instant: string, zone: string): { date: string; time: string } | null {
  const at = Date.parse(instant);
  if (!Number.isFinite(at)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  } catch { return null; }
}

/** 「11/18（火）」 / 「Tue, 11/18」 for a local date. */
export function dayLabel(date: string, language: OrbitLanguage): string {
  const weekday = localWeekday(date);
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return weekday ? fillCopy(pickCopy(taskCopy.slotDay, language), { md, wd: weekdayLabel(weekday, language) }) : md;
}

/** 「11/18（火）10:00 – 11:00」 */
export function slotLabel(slot: { startsAt: string; endsAt: string }, zone: string, language: OrbitLanguage): string {
  const from = wall(slot.startsAt, zone), to = wall(slot.endsAt, zone);
  if (!from || !to) return "";
  return fillCopy(pickCopy(taskCopy.slotRange, language), { day: dayLabel(from.date, language), from: from.time, to: to.time });
}

/** 「平日 09:00–18:00 · 15分前まで」 summary parts for the picker's rules line. */
export function rulesSummary(settings: SchedulingAvailabilitySettings, language: OrbitLanguage): { days: string; start: string; end: string; notice: string } {
  const set = new Set(settings.weekdays);
  const weekdaysOnly = set.size === 5 && ["mon", "tue", "wed", "thu", "fri"].every((day) => set.has(day as SchedulingWeekday));
  const days = weekdaysOnly ? pickCopy(taskCopy.pickWeekdays, language) : ALL_DAYS.filter((day) => set.has(day)).map((day) => weekdayLabel(day, language)).join(pickCopy(taskCopy.listJoin, language));
  return { days, start: settings.start, end: settings.end, notice: noticeLabel(settings.minimumNotice, language) };
}
