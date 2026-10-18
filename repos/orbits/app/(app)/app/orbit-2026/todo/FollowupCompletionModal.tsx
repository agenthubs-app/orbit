"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RelationshipCompletionOutcome } from "../../../../../shared/contract/relationship-lifecycle";
import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Button, Card, Checkbox, ConfirmDialog, FilterOption, Modal, RetryCard, Segmented, Skeleton, TextField, useScopeLanguage } from "../ui";
import { createRelationshipFollowupClient, type RelationshipFollowupRead } from "./relationship-followup-client";
import { createRelationshipFollowupActions, type FollowupMedium, type FollowupNoteReceipt } from "./relationship-followup-actions";
import styles from "./followup-completion.module.css";

export interface FollowupCompletionModalProps {
  open: boolean;
  taskId: string;
  timeZone: string;
  actorId?: string;
  contactName?: string;
  onClose: () => void;
  onCompleted: (taskId: string) => void;
}

export function FollowupCompletionModal(props: FollowupCompletionModalProps) {
  const { account, ready } = useSharedReadAccount();
  if (!props.open || !ready) return null;
  const origin = typeof window === "undefined" ? "same-origin" : window.location?.origin ?? "same-origin";
  return <CompletionSession key={JSON.stringify([account, props.actorId, props.taskId, origin])} {...props} />;
}

