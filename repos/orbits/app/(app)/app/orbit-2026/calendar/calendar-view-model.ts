import type { ScheduleItemContract } from "../../../../../shared/contract/tasks";
import type { CalendarExternalEventContract } from "../../../../../shared/contract/calendar-external-events";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { calendarDate, localParts } from "../../../../../features/tasks/local-date-time";
import { personalScheduleDayStart } from "../../tasks/personal-schedule-editor-model";
import { calendarWindow, type CalendarMode } from "./calendar-range";

export interface CalendarEntry {
  key: string; id: string; sourceId: string; kind: "personal" | "meeting" | "event" | "external";
  title: string; startsAt: string; endsAt?: string; location?: string; allDay: boolean; readOnly: boolean;
}
export interface CalendarDayEntry extends CalendarEntry { startMinute: number; endMinute: number; timeLabel: string }
export interface CalendarDayView {
  date: string; dayNumber: number; inMonth: boolean; minutes: number;
  hours: { minute: number; label: string }[]; items: CalendarDayEntry[]; allDay: CalendarDayEntry[];
  timed: (CalendarDayEntry & { column: number; columns: number })[];
}
const localeFor = (language: OrbitLanguage) => language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB";
const lexical = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/** Greedy interval colouring; connected clusters share a width, touching ends do not overlap. */
export function layoutCalendarIntervals<T extends { key: string; startMinute: number; endMinute: number }>(items: readonly T[]): (T & { column: number; columns: number })[] {
  const ordered = [...items].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || lexical(a.key, b.key));
  const result: (T & { column: number; columns: number })[] = [];
  let cluster: (T & { column: number; columns: number })[] = [], ends: number[] = [], clusterEnd = -Infinity;
  const flush = () => { result.push(...cluster.map(item => ({ ...item, columns: ends.length }))); cluster = []; ends = []; clusterEnd = -Infinity; };
  for (const item of ordered) {
    if (item.startMinute >= clusterEnd) flush();
    let column = ends.findIndex(end => end <= item.startMinute);
    if (column < 0) column = ends.length;
    const end = Math.max(item.endMinute, item.startMinute + 15);
    ends[column] = end; clusterEnd = Math.max(clusterEnd, end);
    cluster.push({ ...item, column, columns: 1 });
  }
  flush(); return result;
}

export function calendarDaysView(input: { date: string; mode: CalendarMode; timeZone: string; language: OrbitLanguage; internal: readonly ScheduleItemContract[]; external: readonly CalendarExternalEventContract[] }): CalendarDayView[] {
  const window = calendarWindow(input.date, input.mode, input.timeZone);
  const locale = localeFor(input.language);
  const time = new Intl.DateTimeFormat(locale, { timeZone: input.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const entries = [
    ...input.internal.filter(item => item.state !== "cancelled").map(item => ({ entry: { key: `${item.kind}:${item.id}`, id: item.id, sourceId: item.sourceId, kind: item.kind, title: item.title, startsAt: item.startsAt, endsAt: item.endsAt, location: item.location, allDay: Boolean(item.allDay), readOnly: item.kind !== "personal" } satisfies CalendarEntry, savedZone: item.allDay ? item.timeZone ?? input.timeZone : input.timeZone })),
    ...input.external.map(item => ({ entry: { key: `external:${item.id}`, id: item.id, sourceId: item.id, kind: "external" as const, title: item.titlePreview, startsAt: item.startsAt, endsAt: item.endsAt, location: item.locationPreview, allDay: item.allDay, readOnly: true } satisfies CalendarEntry, savedZone: input.timeZone })),
  ];
  return window.days.map(date => {
    const next = calendarDate(date)!; next.setUTCDate(next.getUTCDate() + 1);
    const startAt = Date.parse(personalScheduleDayStart(date, input.timeZone)!);
    const endAt = Date.parse(personalScheduleDayStart(next.toISOString().slice(0, 10), input.timeZone)!);
    const minutes = (endAt - startAt) / 60000;
    const hourFormat = minutes === 1440 ? time : new Intl.DateTimeFormat(locale, { timeZone: input.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" });
    const hours = Array.from({ length: Math.ceil(minutes / 60) }, (_, index) => ({ minute: index * 60, label: hourFormat.format(startAt + index * 3600000) }));
    const items = entries.flatMap(({ entry, savedZone }) => {
      const floating = entry.allDay && /^\d{4}-\d{2}-\d{2}$/u.test(entry.startsAt);
      const start = floating ? entry.startsAt : localParts(entry.startsAt, savedZone).date;
      const last = entry.endsAt ? floating ? new Date(Date.parse(entry.endsAt) - 1).toISOString().slice(0, 10) : localParts(Date.parse(entry.endsAt) - 1, savedZone).date : start;
      if (date < start || date > last) return [];
      const startMinute = entry.allDay ? 0 : Math.max(0, (Date.parse(entry.startsAt) - startAt) / 60000);
      const endMinute = entry.allDay ? minutes : entry.endsAt ? Math.min(minutes, (Date.parse(entry.endsAt) - startAt) / 60000) : startMinute;
      return [{ ...entry, startMinute, endMinute, timeLabel: entry.allDay ? "" : time.format(new Date(entry.startsAt)) }];
    }).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMinute - b.startMinute || lexical(a.key, b.key));
    return { date, dayNumber: Number(date.slice(8)), inMonth: date.slice(0, 7) === input.date.slice(0, 7), minutes, hours, items, allDay: items.filter(item => item.allDay), timed: layoutCalendarIntervals(items.filter(item => !item.allDay)) };
  });
}
