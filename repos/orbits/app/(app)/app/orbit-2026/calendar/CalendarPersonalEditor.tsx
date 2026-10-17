"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonalScheduleContract } from "../../../../../shared/contract/tasks";
import type { createPersonalScheduleClient } from "../../tasks/personal-schedule-client";
import { buildPersonalScheduleChange, personalScheduleDraft, type PersonalScheduleDraft } from "../../tasks/personal-schedule-editor-model";
import { Button, Card, ConfirmDialog, Modal, TextField, Toggle, useScopeLanguage } from "../ui";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { calendarDraftOverlaps } from "./calendar-overlap";
import type { CalendarEntry } from "./calendar-view-model";
import styles from "./calendar.module.css";

type Client = ReturnType<typeof createPersonalScheduleClient>;
function newDraft(date: string, zone: string): PersonalScheduleDraft { return { ...personalScheduleDraft(null, zone), startDate: date, startTime: "09:00", endDate: date, endTime: "10:00" }; }
export function CalendarPersonalEditor({ item, date, timeZone, client, entries, coverage, onSaved, onClose }: {
  item: PersonalScheduleContract | null; date: string; timeZone: string; client: Client; entries: readonly CalendarEntry[];
  coverage: { from: string; to: string; complete: boolean }; onSaved: (item: PersonalScheduleContract | null) => void | Promise<void>; onClose: () => void;
}) {
  const language = useScopeLanguage();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const [zone] = useState(item?.timeZone ?? timeZone), [creationDate] = useState(date);
  const [baseline, setBaseline] = useState(item);
  const [draft, setDraft] = useState(() => item ? personalScheduleDraft(item, zone) : newDraft(date, zone));
  const [scope, setScope] = useState<"occurrence" | "series" | undefined>();
  const [busy, setBusy] = useState(false), [error, setError] = useState<"invalid" | "write" | "read" | null>(null);
  const [confirmOverlap, setConfirmOverlap] = useState(false), [confirmDelete, setConfirmDelete] = useState(false), [confirmDiscard, setConfirmDiscard] = useState(false);
  const alive = useRef(true), writing = useRef(false), focus = useRef<HTMLElement | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const repeating = Boolean(item?.recurrence || item?.seriesId);
  const clean = JSON.stringify(draft) === JSON.stringify(baseline ? personalScheduleDraft(baseline, zone) : newDraft(creationDate, zone));
  const rulesDisabled = busy || repeating && scope !== "series";
  const change = buildPersonalScheduleChange(baseline, draft, zone);
  const fields = change.kind === "ready" ? change.fields : {};
  const start = typeof fields.startsAt === "string" ? fields.startsAt : baseline?.startsAt;
  const end = Object.hasOwn(fields, "endsAt") ? typeof fields.endsAt === "string" ? fields.endsAt : undefined : baseline?.endsAt;
  const overlap = start ? calendarDraftOverlaps({ id: baseline?.id, sourceId: baseline?.sourceId, startsAt: start, endsAt: end, allDay: draft.allDay }, entries, coverage) : { items: [], coverageComplete: false };
  const edit = (patch: Partial<PersonalScheduleDraft>) => { if (!writing.current) { setDraft(current => ({ ...current, ...patch })); setConfirmOverlap(false); setError(null); } };
  const close = () => { if (!writing.current) { if (clean) onClose(); else setConfirmDiscard(true); } };
  async function chooseScope(next: "occurrence" | "series") {
    if (writing.current || !clean || !item) return;
    writing.current = true; setBusy(true); setError(null);
    try {
      const authority = next === "series" ? await client.get(item.seriesId ?? item.id) : item;
      if (alive.current) { setBaseline(authority); setDraft(personalScheduleDraft(authority, zone)); setScope(next); setConfirmOverlap(false); }
    } catch { if (alive.current) setError("read"); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  async function save(force = false) {
    if (writing.current || repeating && !scope) return;
    if (change.kind === "invalid") { setError("invalid"); return; }
    if (change.kind === "unchanged") return;
    if (overlap.items.length && !force) { setConfirmOverlap(true); return; }
    writing.current = true; setBusy(true); setError(null);
    try { const saved = await client.save(baseline, change.fields, scope); if (alive.current) await onSaved(saved); }
    catch { if (alive.current) setError("write"); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  async function remove() {
    if (writing.current || !baseline || repeating && !scope) return;
    writing.current = true; setBusy(true); setError(null);
    try { await client.remove(baseline, scope); if (alive.current) await onSaved(null); }
    catch { if (alive.current) setError("write"); }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  }
  return <>
    <Modal open title={t(item ? taskCopy.calendarEdit : taskCopy.calendarAdd)} onClose={close} size={560} form initialFocus={focus}>
      {repeating ? <div className={styles.formGrid}><p className={styles.note}>{t(taskCopy.calendarChooseScope)}</p><div className={styles.row}><Button label={t(taskCopy.calendarOccurrence)} disabled={busy || !clean || !item?.occurrenceDate} aria-pressed={scope === "occurrence"} onClick={() => { void chooseScope("occurrence"); }} /><Button label={t(taskCopy.calendarSeries)} disabled={busy || !clean} aria-pressed={scope === "series"} onClick={() => { void chooseScope("series"); }} /></div></div> : null}
      <form ref={node => { focus.current = node?.querySelector("input") ?? null; }} className={styles.formGrid} onSubmit={event => { event.preventDefault(); void save(); }}>
        <TextField label={t(taskCopy.calendarScheduleTitle)} aria-label={t(taskCopy.calendarScheduleTitle)} value={draft.title} maxLength={300} disabled={busy} onChange={event => edit({ title: event.target.value })} />
        <Card><div className={styles.row}><span>{t(taskCopy.calendarAllDay)}</span><Toggle label={t(taskCopy.calendarAllDay)} checked={Boolean(draft.allDay)} disabled={busy} onChange={allDay => edit({ allDay, endDate: draft.endDate || draft.startDate, endTime: allDay ? "" : draft.endTime || "10:00" })} /></div>
          <div className={styles.formDates}><TextField type="date" label={t(taskCopy.calendarStartDate)} aria-label={t(taskCopy.calendarStartDate)} value={draft.startDate} disabled={busy} onChange={event => edit({ startDate: event.target.value })} />{!draft.allDay ? <TextField type="time" label={t(taskCopy.calendarStartTime)} aria-label={t(taskCopy.calendarStartTime)} value={draft.startTime} disabled={busy} onChange={event => edit({ startTime: event.target.value })} /> : null}
            <TextField type="date" label={t(taskCopy.calendarEndDate)} aria-label={t(taskCopy.calendarEndDate)} value={draft.endDate} disabled={busy} onChange={event => edit({ endDate: event.target.value })} />{!draft.allDay ? <TextField type="time" label={t(taskCopy.calendarEndTime)} aria-label={t(taskCopy.calendarEndTime)} value={draft.endTime} disabled={busy} onChange={event => edit({ endTime: event.target.value, pickerEndInstant: undefined })} /> : null}</div></Card>
        <TextField label={t(taskCopy.calendarLocation)} value={draft.location} maxLength={500} disabled={busy} onChange={event => edit({ location: event.target.value })} />
        <label className={styles.formLabel}>{t(taskCopy.calendarRepeat)}<select className={styles.formSelect} aria-label={t(taskCopy.calendarRepeat)} value={draft.recurrence?.frequency ?? ""} disabled={rulesDisabled} onChange={event => edit({ recurrence: event.target.value ? { frequency: event.target.value as "daily" | "weekly" | "monthly", ...(draft.recurrence?.until ? { until: draft.recurrence.until } : {}) } : null })}><option value="">{t(taskCopy.calendarRepeatNone)}</option><option value="daily">{t(taskCopy.calendarRepeatDaily)}</option><option value="weekly">{t(taskCopy.calendarRepeatWeekly)}</option><option value="monthly">{t(taskCopy.calendarRepeatMonthly)}</option></select></label>
        {draft.recurrence ? <TextField type="date" label={t(taskCopy.calendarRepeatUntil)} value={draft.recurrence.until ?? ""} disabled={rulesDisabled} onChange={event => edit({ recurrence: { frequency: draft.recurrence!.frequency, ...(event.target.value ? { until: event.target.value } : {}) } })} /> : null}
        <label className={styles.formLabel}>{t(taskCopy.calendarReminder)}<select className={styles.formSelect} aria-label={t(taskCopy.calendarReminder)} value={draft.reminderMinutes ?? ""} disabled={rulesDisabled} onChange={event => edit({ reminderMinutes: event.target.value === "" ? null : Number(event.target.value) as PersonalScheduleContract["reminderMinutes"] })}><option value="">{t(taskCopy.calendarReminderNone)}</option>{([0, 5, 15, 30, 60, 1440] as const).map(minutes => <option key={minutes} value={minutes}>{t(minutes === 0 ? taskCopy.calendarReminderAt : minutes === 1440 ? taskCopy.calendarDayBefore : taskCopy.calendarMinutesBefore).replace("{minutes}", String(minutes))}</option>)}</select></label>
        <p className={styles.note}>{zone} · {t(taskCopy.calendarPrivate)}</p>
        {overlap.items.length ? <aside className={styles.conflict}><strong>{t(taskCopy.calendarOverlap)}</strong>{overlap.items.slice(0, 3).map(item => <p key={item.key}>{item.title}</p>)}</aside> : null}
        {!overlap.coverageComplete ? <p className={styles.note}>{t(taskCopy.calendarOverlapUnknown)}</p> : null}
        {error ? <p role="alert" className={styles.note}>{t(error === "invalid" ? taskCopy.calendarInvalidDraft : error === "read" ? taskCopy.calendarReadFailed : taskCopy.todoWriteFailed)}</p> : null}
        <div className={styles.row}><Button type="submit" variant="primary" label={t(taskCopy.todoSave)} disabled={busy || !draft.title.trim() || repeating && !scope} loading={busy} />{confirmOverlap ? <Button label={t(taskCopy.calendarSaveAnyway)} disabled={busy} onClick={() => { void save(true); }} /> : null}{baseline ? <Button label={t(taskCopy.calendarDelete)} variant="dangerGhost" disabled={busy || repeating && !scope} onClick={() => setConfirmDelete(true)} /> : null}</div>
      </form>
    </Modal>
    <ConfirmDialog open={confirmDelete && !busy} title={t(scope === "series" ? taskCopy.calendarDeleteSeriesQuestion : taskCopy.calendarDeleteQuestion)} confirmLabel={t(taskCopy.calendarDeleteConfirm)} destructive onConfirm={() => { void remove(); }} onCancel={() => setConfirmDelete(false)} />
    <ConfirmDialog open={confirmDiscard} title={t(taskCopy.calendarDiscardQuestion)} confirmLabel={t(taskCopy.calendarDiscard)} destructive onConfirm={onClose} onCancel={() => setConfirmDiscard(false)} />
  </>;
}
