"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { PersonalScheduleContract } from "../../../../../shared/contract/tasks";
import { calendarDate } from "../../../../../features/tasks/local-date-time";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { createPersonalScheduleClient } from "../../tasks/personal-schedule-client";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Button, Modal, Orbit2026Scope, RetryCard, Skeleton, ToastProvider, useToast } from "../ui";
import { calendarDaysView, type CalendarEntry } from "./calendar-view-model";
import { shiftCalendarDate, type CalendarMode } from "./calendar-range";
import { CalendarPresenter } from "./CalendarPresenter";
import { CalendarPersonalEditor } from "./CalendarPersonalEditor";
import { useCalendarPage } from "./useCalendarPage";
import styles from "./calendar.module.css";

interface Props { actorId: string; language: OrbitLanguage; timeZone: string; today: string; initialDate?: string; initialAdd?: boolean }
export function CalendarWorkspace(props: Props) {
  const { account } = useSharedReadAccount();
  return <Orbit2026Scope language={props.language}><ToastProvider><Workspace key={JSON.stringify([props.actorId, account])} {...props} /></ToastProvider></Orbit2026Scope>;
}
function Workspace({ actorId, language, timeZone, today, initialDate, initialAdd = false }: Props) {
  const { ready } = useSharedReadAccount();
  const [date, setDate] = useState(() => initialDate && calendarDate(initialDate) ? initialDate : today);
  const [mode, setMode] = useState<CalendarMode>("month");
  const [localDenied, setLocalDenied] = useState(false);
  const resource = useCalendarPage(timeZone, date, mode, language);
  const toast = useToast();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const previousToday = useRef(today);
  useEffect(() => { const previous = previousToday.current; previousToday.current = today; if (!initialDate) setDate(current => current === previous ? today : current); }, [initialDate, today]);
  useEffect(() => { if (initialDate && calendarDate(initialDate)) setDate(initialDate); }, [initialDate]);
  const client = useMemo(() => createPersonalScheduleClient(actorId, async (url, init) => { const response = await fetch(url, init); if (response.status === 401 || response.status === 403) setLocalDenied(true); return response; }), [actorId]);
  const denied = localDenied || resource.denied;
  const [editor, setEditor] = useState<PersonalScheduleContract | null | undefined>(initialAdd ? null : undefined);
  const [selected, setSelected] = useState<{ entry: CalendarEntry; item: PersonalScheduleContract | null; state: "loading" | "ready" | "failed" } | null>(null);
  const detailGeneration = useRef(0), alive = useRef(true);
  const scope = JSON.stringify([date, mode, timeZone]);
  useEffect(() => { detailGeneration.current++; setSelected(null); }, [scope]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; detailGeneration.current++; }; }, []);
  useEffect(() => { if (initialAdd) setEditor(null); }, [initialAdd]);
  useEffect(() => { if (denied || !ready) { detailGeneration.current++; setSelected(null); setEditor(undefined); } }, [denied, ready]);
  const days = useMemo(() => { try { return calendarDaysView({ date, mode, timeZone, language, internal: resource.internal.data?.items ?? [], external: resource.external.data?.connection === "connected" ? resource.external.data.events : [] }); } catch { return []; } }, [date, mode, timeZone, language, resource.internal.data, resource.external.data]);
  const entries = useMemo(() => [...new Map(days.flatMap(day => day.items).map(item => [item.key, item])).values()], [days]);
  const partial = Boolean(resource.internal.data?.skipped || resource.external.data?.skipped);
  const coverage = { from: resource.window?.from ?? "", to: resource.window?.to ?? "", complete: resource.internal.state === "ready" && resource.external.state === "ready" && resource.external.data?.connection !== "unavailable" && resource.external.data?.connection !== "needs_reconnect" && !partial };
  async function open(entry: CalendarEntry) {
    if (!ready || denied) return;
    const token = ++detailGeneration.current;
    setSelected({ entry, item: null, state: entry.kind === "personal" ? "loading" : "ready" });
    if (entry.kind !== "personal") return;
    try { const item = await client.get(entry.id); if (alive.current && detailGeneration.current === token) setSelected({ entry, item, state: "ready" }); }
    catch { if (alive.current && detailGeneration.current === token) setSelected({ entry, item: null, state: "failed" }); }
  }
  const closeDetail = () => { detailGeneration.current++; setSelected(null); };
  const refresh = () => { setLocalDenied(false); void resource.refresh(); };
  const format = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { timeZone: selected?.item?.timeZone ?? timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return <>
    <div className={styles.status}><Button data-task-add="" label={t(taskCopy.calendarAdd)} icon="plus" variant="accent" disabled={!ready || denied} onClick={() => { closeDetail(); setEditor(null); }} /></div>
    {denied ? <RetryCard title={t(taskCopy.calendarReadFailed)} onRetry={refresh} /> : <CalendarPresenter date={date} today={today} timeZone={timeZone} mode={mode} days={days} internalState={resource.internal.state} externalState={resource.external.state} connection={resource.external.data?.connection ?? "unavailable"} partial={partial} onNavigate={direction => setDate(current => shiftCalendarDate(current, mode, direction))} onToday={() => setDate(today)} onModeChange={setMode} onDaySelect={setDate} onEntrySelect={entry => { void open(entry); }} onRetry={refresh} />}
    {ready && !denied && selected && editor === undefined ? <Modal open title={t(taskCopy.calendarDetail)} onClose={closeDetail} size={480}>
      {selected.state === "loading" ? <Skeleton lines={3} /> : selected.state === "failed" ? <RetryCard title={t(taskCopy.calendarReadFailed)} onRetry={() => { void open(selected.entry); }} /> : <div className={styles.formGrid}><h3 className={styles.title}>{selected.item?.title ?? selected.entry.title}</h3><p className={styles.note}>{format(selected.item?.startsAt ?? selected.entry.startsAt)}{selected.item?.endsAt ?? selected.entry.endsAt ? ` – ${format((selected.item?.endsAt ?? selected.entry.endsAt)!)}` : ""}</p>{selected.item?.location ?? selected.entry.location ? <p className={styles.note}>{selected.item?.location ?? selected.entry.location}</p> : null}
        {selected.item ? <Button label={t(taskCopy.calendarEdit)} onClick={() => setEditor(selected.item)} /> : <p className={styles.note}>{t(selected.entry.kind === "external" ? taskCopy.calendarGoogleReadOnly : selected.entry.kind === "meeting" ? taskCopy.calendarMeetingReschedule : taskCopy.calendarReadOnly)}</p>}</div>}
    </Modal> : null}
    {ready && !denied && editor !== undefined ? <CalendarPersonalEditor key={editor?.id ?? "new"} item={editor} date={date} timeZone={timeZone} client={client} entries={entries} coverage={coverage} onClose={() => setEditor(undefined)} onSaved={async item => { setEditor(undefined); closeDetail(); toast.success(t(item ? taskCopy.calendarSaved : taskCopy.calendarDeleted)); await resource.refresh(); }} /> : null}
  </>;
}
