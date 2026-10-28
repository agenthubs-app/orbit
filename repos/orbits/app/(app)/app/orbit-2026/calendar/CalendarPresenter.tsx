"use client";

import { Bone, Button, Card, Chip, EmptyState, IconButton, RetryCard, Segmented, Skeleton, useScopeLanguage, useStandardCopy } from "../ui";
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
  // The entries and the status line wait for both sources to answer (ready or failed), so the schedule and
  // Google's events land together; a failed source still leaves the other one's entries on screen.
  const settled = [internalState, externalState].every(state => state === "ready" || state === "failed");
  const visible = days.map(day => {
    const items = !settled ? [] : day.items.filter(item => item.kind === "external" ? externalState === "ready" && connection === "connected" : internalState === "ready");
    return { ...day, items, allDay: items.filter(item => item.allDay), timed: layoutCalendarIntervals(items.filter(item => !item.allDay)) };
  });
  const entry = (item: CalendarEntry, timeLabel?: string) => <Button variant="ghost" className={`${styles.entry} ${styles[item.kind]}`}
    label={[timeLabel, item.title || t(taskCopy.calendarUntitled)].filter(Boolean).join(" ")} onClick={() => onEntrySelect(item)} />;
  const connect = connection === "not_connected" || connection === "needs_reconnect";
  // 「今日」 only once today is off screen (it does nothing otherwise), which also keeps the week header on one row.
  const showToday = !visible.some(day => day.date === today);
  const failedGoogle = externalState === "failed" || externalState === "ready" && connection === "unavailable";
  const googleOff = externalState === "ready" && connection === "off";
  const googleLinked = externalState === "ready" && connection === "connected";
  const std = useStandardCopy();
  // The Google legend item only when Google is connected (b3: the unconnected month's legend has no Google item).
  const legendKinds = googleLinked ? (["personal", "meeting", "event", "external"] as const) : (["personal", "meeting", "event"] as const);
  // 2026-10-27：until the read says Google is connected, nothing about Google is shown (no 「读取中」 for an account that never linked it;
  // the server answers not_connected without contacting Google).
  // 2026-10-28: Google is never shown where this deployment does not offer it ("off"), and a real read failure is
  // one small line where the boards put the sync line (b3 「Google カレンダー · 2分前に同期」), not a blocking card:
  // the Orbit entries stay on screen and 再試行 reads again.
  const googleStatus = !settled || googleOff ? null : failedGoogle ? <span className={styles.row} role="status"><span className={styles.note}>{t(taskCopy.calendarGoogleUnavailable)}</span><button type="button" className={`btn ${styles.retryLink}`} onClick={onRetry}>{std.action.retry}</button></span> : externalState === "ready" ? connect ? <div className={styles.row}><span className={styles.note}>{t(connection === "needs_reconnect" ? taskCopy.calendarGoogleReconnect : taskCopy.calendarGoogleNotConnected)}</span><a href="/api/integrations/google_calendar/authorize?returnTo=calendar">{t(taskCopy.calendarGoogleConnect)}</a></div> : <><Chip label={t(taskCopy.calendarGoogleConnected)} tone="teal" /><span className={styles.note}>{t(taskCopy.calendarGoogleReadOnly)}</span></> : null;
  const readStatus = !settled ? null : internalState === "failed" ? <RetryCard title={t(taskCopy.calendarReadFailed)} onRetry={onRetry} /> : null;
  // One bone where a day's entries go (week columns, month cells) while the sources are on their way.
  const pendingEntry = settled ? null : <Bone width="80%" height={14} />;
  const controls = <Segmented label={t(taskCopy.calendarTitle)} value={mode} onChange={onModeChange} segments={[{ key: "day", label: t(taskCopy.calendarDay) }, { key: "week", label: t(taskCopy.calendarWeek) }, { key: "month", label: t(taskCopy.calendarMonth) }]} />;
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
      <Card className={styles.weekCard}><header className={styles.weekHeader}><div className={styles.row}><h2 className={styles.title}>{weekLabel}</h2><IconButton label={t(taskCopy.calendarPrevious)} icon="left" size={34} onClick={() => onNavigate(-1)} /><IconButton label={t(taskCopy.calendarNext)} icon="right" size={34} onClick={() => onNavigate(1)} />{showToday ? <Button label={t(taskCopy.calendarToday)} size="sm" onClick={onToday} /> : null}</div><div className={styles.row}>{googleLinked ? <Chip label={t(taskCopy.calendarGoogleConnected)} tone="teal" /> : null}{controls}</div></header>
        {!settled || googleLinked || googleOff ? null : <div className={styles.status}>{googleStatus}</div>}
        {readStatus}{partial ? <p role="status" className={styles.note}>{t(taskCopy.calendarPartial)}</p> : null}
        <div className={styles.weekGrid}>{visible.map(day => <section key={day.date} data-calendar-date={day.date} aria-label={dateLabel.format(at(day.date))} className={`${styles.weekDay} ${day.date === date ? styles.weekDaySelected : ""} ${day.date < today ? styles.weekDayPast : ""}`}>
          <button type="button" aria-pressed={day.date === date} aria-current={day.date === today ? "date" : undefined} className={`btn ${styles.weekDayDate}`} onClick={() => onDaySelect(day.date)}><small>{shortWeekday.format(at(day.date))}</small><b>{day.dayNumber}</b></button>
          {pendingEntry}{day.items.map(item => <button type="button" key={item.key} className={`btn ${styles.weekEntry} ${styles[item.kind]}`} onClick={() => onEntrySelect(item)}><time>{item.timeLabel || t(taskCopy.calendarAllDay)}</time><span>{item.title || t(taskCopy.calendarUntitled)}</span></button>)}
        </section>)}</div>
        {internalState === "ready" && externalState === "ready" && connection === "connected" && !partial && !visible.some(day => day.items.length) ? <p role="status" className={`${styles.note} ${styles.weekEmpty}`}>{t(taskCopy.calendarEmpty)}</p> : null}
      </Card>
      <Card className={styles.agendaCard}><header className={styles.weekHeader}><h2 className={styles.title}>{selected ? dateLabel.format(at(selected.date)) : dayFormat.format(at(date))}</h2></header>
        {selected ? <section data-calendar-date={selected.date} aria-label={dateLabel.format(at(selected.date))}>
          {!settled ? <Skeleton lines={2} onRetry={onRetry} /> : null}
          {selected.allDay.length ? <div className={styles.agendaAllDay}><span className={styles.note}>{t(taskCopy.calendarAllDay)}</span>{selected.allDay.map(item => <div key={item.key}>{entry(item)}</div>)}</div> : null}
          <div className={styles.agendaTimeline} style={{ height: (agendaEnd - agendaStart) * 0.5 }}>{selected.hours.filter(hour => hour.minute >= agendaStart && hour.minute <= agendaEnd).map(hour => <div key={hour.minute} className={styles.agendaHour} style={{ top: (hour.minute - agendaStart) * 0.5 }}><time>{hour.label}</time></div>)}{selected.timed.map(item => <div key={item.key} className={styles.agendaEntry} style={{ top: (item.startMinute - agendaStart) * 0.5, height: Math.max(26, (item.endMinute - item.startMinute) * 0.5), left: `calc(48px + (100% - 48px) * ${item.column / item.columns})`, width: `calc((100% - 48px) / ${item.columns})` }}>{entry(item, item.timeLabel)}</div>)}</div>
        </section> : null}
      </Card>
    </section>;
  }
  if (mode === "day") {
    const selected = visible.find(day => day.date === date) ?? visible[0];
    const timed = selected?.timed ?? [];
    const groups = [
      { label: t(taskCopy.calendarMorning), items: timed.filter(item => item.startMinute < 720) },
      { label: t(taskCopy.calendarAfternoon), items: timed.filter(item => item.startMinute >= 720 && item.startMinute < 1080) },
      { label: t(taskCopy.calendarEvening), items: timed.filter(item => item.startMinute >= 1080) },
    ];
    const overlap = timed.flatMap((item, index) => timed.slice(index + 1).filter(next => next.startMinute < item.endMinute).slice(0, 1).map(next => [item, next] as const))[0];
    return <section aria-label={t(taskCopy.calendarTitle)}>
      <header className={`${styles.toolbar} ${styles.dayToolbar}`}><div className={styles.row}><IconButton label={t(taskCopy.calendarPrevious)} icon="left" size={34} onClick={() => onNavigate(-1)} /><IconButton label={t(taskCopy.calendarNext)} icon="right" size={34} onClick={() => onNavigate(1)} />{showToday ? <Button label={t(taskCopy.calendarToday)} size="sm" onClick={onToday} /> : null}</div><h2 className={styles.title}>{heading}</h2>{controls}</header>
      <div className={styles.status}><span className={styles.note}>{timeZone}</span>{googleStatus}</div>
      {readStatus}{partial ? <p role="status" className={styles.note}>{t(taskCopy.calendarPartial)}</p> : null}
      <div className={styles.legend}>{legendKinds.map(kind => <span key={kind} className={`${styles.legendItem} ${styles[kind]}`}>{t(kind === "personal" ? taskCopy.calendarPersonal : kind === "meeting" ? taskCopy.calendarMeeting : kind === "event" ? taskCopy.calendarEvent : taskCopy.calendarGoogleReadOnly)}</span>)}</div>
      <section data-calendar-day-list="" data-calendar-date={selected?.date} aria-label={heading} className={styles.dayList}>
        {!settled ? <Skeleton lines={4} onRetry={onRetry} /> : null}
        {selected?.allDay.length ? <div className={styles.dayGroup}><h3>{t(taskCopy.calendarAllDay)}</h3>{selected.allDay.map(item => <button key={item.key} type="button" className={`btn ${styles.dayItem} ${styles.dayAllDay} ${styles[item.kind]}`} onClick={() => onEntrySelect(item)}><strong>{item.title || t(taskCopy.calendarUntitled)}</strong>{item.location ? <span>{item.location}</span> : null}</button>)}</div> : null}
        {groups.filter(group => group.items.length).map(group => <div key={group.label} className={styles.dayGroup}><h3>{group.label}</h3>{group.items.map(item => <button key={item.key} type="button" className={`btn ${styles.dayItem} ${styles[item.kind]}`} onClick={() => onEntrySelect(item)}><time>{item.timeLabel}</time><strong>{item.title || t(taskCopy.calendarUntitled)}</strong>{item.location ? <span>{item.location}</span> : null}</button>)}</div>)}
        {overlap ? <div data-calendar-overlap="" role="status" className={styles.dayOverlap}><strong>{t(taskCopy.calendarOverlap)}</strong><span>{overlap[0].timeLabel} {overlap[0].title} · {overlap[1].timeLabel} {overlap[1].title}</span></div> : null}
      </section>
      {internalState === "ready" && externalState === "ready" && connection === "connected" && !partial && !selected?.items.length ? <EmptyState title={t(taskCopy.calendarEmpty)} /> : null}
    </section>;
  }
  return <section aria-label={t(taskCopy.calendarTitle)}>
    <header className={styles.toolbar}><div className={styles.row}><h2 className={styles.title}>{heading}</h2><IconButton label={t(taskCopy.calendarPrevious)} icon="left" size={34} onClick={() => onNavigate(-1)} /><IconButton label={t(taskCopy.calendarNext)} icon="right" size={34} onClick={() => onNavigate(1)} />{showToday ? <Button label={t(taskCopy.calendarToday)} size="sm" onClick={onToday} /> : null}</div>
      {controls}</header>
    <div className={styles.status}>{emptyMonthGuide ? <span className={styles.note}>{t(taskCopy.calendarGoogleNotConnected)}</span> : <><span className={styles.note}>{timeZone}</span>{googleStatus}</>}</div>
    {readStatus}
    {partial ? <p role="status" className={styles.note}>{t(taskCopy.calendarPartial)}</p> : null}
    <div className={styles.legend}>{legendKinds.map(kind => <span key={kind} className={`${styles.legendItem} ${styles[kind]}`}>{t(kind === "personal" ? taskCopy.calendarPersonal : kind === "meeting" ? taskCopy.calendarMeeting : kind === "event" ? taskCopy.calendarEvent : taskCopy.calendarGoogleReadOnly)}</span>)}</div>
    {mode === "month" ? <div className={styles.monthFrame}><div className={styles.month}>{visible.slice(0, 7).map(day => <div className={styles.weekday} key={`weekday:${day.date}`}>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(at(day.date))}</div>)}{visible.map(day => <section key={day.date} data-calendar-date={day.date} aria-label={dayFormat.format(at(day.date))} className={`${styles.monthDay} ${!day.inMonth ? styles.outside : ""} ${day.date === date ? styles.selected : ""}`}>
      <Button variant="ghost" label={String(day.dayNumber)} aria-pressed={day.date === date} aria-current={day.date === today ? "date" : undefined} className={styles.dayNumber} onClick={() => onDaySelect(day.date)} />
      {pendingEntry}{day.items.slice(0, 3).map(item => <div key={item.key}>{entry(item, item.timeLabel)}</div>)}{day.items.length > 3 ? <Button size="sm" variant="ghost" label={t(taskCopy.calendarMore).replace("{count}", String(day.items.length - 3))} onClick={() => { onDaySelect(day.date); onModeChange("day"); }} /> : null}
    </section>)}</div>{emptyMonthGuide ? <div className={styles.monthGuide} data-calendar-empty-guide=""><div className={styles.monthGuideIntro}><span aria-hidden="true">📅</span><div><h3>{t(taskCopy.calendarEmptyMonthTitle)}</h3><p>{t(taskCopy.calendarEmptyMonthBody)}</p></div></div><div className={styles.monthGuideActions}><a className={`btn ${styles.monthGuideConnect}`} href="/api/integrations/google_calendar/authorize?returnTo=calendar">{t(taskCopy.calendarEmptyMonthConnect)}</a><Button label={t(taskCopy.calendarEmptyMonthAdd)} icon="plus" onClick={onAddPersonal} /></div><p className={styles.monthGuidePrivacy}>{t(taskCopy.calendarEmptyMonthPrivacy)}</p></div> : null}</div> : null}
    {internalState === "ready" && externalState === "ready" && connection === "connected" && !partial && !visible.some(day => day.items.length) ? <EmptyState title={t(taskCopy.calendarEmpty)} /> : null}
  </section>;
}