function CompletionSession({ taskId, actorId, contactName, timeZone, onClose, onCompleted }: FollowupCompletionModalProps) {
  const language = useScopeLanguage(), t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const reader = useMemo(() => createRelationshipFollowupClient({ actorId }), [actorId]);
  const actions = useMemo(() => createRelationshipFollowupActions({ actorId }), [actorId]);
  const [detail, setDetail] = useState<RelationshipFollowupRead | null>(null), [state, setState] = useState<"loading" | "ready" | "failed">("loading"), [revision, setRevision] = useState(0);
  const [medium, setMedium] = useState<FollowupMedium | "">(""), [note, setNote] = useState(""), [savedNote, setSavedNote] = useState<FollowupNoteReceipt | null>(null);
  const [kind, setKind] = useState<RelationshipCompletionOutcome["kind"]>("next_task"), [goal, setGoal] = useState(""), [nextTitle, setNextTitle] = useState(""), [nextDate, setNextDate] = useState(""), [archiveConfirmed, setArchiveConfirmed] = useState(false);
  const [busy, setBusy] = useState<"note" | "complete" | null>(null), [error, setError] = useState<"note" | "complete" | null>(null), [discard, setDiscard] = useState(false);
  const life = useRef<AbortController | null>(null), pending = useRef(false), initialized = useRef(false), dirty = useRef(false), nextTaskId = useRef<string | null>(null);
  function dateAfter(days: number) { const date = calendarDate(localParts(Date.now(), timeZone).date)!; date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
  useEffect(() => { const controller = new AbortController(); life.current = controller; return () => { controller.abort(); life.current = null; }; }, []);
  useEffect(() => {
    const controller = new AbortController(), signal = life.current ? AbortSignal.any([controller.signal, life.current.signal]) : controller.signal;
    setState("loading");
    if (!validTimeZone(timeZone)) { setState("failed"); return () => controller.abort(); }
    void reader.read(taskId, signal).then(value => {
      if (signal.aborted) return;
      if (!initialized.current) nextTaskId.current = `relationship-task:${crypto.randomUUID()}`;
      setDetail(value); setState("ready");
      if (!initialized.current) {
        initialized.current = true;
        const task = value.snapshot.tasks.find(row => row.taskId === taskId)!;
        setNextTitle(task.title); setGoal(value.snapshot.connection.activeGoal ?? ""); setNextDate(dateAfter(7));
        setKind(value.snapshot.connection.stage === "active" ? "active" : value.snapshot.connection.stage === "archived" ? "archived" : "next_task");
      }
    }).catch(reason => {
      if (signal.aborted) return;
      setState("failed"); setDetail(null);
      if (reason instanceof Error && reason.message === "UNAUTHORIZED") { setNote(""); setMedium(""); setSavedNote(null); setGoal(""); setNextTitle(""); dirty.current = false; initialized.current = false; }
    });
    return () => controller.abort();
  }, [reader, revision, taskId, timeZone]);
  const task = detail?.snapshot.tasks.find(row => row.taskId === taskId), closed = task && !["open", "scheduled"].includes(task.status);
  const others = detail?.snapshot.tasks.filter(row => row.taskId !== taskId && ["open", "scheduled"].includes(row.status)) ?? [];
  const dueAt = nextDate && validTimeZone(timeZone) ? resolveLocalDateTime(nextDate, "09:00", timeZone) : null;
  const outcome: RelationshipCompletionOutcome | null = kind === "active" ? goal.trim() ? { kind, activeGoal: goal.trim() } : null
    : kind === "archived" ? archiveConfirmed && others.length <= 1000 ? { kind, dismissTaskIds: others.map(row => row.taskId) } : null
      : nextTitle.trim() && nextTaskId.current && dueAt && Date.parse(dueAt) > Date.now() && (kind === "nurture" || detail && ["needs_follow_up", "nurture"].includes(detail.snapshot.connection.stage)) ? { kind, nextTask: { taskId: nextTaskId.current, title: nextTitle.trim(), dueAt } } : null;
  const canComplete = Boolean(state === "ready" && detail && !closed && outcome && !busy && (!note.trim() || savedNote));
  const mediumLabel = (value: FollowupMedium | "") => t(value === "email" ? taskCopy.followupEmail : value === "phone" ? taskCopy.followupPhone : value === "met" ? taskCopy.followupMet : taskCopy.followupMessage);
  const edit = () => { dirty.current = true; setError(null); };
  const close = () => { if (!pending.current) { if (dirty.current && !closed) setDiscard(true); else onClose(); } };
  function denied(reason: unknown) {
    if (reason instanceof Error && reason.message === "UNAUTHORIZED") { setDetail(null); setState("failed"); setNote(""); setMedium(""); setGoal(""); setNextTitle(""); setSavedNote(null); dirty.current = false; }
  }
  async function saveNote() {
    if (!detail || !medium || !note.trim() || savedNote || pending.current || !life.current) return;
    const signal = life.current.signal; pending.current = true; setBusy("note"); setError(null);
    try { const receipt = await actions.saveNote(detail, medium, note, signal); if (!signal.aborted) setSavedNote(receipt); }
    catch (reason) { if (!signal.aborted) { denied(reason); setError("note"); } }
    finally { pending.current = false; if (!signal.aborted) setBusy(null); }
  }
  async function complete() {
    if (!canComplete || !detail || !outcome || pending.current || !life.current) return;
    const signal = life.current.signal; pending.current = true; setBusy("complete"); setError(null);
    try { const verified = await actions.complete(detail, outcome, signal); if (!signal.aborted) { setDetail(verified); dirty.current = false; onCompleted(taskId); } }
    catch (reason) { if (!signal.aborted) { denied(reason); setError("complete"); } }
    finally { pending.current = false; if (!signal.aborted) setBusy(null); }
  }
  return <>
    <Modal open title={t(taskCopy.followupCompleteTitle)} size={860} form onClose={close}>
      {state === "loading" ? <Skeleton lines={4} /> : state === "failed" || !detail || !task ? <RetryCard title={t(taskCopy.followupReadFailed)} onRetry={() => setRevision(value => value + 1)} /> : closed ? <p role="status">{t(taskCopy.followupClosed)}</p> : <>
        <header className={styles.header}><h3>{task.title}</h3>{contactName ? <p>{contactName}</p> : null}</header>
        <fieldset className={styles.columns} disabled={Boolean(busy)} aria-label={t(taskCopy.followupCompleteTitle)}>
          <Card><h4 className={styles.heading}>{t(taskCopy.followupWhat)}</h4><div className={styles.options}>{savedNote ? <span>{mediumLabel(medium)}</span> : (["email", "phone", "met", "message"] as const).map(value => <FilterOption key={value} selected={medium === value} label={mediumLabel(value)} onToggle={() => { if (!busy) { edit(); setMedium(value); } }} />)}</div>
            <label className={styles.label}>{t(taskCopy.followupNote)}<textarea aria-label={t(taskCopy.followupNote)} className={styles.noteInput} maxLength={5000} value={note} disabled={Boolean(busy || savedNote)} onChange={event => { edit(); setNote(event.target.value); }} /></label>
            <p className={styles.note}>{t(taskCopy.followupSeparateSave)}</p><p className={styles.note}>{t(taskCopy.followupNotePrivate)}</p>
            {savedNote ? <p role="status" className={styles.note}>{t(taskCopy.followupNoteSaved)}</p> : <Button label={t(taskCopy.followupSaveNote)} size="sm" disabled={!medium || !note.trim() || Boolean(busy)} loading={busy === "note"} onClick={() => { void saveNote(); }} />}
            {error === "note" ? <p role="alert" className={styles.note}>{t(taskCopy.followupNoteFailed)}</p> : null}
          </Card>
          <Card><h4 className={styles.heading}>{t(taskCopy.followupNext)}</h4><Segmented<RelationshipCompletionOutcome["kind"]> label={t(taskCopy.followupNext)} value={kind} segments={[{ key: "next_task", label: t(taskCopy.followupContinue) }, { key: "active", label: t(taskCopy.followupActive) }, { key: "nurture", label: t(taskCopy.followupNurture) }, { key: "archived", label: t(taskCopy.followupArchive) }]} onChange={value => { if (!busy) { edit(); setKind(value); setArchiveConfirmed(false); } }} />
            {kind === "active" ? <><p className={styles.note}>{t(taskCopy.followupActiveHint)}</p><TextField label={t(taskCopy.followupGoal)} aria-label={t(taskCopy.followupGoal)} value={goal} maxLength={2000} disabled={Boolean(busy)} onChange={event => { edit(); setGoal(event.target.value); }} /></> : kind === "archived" ? <div className={styles.archive}><Checkbox checked={archiveConfirmed} label={t(taskCopy.followupArchiveConfirm).replace("{count}", String(others.length))} onChange={value => { if (!busy) { edit(); setArchiveConfirmed(value); } }} /><span>{t(taskCopy.followupArchiveConfirm).replace("{count}", String(others.length))}</span></div> : <div className={styles.fields}>
              {kind === "nurture" ? <p className={styles.note}>{t(taskCopy.followupNurtureHint)}</p> : null}
              <TextField label={t(taskCopy.followupNextTitle)} aria-label={t(taskCopy.followupNextTitle)} maxLength={500} value={nextTitle} disabled={Boolean(busy)} onChange={event => { edit(); setNextTitle(event.target.value); }} />
              <div className={styles.options}>{([3, 7, 14] as const).map(days => <Button key={days} size="sm" label={t(days === 3 ? taskCopy.followupThreeDays : days === 7 ? taskCopy.followupOneWeek : taskCopy.followupTwoWeeks)} disabled={Boolean(busy)} onClick={() => { edit(); setNextDate(dateAfter(days)); }} />)}</div>
              <TextField type="date" label={t(taskCopy.followupNextDate)} aria-label={t(taskCopy.followupNextDate)} value={nextDate} disabled={Boolean(busy)} onChange={event => { edit(); setNextDate(event.target.value); }} /><p className={styles.note}>{timeZone}</p>
            </div>}
          </Card>
        </fieldset>
        {!outcome ? <p className={styles.note}>{t(taskCopy.followupCheckNext)}</p> : null}
        {note.trim() && !savedNote ? <p className={styles.note}>{t(taskCopy.followupSaveFirst)}</p> : null}
        {error === "complete" ? <div role="alert"><p className={styles.note}>{t(taskCopy.followupCompleteFailed)}</p>{savedNote ? <p className={styles.note}>{t(taskCopy.followupNoteSaved)}</p> : null}<Button label={t(taskCopy.proposalReload)} onClick={() => setRevision(value => value + 1)} /></div> : null}
        <footer className={styles.footer}><span className={styles.note}>{t(taskCopy.followupLaterHint)}</span><Button label={t(taskCopy.followupLater)} disabled={Boolean(busy)} onClick={close} /><Button label={t(taskCopy.followupCompleteNext)} variant="primary" loading={busy === "complete"} disabled={!canComplete} onClick={() => { void complete(); }} /></footer>
      </>}
    </Modal>
    <ConfirmDialog open={discard} title={t(taskCopy.followupCloseTitle)} message={t(savedNote ? taskCopy.followupCloseSaved : taskCopy.followupCloseUnsaved)} confirmLabel={t(taskCopy.calendarDiscard)} destructive onConfirm={onClose} onCancel={() => setDiscard(false)} />
  </>;
}

