"use client";

import { useEffect, useRef } from "react";
import { Button, Card, Chip, EmptyState, IconButton, RetryCard, Segmented, Skeleton, useScopeLanguage } from "../ui";
import { taskCopy } from "../copy/task";
import { pickCopy } from "../copy/types";
import type { CalendarMode } from "./calendar-range";
import { layoutCalendarIntervals, type CalendarDayView, type CalendarEntry } from "./calendar-view-model";
import type { CalendarExternalRead } from "./calendar-read-client";
import type { CalendarPart } from "./useCalendarPage";
import styles from "./calendar.module.css";

type State = CalendarPart<unknown>["state"];
export function CalendarPresenter({ date, today, timeZone, mode, days, internalState, externalState, connection, partial, onNavigate, onToday, onModeChange, onDaySelect, onEntrySelect, onAddPersonal, onRetry }: {
  date: string; today: string; timeZone: string; mode: CalendarMode; days: readonly CalendarDayView[];
  internalState: State; externalState: State; connection: CalendarExternalRead["connection"]; partial: boolean;
  onNavigate: (direction: -1 | 1) => void; onToday: () => void; onModeChange: (mode: CalendarMode) => void;
  onDaySelect: (date: string) => void; onEntrySelect: (entry: CalendarEntry) => void; onAddPersonal: () => void; onRetry: () => void;
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
  const googleStatus = externalState === "loading" ? <span role="status" className={styles.note}>{t(taskCopy.calendarLoadingGoogle)}</span> : failedGoogle ? <RetryCard title={t(taskCopy.calendarGoogleUnavailable)} onRetry={onRetry} /> : externalState === "ready" ? connect ? <div className={styles.row}><span className={styles.note}>{t(connection === "needs_reconnect" ? taskCopy.calendarGoogleReconnect : taskCopy.calendarGoogleNotConnected)}</span><a href="/api/integrations/google_calendar/authorize?returnTo=calendar">{t(taskCopy.calendarGoogleConnect)}</a></div> : <><Chip label={t(taskCopy.calendarGoogleConnected)} tone="teal" /><span className={styles.note}>{t(taskCopy.calendarGoogleReadOnly)}</span></> : null;
  const readStatus = internalState === "failed" ? <RetryCard title={t(taskCopy.calendarReadFailed)} onRetry={onRetry} /> : internalState === "loading" ? <Skeleton lines={2} onRetry={onRetry} /> : null;
  const controls = <Segmented label={t(taskCopy.calendarTitle)} value={mode} onChange={onModeChange} segments={[{ key: "day", label: t(taskCopy.calendarDay) }, { key: "week", label: t(taskCopy.calendarWeek) }, { key: "month", label: t(taskCopy.calendarMonth) }]} />;
  const dayViewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode !== "day" || !dayViewport.current) return;
    const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    const firstHour = date === today ? Math.max(8, Math.min(18, localHour - 1)) : 8;
    dayViewport.current.scrollTop = firstHour * 60 * 0.8;
  }, [date, mode, timeZone, today]);
  const emptyMonthGuide = mode === "month" && internalState === "ready" && externalState === "ready" && connection === "not_connected" && !partial && !visible.some(day => day.items.length);
  if (mode === "week") {
    const selected = visible.find(day => day.date === date) ?? visible[0];
    const dateLabel = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" });
    const shortWeekday = new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short" });
    const firstDate = visible[0]?.date, lastDate = visible.at(-1)?.date;
    const weekLabel = firstDate && lastDate ? `${new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "long", day: "numeric" }).format(at(firstDate))}–${new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...(firstDate.slice(0, 7) === lastDate.slice(0, 7) ? {} : { month: "long" as const }), day: "numeric" }).format(at(lastDate))}` : heading;
    const agendaHour = (hour: number) => selected?.hours.find(row => new RegExp(`^0?${hour}:00(?:\\s|$)`, "u").test(row.label))?.minute;
    const agendaStart = selected ? Math.min(agendaHour(9) ?? 0, ...selected.timed.map(item => item.startMinute)) : 0;
    const agendaEnd = selected ? Math.max(agendaHour(21) ?? selected.minutes, ...selected.timed.map(item => item.endMinute)) : 0;
    return <section aria-label={t(taskCopy.calendarTitle)} className={styles.weekLayout}>
      <Card className={styles.weekCard}><header className={styles.weekHeader}><div className={styles.row}><h2 className={styles.title}>{weekLabel}</h2><IconButton label={t(taskCopy.calendarPrevious)} icon="left" size={34} onClick={() => onNavigate(-1)} /><IconButton label={t(taskCopy.calendarNext)} icon="right" size={34} onClick={() => onNavigate(1)} /><Button label={t(taskCopy.calendarToday)} size="sm" onClick={onToday} /></div><div className={styles.row}>{externalState === "ready" && !connect && !failedGoogle ? <Chip label={t(taskCopy.calendarGoogleConnected)} tone="teal" /> : null}{controls}</div></header>
        {externalState === "ready" && !connect && !failedGoogle ? null : <div className={styles.status}>{googleStatus}</div>}
        {readStatus}{partial ? <p role="status" className={styles.note}>{t(taskCopy.calendarPartial)}</p> : null}
        <div className={styles.weekGrid}>{visible.map(day => <section key={day.date} data-calendar-date={day.date} aria-label={dateLabel.format(at(day.date))} className={`${styles.weekDay} ${day.date === date ? styles.weekDaySelected : ""} ${day.date < today ? styles.weekDayPast : ""}`}>
          <button type="button" aria-pressed={day.date === date} aria-current={day.date === today ? "date" : undefined} className={`btn ${styles.weekDayDate}`} onClick={() => onDaySelect(day.date)}><small>{shortWeekday.format(at(day.date))}</small><b>{day.dayNumber}</b></button>
          {day.items.map(item => <button type="button" key={item.key} className={`btn ${styles.weekEntry} ${styles[item.kind]}`} onClick={() => onEntrySelect(item)}><time>{item.timeLabel || t(taskCopy.calendarAllDay)}</time><span>{item.title || t(taskCopy.calendarUntitled)}</span></button>)}
        </section>)}</div>
      </Card>
      <Card className={styles.agendaCard}><header className={styles.weekHeader}><h2 className={styles.title}>{selected ? dateLabel.format(at(selected.date)) : dayFormat.format(at(date))}</h2></header>
        {selected ? <section data-calendar-date={selected.date} aria-label={dateLabel.format(at(selected.date))}>
          {selected.allDay.length ? <div className={styles.agendaAllDay}><span className={styles.note}>{t(taskCopy.calendarAllDay)}</span>{selected.allDay.map(item => <div key={item.key}>{entry(item)}</div>)}</div> : null}
          <div className={styles.agendaTimeline} style={{ height: (agendaEnd - agendaStart) * 0.5 }}>{selected.hours.filter(hour => hour.minute >= agendaStart && hour.minute <= agendaEnd).map(hour => <div key={hour.minute} className={styles.agendaHour} style={{ top: (hour.minute - agendaStart) * 0.5 }}><time>{hour.label}</time></div>)}{selected.timed.map(item => <div key={item.key} className={styles.agendaEntry} style={{ top: (item.startMinute - agendaStart) * 0.5, height: Math.max(26, (item.endMinute - item.startMinute) * 0.5), left: `calc(48px + (100% - 48px) * ${item.column / item.columns})`, width: `calc((100% - 48px) / ${item.columns})` }}>{entry(item, item.timeLabel)}</div>)}</div>
        </section> : null}
      </Card>
      {internalState === "ready" && externalState === "ready" && connection === "connected" && !partial && !visible.some(day => day.items.length) ? <EmptyState title={t(taskCopy.calendarEmpty)} /> : null}
    </section>;
  }
  return <section aria-label={t(taskCopy.calendarTitle)}>
    <header className={styles.toolbar}><div className={styles.row}><h2 className={styles.title}>{heading}</h2><IconButton label={t(taskCopy.calendarPrevious)} icon="left" size={34} onClick={() => onNavigate(-1)} /><IconButton label={t(taskCopy.calendarNext)} icon="right" size={34} onClick={() => onNavigate(1)} /><Button label={t(taskCopy.calendarToday)} size="sm" onClick={onToday} /></div>
      {controls}</header>
    <div className={styles.status}>{emptyMonthGuide ? <span className={styles.note}>{t(taskCopy.calendarGoogleNotConnected)}</span> : <><span className={styles.note}>{timeZone}</span>{googleStatus}</>}</div>
    {readStatus}
    {partial ? <p role="status" className={styles.note}>{t(taskCopy.calendarPartial)}</p> : null}
    <div className={styles.legend}>{(["personal", "meeting", "event", "external"] as const).map(kind => <span key={kind} className={`${styles.legendItem} ${styles[kind]}`}>{t(kind === "personal" ? taskCopy.calendarPersonal : kind === "meeting" ? taskCopy.calendarMeeting : kind === "event" ? taskCopy.calendarEvent : taskCopy.calendarGoogleReadOnly)}</span>)}</div>
    {mode === "month" ? <div className={styles.monthFrame}><div className={styles.month}>{visible.slice(0, 7).map(day => <div className={styles.weekday} key={`weekday:${day.date}`}>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(at(day.date))}</div>)}{visible.map(day => <section key={day.date} data-calendar-date={day.date} aria-label={dayFormat.format(at(day.date))} className={`${styles.monthDay} ${!day.inMonth ? styles.outside : ""} ${day.date === date ? styles.selected : ""}`}>
      <button type="button" aria-pressed={day.date === date} aria-current={day.date === today ? "date" : undefined} className={styles.dayNumber} onClick={() => onDaySelect(day.date)}>{day.dayNumber}</button>
      {day.items.slice(0, 3).map(item => <div key={item.key}>{entry(item, item.timeLabel)}</div>)}{day.items.length > 3 ? <Button size="sm" variant="ghost" label={t(taskCopy.calendarMore).replace("{count}", String(day.items.length - 3))} onClick={() => { onDaySelect(day.date); onModeChange("day"); }} /> : null}
    </section>)}</div>{emptyMonthGuide ? <div className={styles.monthGuide} data-calendar-empty-guide=""><div className={styles.monthGuideIntro}><span aria-hidden="true">📅</span><div><h3>{t(taskCopy.calendarEmptyMonthTitle)}</h3><p>{t(taskCopy.calendarEmptyMonthBody)}</p></div></div><div className={styles.monthGuideActions}><a className={`btn ${styles.monthGuideConnect}`} href="/api/integrations/google_calendar/authorize?returnTo=calendar">{t(taskCopy.calendarEmptyMonthConnect)}</a><Button label={t(taskCopy.calendarEmptyMonthAdd)} icon="plus" onClick={onAddPersonal} /></div><p className={styles.monthGuidePrivacy}>{t(taskCopy.calendarEmptyMonthPrivacy)}</p></div> : null}</div> : <div ref={dayViewport} data-calendar-day-viewport={mode === "day" ? "" : undefined} className={`${styles.columns} ${mode === "day" ? styles.single : ""}`}>{visible.map(day => <section key={day.date} data-calendar-date={day.date} className={styles.column} aria-label={dayFormat.format(at(day.date))}>
      <button type="button" className={styles.columnDate} aria-pressed={day.date === date} onClick={() => onDaySelect(day.date)}>{dayFormat.format(at(day.date))}</button>
      <div className={styles.allDay}><span className={styles.note}>{t(taskCopy.calendarAllDay)}</span>{day.allDay.map(item => <div key={item.key}>{entry(item)}</div>)}</div>
      <div className={styles.timeline} style={{ height: day.minutes * 0.8 }}>{day.hours.map(hour => <div key={hour.minute} className={styles.hour} style={{ top: hour.minute * 0.8 }}><time>{hour.label}</time></div>)}{day.timed.map(item => <div key={item.key} className={styles.timeEntry} style={{ top: item.startMinute * 0.8, height: Math.max(24, (item.endMinute - item.startMinute) * 0.8), left: `calc(60px + (100% - 60px) * ${item.column / item.columns})`, width: `calc((100% - 60px) / ${item.columns})` }}>{entry(item, item.timeLabel)}</div>)}</div>
    </section>)}</div>}
    {internalState === "ready" && externalState === "ready" && connection === "connected" && !partial && !visible.some(day => day.items.length) ? <EmptyState title={t(taskCopy.calendarEmpty)} /> : null}
  </section>;
}
