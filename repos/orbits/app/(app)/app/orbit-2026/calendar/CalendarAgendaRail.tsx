import type { CalendarExternalRead } from "./calendar-read-client";
import type { CalendarDayView, CalendarEntry } from "./calendar-view-model";
import type { CalendarPart } from "./useCalendarPage";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { useScopeLanguage } from "../ui";
import styles from "./calendar.module.css";

type State = CalendarPart<unknown>["state"];

export function CalendarAgendaRail({ date, today, day, internalState, externalState, connection, partial, onEntrySelect }: {
  date: string;
  today: string;
  day?: CalendarDayView;
  internalState: State;
  externalState: State;
  connection: CalendarExternalRead["connection"];
  partial: boolean;
  onEntrySelect: (entry: CalendarEntry) => void;
}) {
  const language = useScopeLanguage();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const locale = language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB";
  const heading = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${date}T12:00:00Z`));
  const items = (day?.items ?? []).filter(item => item.kind === "external" ? externalState === "ready" && connection === "connected" : internalState === "ready");
  const complete = internalState === "ready" && externalState === "ready" && connection === "connected" && !partial;

  return <div className={styles.railAgenda} data-calendar-agenda-rail="">
    <h2 className={styles.railAgendaTitle}>{heading}{date === today ? ` · ${t(taskCopy.calendarToday)}` : ""}</h2>
    {items.length ? <div className={styles.railAgendaCard}>{items.map(item => <button type="button" className={`btn ${styles.railAgendaItem}`} key={item.key} onClick={() => onEntrySelect(item)}>
      <span className={`${styles.railAgendaMarker} ${styles[item.kind]}`} aria-hidden="true" />
      <span className={styles.railAgendaContent}><span className={styles.railAgendaTime}>{item.allDay ? t(taskCopy.calendarAllDay) : item.timeLabel}</span><strong>{item.title || t(taskCopy.calendarUntitled)}</strong></span>
    </button>)}</div> : complete ? <p className={styles.railAgendaNote}>{t(taskCopy.calendarEmpty)}</p> : null}
    {internalState === "failed" ? <p role="status" className={styles.railAgendaNote}>{t(taskCopy.calendarReadFailed)}</p> : internalState === "loading" ? <p role="status" className={styles.railAgendaNote}>{t(taskCopy.calendarLoading)}</p> : null}
    {externalState === "failed" || externalState === "ready" && connection === "unavailable" ? <p role="status" className={styles.railAgendaNote}>{t(taskCopy.calendarGoogleUnavailable)}</p> : externalState === "ready" && connection === "not_connected" ? <p className={styles.railAgendaNote}>{t(taskCopy.calendarGoogleNotConnected)}</p> : externalState === "ready" && connection === "needs_reconnect" ? <p className={styles.railAgendaNote}>{t(taskCopy.calendarGoogleReconnect)}</p> : null}
    {partial ? <p role="status" className={styles.railAgendaNote}>{t(taskCopy.calendarPartial)}</p> : null}
  </div>;
}
