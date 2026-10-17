"use client";

import { Button, Chip, EmptyState, IconButton, RetryCard, Segmented, Skeleton, useScopeLanguage } from "../ui";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import type { CalendarMode } from "./calendar-range";
import { layoutCalendarIntervals, type CalendarDayView, type CalendarEntry } from "./calendar-view-model";
import type { CalendarExternalRead } from "./calendar-read-client";
import type { CalendarPart } from "./useCalendarPage";
import styles from "./calendar.module.css";

type State = CalendarPart<unknown>["state"];
export function CalendarPresenter({ date, today, timeZone, mode, days, internalState, externalState, connection, partial, onNavigate, onToday, onModeChange, onDaySelect, onEntrySelect, onRetry }: {
  date: string; today: string; timeZone: string; mode: CalendarMode; days: readonly CalendarDayView[];
  internalState: State; externalState: State; connection: CalendarExternalRead["connection"]; partial: boolean;
  onNavigate: (direction: -1 | 1) => void; onToday: () => void; onModeChange: (mode: CalendarMode) => void;
  onDaySelect: (date: string) => void; onEntrySelect: (entry: CalendarEntry) => void; onRetry: () => void;
}) {
  const language = useScopeLanguage();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const locale = language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB";
  const dayFormat = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" });
  const monthFormat = new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "long" });
  const at = (key: string) => new Date(`${key}T12:00:00Z`);
  const heading = mode === "month" ? monthFormat.format(at(date)) : mode === "week" && days.length ? `${dayFormat.format(at(days[0]!.date))} – ${dayFormat.format(at(days.at(-1)!.date))}` : dayFormat.format(at(date));
  const visible = days.map(day => {
    const items = day.items.filter(item => item.kind === "external" ? externalState === "ready" && connection === "connected" : internalState === "ready");
    return { ...day, items, allDay: items.filter(item => item.allDay), timed: layoutCalendarIntervals(items.filter(item => !item.allDay)) };
  });
  const entry = (item: CalendarEntry, timeLabel?: string) => <button type="button" className={`${styles.entry} ${styles[item.kind]}`} onClick={() => onEntrySelect(item)}>{timeLabel ? <time>{timeLabel} </time> : null}{item.title || t(taskCopy.calendarUntitled)}</button>;
  const connect = connection === "not_connected" || connection === "needs_reconnect";
  const failedGoogle = externalState === "failed" || externalState === "ready" && connection === "unavailable";
  return <section aria-label={t(taskCopy.calendarTitle)}>
    <header className={styles.toolbar}><div className={styles.row}><h2 className={styles.title}>{heading}</h2><IconButton label={t(taskCopy.calendarPrevious)} icon="left" size={34} onClick={() => onNavigate(-1)} /><IconButton label={t(taskCopy.calendarNext)} icon="right" size={34} onClick={() => onNavigate(1)} /><Button label={t(taskCopy.calendarToday)} size="sm" onClick={onToday} /></div>
      <Segmented label={t(taskCopy.calendarTitle)} value={mode} onChange={onModeChange} segments={[{ key: "day", label: t(taskCopy.calendarDay) }, { key: "week", label: t(taskCopy.calendarWeek) }, { key: "month", label: t(taskCopy.calendarMonth) }]} /></header>
    <div className={styles.status}><span className={styles.note}>{timeZone}</span>{externalState === "loading" ? <span role="status" className={styles.note}>{t(taskCopy.calendarLoadingGoogle)}</span> : failedGoogle ? <RetryCard title={t(taskCopy.calendarGoogleUnavailable)} onRetry={onRetry} /> : externalState === "ready" ? connect ? <div className={styles.row}><span className={styles.note}>{t(connection === "needs_reconnect" ? taskCopy.calendarGoogleReconnect : taskCopy.calendarGoogleNotConnected)}</span><a href="/api/integrations/google_calendar/authorize?returnTo=calendar">{t(taskCopy.calendarGoogleConnect)}</a></div> : <><Chip label={t(taskCopy.calendarGoogleConnected)} tone="teal" /><span className={styles.note}>{t(taskCopy.calendarGoogleReadOnly)}</span></> : null}</div>
    {internalState === "failed" ? <RetryCard title={t(taskCopy.calendarReadFailed)} onRetry={onRetry} /> : internalState === "loading" ? <Skeleton lines={2} onRetry={onRetry} /> : null}
    {partial ? <p role="status" className={styles.note}>{t(taskCopy.calendarPartial)}</p> : null}
    <div className={styles.legend}>{(["personal", "meeting", "event", "external"] as const).map(kind => <span key={kind} className={`${styles.legendItem} ${styles[kind]}`}>{t(kind === "personal" ? taskCopy.calendarPersonal : kind === "meeting" ? taskCopy.calendarMeeting : kind === "event" ? taskCopy.calendarEvent : taskCopy.calendarGoogleReadOnly)}</span>)}</div>
    {mode === "month" ? <div className={styles.month}>{visible.slice(0, 7).map(day => <div className={styles.weekday} key={`weekday:${day.date}`}>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(at(day.date))}</div>)}{visible.map(day => <section key={day.date} data-calendar-date={day.date} aria-label={dayFormat.format(at(day.date))} className={`${styles.monthDay} ${!day.inMonth ? styles.outside : ""} ${day.date === date ? styles.selected : ""}`}>
      <button type="button" aria-pressed={day.date === date} aria-current={day.date === today ? "date" : undefined} className={styles.dayNumber} onClick={() => onDaySelect(day.date)}>{day.dayNumber}</button>
      {day.items.slice(0, 3).map(item => <div key={item.key}>{entry(item, item.timeLabel)}</div>)}{day.items.length > 3 ? <Button size="sm" variant="ghost" label={t(taskCopy.calendarMore).replace("{count}", String(day.items.length - 3))} onClick={() => { onDaySelect(day.date); onModeChange("day"); }} /> : null}
    </section>)}</div> : <div className={`${styles.columns} ${mode === "day" ? styles.single : ""}`}>{visible.map(day => <section key={day.date} data-calendar-date={day.date} className={styles.column} aria-label={dayFormat.format(at(day.date))}>
      <button type="button" className={styles.columnDate} aria-pressed={day.date === date} onClick={() => onDaySelect(day.date)}>{dayFormat.format(at(day.date))}</button>
      <div className={styles.allDay}><span className={styles.note}>{t(taskCopy.calendarAllDay)}</span>{day.allDay.map(item => <div key={item.key}>{entry(item)}</div>)}</div>
      <div className={styles.timeline} style={{ height: day.minutes * 0.8 }}>{day.hours.map(hour => <div key={hour.minute} className={styles.hour} style={{ top: hour.minute * 0.8 }}><time>{hour.label}</time></div>)}{day.timed.map(item => <div key={item.key} className={styles.timeEntry} style={{ top: item.startMinute * 0.8, height: Math.max(24, (item.endMinute - item.startMinute) * 0.8), left: `calc(60px + (100% - 60px) * ${item.column / item.columns})`, width: `calc((100% - 60px) / ${item.columns})` }}>{entry(item, item.timeLabel)}</div>)}</div>
    </section>)}</div>}
    {internalState === "ready" && externalState === "ready" && connection === "connected" && !partial && !visible.some(day => day.items.length) ? <EmptyState title={t(taskCopy.calendarEmpty)} /> : null}
  </section>;
}
