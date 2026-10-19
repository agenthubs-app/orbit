"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localParts, resolveLocalDateTime } from "../../../../../features/tasks/local-date-time";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { createTasksClient, TasksClientError } from "../../tasks/tasks-client";
import { useTasksMutation, useTasksResource } from "../../tasks/tasks-hooks";
import type { TaskRowView, TaskView } from "../../tasks/tasks-view-model";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Button, CategoryTabs, CheckCircle, Chip, ConfirmDialog, Drawer, EmptyState, Icon, Modal, Orbit2026Scope, RetryCard, SearchField, Skeleton, TextField, ToastProvider, useToast } from "../ui";
import { standardCopyFor } from "../copy/standard";
import { ShellPage, useInShell } from "../shell/slots";
import { groupTaskRows, type TaskListFilter, type TaskListGroupKey } from "./task-list-groups";
import { taskDateChange, taskDateDraft, taskDatePatchMovesLater, taskTomorrowPatch, type TaskDatePatch } from "./task-list-date-time";
import { nextMorningReminderAt } from "./task-list-reminder-time";
import styles from "./task-list.module.css";

const groups: Record<TaskListGroupKey, keyof typeof taskCopy> = {
  overdue: "taskListOverdue", today: "taskListToday", upcoming: "taskListUpcoming",
  undated: "taskListUndated", completed: "taskListCompleted",
};
const activityCopy: Record<string, keyof typeof taskCopy> = {
  created: "taskListActivityCreated", updated: "taskListActivityUpdated", rescheduled: "taskListActivityRescheduled",
  completed: "taskListActivityCompleted", reopened: "taskListActivityReopened", cancelled: "taskListActivityCancelled", deleted: "taskListActivityDeleted",
};

function formatDate(value: string | undefined, language: OrbitLanguage, timeZone: string): string {
  if (!value) return pickCopy(taskCopy.taskListUndated, language);
  const dateOnly = value.length === 10;
  return new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", {
    month: "numeric", day: "numeric", ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
    timeZone: dateOnly ? "UTC" : timeZone,
  }).format(new Date(dateOnly ? `${value}T12:00:00Z` : value));
}

export function TaskListWorkspace({ actorId, language, date, timeZone, initialCompleted = false, initialAdd = false, initialSelectedId }: {
  actorId?: string; language: OrbitLanguage; date: string; timeZone: string; initialCompleted?: boolean; initialAdd?: boolean; initialSelectedId?: string;
}) {
  const { account, ready } = useSharedReadAccount();
  return <Orbit2026Scope language={language}><ToastProvider>
    {ready ? <TaskList key={JSON.stringify([actorId, account, initialSelectedId])} language={language} date={date} timeZone={timeZone} initialCompleted={initialCompleted} initialAdd={initialAdd} initialSelectedId={initialSelectedId} /> : <Skeleton lines={5} />}
  </ToastProvider></Orbit2026Scope>;
}

function TaskList({ language, date, timeZone, initialCompleted, initialAdd, initialSelectedId }: { language: OrbitLanguage; date: string; timeZone: string; initialCompleted: boolean; initialAdd: boolean; initialSelectedId?: string }) {
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const inShell = useInShell();
  const [wideShell, setWideShell] = useState<boolean | null>(null);
  useEffect(() => {
    if (!inShell || typeof window === "undefined") return;
    if (!window.matchMedia) { setWideShell(false); return; }
    const media = window.matchMedia("(min-width: 1280px)");
    const update = () => setWideShell(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [inShell]);
  const toast = useToast();
  const client = useMemo(() => createTasksClient(), []);
  const [filter, setFilter] = useState<TaskListFilter>("all");
  const [query, setQuery] = useState("");
  const openContext = JSON.stringify([date, timeZone]);
  const [openPosition, setOpenPosition] = useState<{ context: string; cursor: string | null }>({ context: openContext, cursor: null });
  const openCursor = openPosition.context === openContext ? openPosition.cursor : null;
  const setOpenCursor = (cursor: string | null) => setOpenPosition({ context: openContext, cursor });
  const [doneCursor, setDoneCursor] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(initialCompleted);
  const [showOpen, setShowOpen] = useState(!initialCompleted);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const selectedIdRef = useRef<string | null>(initialSelectedId ?? null);
  const dateRowRefs = useRef<{ date: HTMLButtonElement | null; time: HTMLButtonElement | null }>({ date: null, time: null });
  const pendingDateFocus = useRef<{ taskId: string; focus: "date" | "time" } | null>(null);
  const pendingDateEdit = useRef<string | null>(null);
  const [editing, setEditing] = useState<{ task: TaskView; title: string; notes: string; conflict: boolean } | null>(null);
  const [dateEditing, setDateEditing] = useState<{ task: TaskView; date: string; time: string; timeZone: string; focus: "date" | "time"; conflict: boolean } | null>(null);
  const [dateValidation, setDateValidation] = useState("");
  const [dateFailureTaskId, setDateFailureTaskId] = useState<string | null>(null);
  const [confirmDateDeferral, setConfirmDateDeferral] = useState(false);
  const [customReminder, setCustomReminder] = useState(false);
  const [customReminderAt, setCustomReminderAt] = useState("");
  const [reminderValidation, setReminderValidation] = useState("");
  const [reminderFailureTaskId, setReminderFailureTaskId] = useState<string | null>(null);
  const [reminderAction, setReminderAction] = useState<"add" | "cancel">("add");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmTomorrowTask, setConfirmTomorrowTask] = useState<TaskView | null>(null);
  const [bulkTomorrowRows, setBulkTomorrowRows] = useState<TaskRowView[] | null>(null);
  const [bulkFailures, setBulkFailures] = useState("");
  const [adding, setAdding] = useState(initialAdd);
  const [draft, setDraft] = useState("");
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "n" || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey
        || adding || confirmDelete || selectedId || (event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox']")) return;
      event.preventDefault();
      setAdding(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [adding, confirmDelete, selectedId]);
  const context = { today: date, timeZone };
  const open = useTasksResource(() => client.loadScopedPage("open", filter, query, openCursor, context), JSON.stringify([filter, query.trim(), openCursor, "open", date, timeZone]));
  const completed = useTasksResource(() => client.loadScopedPage("completed", filter, query, doneCursor, context), JSON.stringify([filter, query.trim(), doneCursor, "completed", date, timeZone]));
  const detail = useTasksResource<TaskView | null>(() => selectedId ? client.loadTask(selectedId) : Promise.resolve(null), selectedId ?? "none");
  const relatedEventId = detail.data?.id === selectedId ? detail.data.relatedEventId : undefined;
  const relatedEvent = useTasksResource(() => relatedEventId ? client.loadRelatedEvent(relatedEventId) : Promise.resolve(null), relatedEventId ?? "none");
  const sourceNoteId = detail.data?.id === selectedId ? detail.data.sourceNoteId : undefined;
  const sourceNote = useTasksResource(() => sourceNoteId ? client.loadSourceNote(sourceNoteId) : Promise.resolve(null), sourceNoteId ?? "none");
  const reminders = useTasksResource(() => selectedId ? client.loadReminders(selectedId) : Promise.resolve([]), selectedId ?? "none");
  const activities = useTasksResource(() => selectedId ? client.loadActivities(selectedId) : Promise.resolve([]), selectedId ?? "none");
  const mutation = useTasksMutation();
  const reminderMutation = useTasksMutation();
  const focusDateRowIfReady = (focus: "date" | "time", row: HTMLButtonElement | null) => {
    const target = pendingDateFocus.current;
    if (!row || row.disabled || !target || target.focus !== focus || selectedIdRef.current !== target.taskId || dateEditing || mutation.busy || detail.data?.id !== target.taskId) return;
    row.focus();
    pendingDateFocus.current = null;
  };
  useEffect(() => {
    const target = pendingDateFocus.current;
    if (!target || dateEditing || mutation.busy || selectedId !== target.taskId || detail.data?.id !== target.taskId) return;
    const row = dateRowRefs.current[target.focus];
    if (!row || row.disabled) return;
    focusDateRowIfReady(target.focus, row);
  }, [dateEditing, mutation.busy, selectedId, detail.data?.id]);
  const denied = [open.error, completed.error, detail.error].some(error => error instanceof TasksClientError && error.code === "UNAUTHORIZED");
  const visibleOpen = !denied && !open.error ? open.data?.items ?? [] : [];
  const visibleDone = !denied && !completed.error ? completed.data?.items ?? [] : [];
  const selectTask = (id: string | null) => {
    selectedIdRef.current = id;
    pendingDateFocus.current = null;
    pendingDateEdit.current = null;
    setSelectedId(id);
    setEditing(null);
    setDateEditing(null);
    setDateValidation("");
    setDateFailureTaskId(null);
    setConfirmDateDeferral(false);
    setConfirmDelete(false);
    setConfirmTomorrowTask(null);
    setBulkTomorrowRows(null);
    setCustomReminder(false);
    setCustomReminderAt("");
    setReminderValidation("");
    setReminderFailureTaskId(null);
    setReminderAction("add");
    if (typeof window === "undefined" || !window.location?.href || !window.history?.replaceState) return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("task", id); else url.searchParams.delete("task");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const setScope = (next: TaskListFilter) => { setFilter(next); setOpenCursor(null); setDoneCursor(null); selectTask(null); };
  const search = (next: string) => { setQuery(next); setOpenCursor(null); setDoneCursor(null); selectTask(null); };
  const refresh = () => { open.refresh(); completed.refresh(); detail.refresh(); relatedEvent.refresh(); reminders.refresh(); activities.refresh(); };

  function toggle(item: TaskRowView | TaskView) {
    void mutation.run(() => client.setCompleted(item.id, item.status !== "completed"), () => {
      setOpenCursor(null); setDoneCursor(null);
      refresh();
      toast.success(t(item.status === "completed" ? taskCopy.taskListReopenedToast : taskCopy.taskListCompletedToast));
    }, "");
  }
  function remove() {
    if (!selectedId || detail.data?.id !== selectedId) return;
    const id = selectedId;
    const expectedUpdatedAt = detail.data.updatedAt;
    void mutation.run(async () => {
      try { return await client.removeWithVersion(id, expectedUpdatedAt); }
      catch (error) {
        if (error instanceof TasksClientError && error.code === "CONFLICT") { setConfirmDelete(false); detail.refresh(); }
        throw error;
      }
    }, () => {
      selectTask(null); setOpenCursor(null); setDoneCursor(null); open.refresh(); completed.refresh();
      toast.success(t(taskCopy.taskListDeleted));
    }, "");
  }
  function saveEdit() {
    if (!editing || !editing.title.trim() || editing.conflict || editing.task.notes && !editing.notes.trim()) return;
    const draft = editing;
    void mutation.run(async () => {
      try { return await client.update(draft.task, draft.title, draft.notes); }
      catch (error) {
        if (error instanceof TasksClientError && error.code === "CONFLICT" && selectedIdRef.current === draft.task.id) {
          setEditing(current => current?.task.id === draft.task.id ? { ...current, conflict: true } : current);
          detail.refresh();
        }
        throw error;
      }
    }, updated => {
      open.refresh(); completed.refresh(); activities.refresh();
      if (selectedIdRef.current !== draft.task.id) return;
      detail.replace(updated);
      setEditing(null);
      toast.success(t(taskCopy.taskListSaved));
    }, "");
  }
  function openDateEdit(task: TaskView, focus: "date" | "time") {
    setEditing(null);
    setDateValidation("");
    setDateFailureTaskId(null);
    setDateEditing({ task, ...taskDateDraft(task, timeZone), timeZone, focus, conflict: false });
  }
  useEffect(() => {
    if (pendingDateEdit.current !== selectedId || detail.data?.id !== selectedId || !selectedId) return;
    pendingDateEdit.current = null;
    openDateEdit(detail.data, "date");
  }, [selectedId, detail.data?.id]);
  function editRowDate(item: TaskRowView) {
    selectTask(item.id);
    if (detail.data?.id === item.id) openDateEdit(detail.data, "date");
    else pendingDateEdit.current = item.id;
  }
  function savedTomorrow() {
    setOpenCursor(null); setDoneCursor(null); refresh();
    toast.success(t(taskCopy.taskListDateTimeSaved));
  }
  function moveTomorrow(item: TaskRowView) {
    void mutation.run(async () => {
      const task = await client.loadTask(item.id);
      const patch = task.status === "open" ? taskTomorrowPatch(task, date, timeZone) : null;
      if (!patch) throw new TasksClientError("CONFLICT", "Task date changed");
      if ((task.deferralCount ?? 0) >= 1) return { kind: "confirm" as const, task };
      return { kind: "saved" as const, task: await client.updateSchedule(task, patch) };
    }, result => result.kind === "confirm" ? setConfirmTomorrowTask(result.task) : savedTomorrow(), "");
  }
  function confirmMoveTomorrow() {
    const baseline = confirmTomorrowTask;
    setConfirmTomorrowTask(null);
    if (!baseline) return;
    void mutation.run(async () => {
      const task = await client.loadTask(baseline.id);
      const patch = task.updatedAt === baseline.updatedAt && task.status === "open" ? taskTomorrowPatch(task, date, timeZone) : null;
      if (!patch) throw new TasksClientError("CONFLICT", "Task date changed");
      return client.updateSchedule(task, patch);
    }, savedTomorrow, "");
  }
  function moveOverduePage(rows: TaskRowView[]) {
    setBulkTomorrowRows(null);
    setBulkFailures("");
    void mutation.run(async () => {
      let saved = 0, failed = 0;
      for (const row of rows) {
        try {
          const task = await client.loadTask(row.id);
          const patch = task.status === "open" ? taskTomorrowPatch(task, date, timeZone) : null;
          if (!patch) { failed++; continue; }
          await client.updateSchedule(task, patch);
          saved++;
        } catch { failed++; }
      }
      return { saved, failed };
    }, result => {
      setOpenCursor(null); setDoneCursor(null); refresh();
      if (result.failed) setBulkFailures(t(taskCopy.taskListMoveOverdueResult).replace("{saved}", String(result.saved)).replace("{failed}", String(result.failed)));
      else if (result.saved) toast.success(t(taskCopy.taskListDateTimeSaved));
    }, "");
  }
  function restoreDateFocus(draft: NonNullable<typeof dateEditing>) {
    pendingDateFocus.current = { taskId: draft.task.id, focus: draft.focus };
  }
  function writeDateEdit(draft: NonNullable<typeof dateEditing>, patch: TaskDatePatch) {
    setDateFailureTaskId(draft.task.id);
    void mutation.run(async () => {
      try { return await client.updateSchedule(draft.task, patch); }
      catch (error) {
        if (error instanceof TasksClientError && error.code === "CONFLICT" && selectedIdRef.current === draft.task.id) {
          setDateEditing(current => current?.task.id === draft.task.id ? { ...current, conflict: true } : current);
          detail.refresh();
        }
        throw error;
      }
    }, updated => {
      open.refresh(); completed.refresh(); activities.refresh();
      if (selectedIdRef.current !== draft.task.id) return;
      detail.replace(updated);
      setDateEditing(null);
      setDateFailureTaskId(null);
      setConfirmDateDeferral(false);
      restoreDateFocus(draft);
      toast.success(t(taskCopy.taskListDateTimeSaved));
    }, "");
  }
  function saveDateEdit(confirmed = false) {
    const draft = dateEditing;
    if (!draft || draft.conflict || mutation.busy || detail.data?.id !== draft.task.id) return;
    if (detail.data.updatedAt !== draft.task.updatedAt) {
      setDateEditing({ ...draft, conflict: true });
      return;
    }
    const change = taskDateChange(draft.task, { date: draft.date, time: draft.time }, draft.timeZone);
    if (change.kind === "invalid") {
      setDateValidation(t(change.reason === "date" ? taskCopy.taskListDateTimeInvalid : change.reason === "timeZone" ? taskCopy.taskListTimeZoneInvalid : taskCopy.taskListLocalTimeInvalid));
      return;
    }
    if (change.kind === "unchanged") { setDateEditing(null); restoreDateFocus(draft); return; }
    setDateValidation("");
    if (!confirmed && (draft.task.deferralCount ?? 0) >= 1 && taskDatePatchMovesLater(draft.task, change.patch)) {
      setConfirmDateDeferral(true);
      return;
    }
    writeDateEdit(draft, change.patch);
  }
  function addReminder(fireAt?: string) {
    const task = detail.data;
    if (!task || task.id !== selectedId || reminderMutation.busy || mutation.busy) return;
    setReminderValidation("");
    setReminderFailureTaskId(task.id);
    setReminderAction("add");
    void reminderMutation.run(() => client.addReminder(task, fireAt, timeZone, t(taskCopy.taskListReminder)), () => {
      if (selectedIdRef.current !== task.id) return;
      reminders.refresh();
      setCustomReminder(false);
      setCustomReminderAt("");
      toast.success(t(taskCopy.taskListReminderSaved));
    }, "");
  }
  function addCustomReminder() {
    const [localDate, localTime] = customReminderAt.split("T");
    const fireAt = localDate && localTime ? resolveLocalDateTime(localDate, localTime, timeZone) : null;
    if (!fireAt || Date.parse(fireAt) <= Date.now()) { setReminderValidation(t(taskCopy.taskListReminderInvalid)); return; }
    addReminder(fireAt);
  }
  function cancelReminder(id: string) {
    const taskId = selectedId;
    if (!taskId || reminderMutation.busy || mutation.busy) return;
    setReminderFailureTaskId(taskId);
    setReminderAction("cancel");
    void reminderMutation.run(() => client.cancelReminder(id), () => {
      if (selectedIdRef.current !== taskId) return;
      reminders.refresh();
      toast.success(t(taskCopy.taskListReminderCancelled));
    }, "");
  }
  const selectedRow = [...visibleOpen, ...visibleDone].find(item => item.id === selectedId);
  const notesClearUnsupported = Boolean(editing?.task.notes && !editing.notes.trim());
  const reminderErrorCopy = reminderMutation.error instanceof TasksClientError && reminderMutation.error.code === "INVALID_REMINDER"
    ? taskCopy.taskListReminderExpired : reminderAction === "cancel" ? taskCopy.taskListReminderCancelFailed : taskCopy.taskListReminderSaveFailed;
  const detailDate = detail.data ? formatDate(detail.data.dueAt ? localParts(detail.data.dueAt, timeZone).date : detail.data.plannedDate, language, timeZone) : "";
  const detailTime = detail.data ? detail.data.dueAt ? new Intl.DateTimeFormat(language === "ja" ? "ja-JP" : language === "zh" ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(detail.data.dueAt)) : t(taskCopy.taskListNoTime) : "";
  const detailContent = <div className={styles.rail}>
    {selectedId && detail.loading && !detail.data ? <Skeleton lines={4} onRetry={detail.refresh} /> : null}
    {selectedId && detail.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={detail.refresh} /> : null}
    {selectedId && !denied && editing?.task.id === selectedId ? <form className={styles.editForm} onSubmit={event => { event.preventDefault(); saveEdit(); }}>
      <TextField label={t(taskCopy.todoTitle)} value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} disabled={mutation.busy} autoFocus />
      <label className={styles.editNotes}>{t(taskCopy.taskListNotes)}<textarea aria-label={t(taskCopy.taskListNotes)} value={editing.notes} onChange={event => setEditing({ ...editing, notes: event.target.value })} disabled={mutation.busy} /></label>
      {notesClearUnsupported ? <p role="alert" className={styles.error}>{t(taskCopy.taskListNotesCannotClear)}</p> : null}
      {editing.conflict ? <p role="alert" className={styles.error}>{t(taskCopy.taskListConflict)}</p> : null}
      <div className={styles.editActions}><Button label={t(taskCopy.todoSave)} type="submit" variant="primary" disabled={!editing.title.trim() || notesClearUnsupported || editing.conflict || mutation.busy} /><Button label={t(taskCopy.taskListCancel)} type="button" variant="ghost" disabled={mutation.busy} onClick={() => setEditing(null)} /></div>
    </form> : selectedId && !denied && !detail.error && detail.data ? <>
      <div className={styles.identityCard} data-task-detail-card="identity">
        <h3 className={styles.detailTitle}>{detail.data.title}</h3>
        <div className={styles.detailMeta}><Chip label={t(detail.data.status === "completed" ? taskCopy.taskListCompleted : taskCopy.taskListOpen)} tone={detail.data.status === "completed" ? "ok" : "lav"} />{selectedRow?.relatedContact ? <span>{selectedRow.relatedContact.namePreview}</span> : null}</div>
      </div>
      <div className={styles.scheduleCard} data-task-detail-card="schedule">
      <div className={styles.detailSchedule}>
        {dateEditing?.task.id !== selectedId ? <div className={styles.scheduleRows}>
          <button type="button" className={`btn ${styles.scheduleRow}`} aria-label={`${t(taskCopy.taskListEditDate)}: ${detailDate}`} ref={element => { dateRowRefs.current.date = element; focusDateRowIfReady("date", element); }} disabled={mutation.busy || detail.loading} onClick={() => openDateEdit(detail.data!, "date")}><span>{t(taskCopy.taskListDate)}</span><span>{detailDate}<Icon name="right" size={16} /></span></button>
          <button type="button" className={`btn ${styles.scheduleRow}`} aria-label={`${t(taskCopy.taskListEditTime)}: ${detailTime}`} ref={element => { dateRowRefs.current.time = element; focusDateRowIfReady("time", element); }} disabled={mutation.busy || detail.loading} onClick={() => openDateEdit(detail.data!, "time")}><span>{t(taskCopy.taskListTime)}</span><span>{detailTime}<Icon name="right" size={16} /></span></button>
        </div> : null}
      </div>
      {dateEditing?.task.id === selectedId ? <form className={styles.dateEditForm} onSubmit={event => { event.preventDefault(); saveDateEdit(); }}>
        <TextField label={t(taskCopy.taskListDate)} type="date" value={dateEditing.date} onChange={event => { setDateEditing({ ...dateEditing, date: event.target.value }); setDateValidation(""); }} disabled={mutation.busy || dateEditing.conflict} autoFocus={dateEditing.focus === "date"} />
        <TextField label={t(taskCopy.taskListTime)} type="time" value={dateEditing.time} onChange={event => { setDateEditing({ ...dateEditing, time: event.target.value }); setDateValidation(""); }} disabled={mutation.busy || dateEditing.conflict} autoFocus={dateEditing.focus === "time"} />
        <p className={styles.hint}>{dateEditing.timeZone} · {t(taskCopy.taskListReminderDateNote)}</p>
        {dateValidation ? <p role="alert" className={styles.error}>{dateValidation}</p> : null}
        {dateEditing.conflict ? <p role="alert" className={styles.error}>{t(taskCopy.taskListConflict)}</p> : null}
        {dateFailureTaskId === selectedId && mutation.error && !dateEditing.conflict ? <p role="alert" className={styles.error}>{t(taskCopy.taskListDateTimeSaveFailed)}</p> : null}
        <div className={styles.editActions}><Button label={t(taskCopy.taskListSaveDateTime)} type="submit" variant="primary" disabled={mutation.busy || dateEditing.conflict} /><Button label={t(taskCopy.taskListCancel)} type="button" variant="ghost" disabled={mutation.busy} onClick={() => { const draft = dateEditing; setDateEditing(null); setDateValidation(""); restoreDateFocus(draft); }} /></div>
      </form> : null}
      <section className={styles.detailSection}>
        <h4>{t(taskCopy.taskListReminder)}</h4>
        {reminders.loading && !reminders.data ? <Skeleton lines={1} /> : reminders.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={reminders.refresh} /> : reminders.data?.length ? <ul className={styles.detailTimeline}>{reminders.data.map(reminder => <li key={reminder.id}><time dateTime={reminder.fireAt}>{formatDate(reminder.fireAt, language, timeZone)}</time><Button label={t(taskCopy.taskListCancel)} aria-label={`${t(taskCopy.taskListReminderCancel)}: ${formatDate(reminder.fireAt, language, timeZone)}`} size="sm" variant="ghost" disabled={reminderMutation.busy || mutation.busy} onClick={() => cancelReminder(reminder.id)} /></li>)}</ul> : <p className={styles.hint}>{t(taskCopy.taskListNoReminder)}</p>}
        {detail.data.status === "open" && !reminders.error ? <div className={styles.reminderControls}>
          <div className={styles.reminderPresets}>
            <Button label={t(taskCopy.taskListReminderHour)} size="sm" disabled={reminderMutation.busy || mutation.busy || reminders.loading} onClick={() => addReminder()} />
            <Button label={t(taskCopy.taskListReminderTomorrow)} size="sm" disabled={reminderMutation.busy || mutation.busy || reminders.loading} onClick={() => { const next = nextMorningReminderAt(new Date(), timeZone); if (next) addReminder(next); else setReminderValidation(t(taskCopy.taskListReminderInvalid)); }} />
            <Button label={t(taskCopy.taskListReminderCustom)} size="sm" disabled={reminderMutation.busy || mutation.busy || reminders.loading} onClick={() => { setCustomReminder(current => !current); setReminderValidation(""); }} />
          </div>
          {customReminder ? <form className={styles.customReminder} onSubmit={event => { event.preventDefault(); addCustomReminder(); }}><TextField label={t(taskCopy.taskListReminderAt)} type="datetime-local" value={customReminderAt} onChange={event => setCustomReminderAt(event.target.value)} disabled={reminderMutation.busy} /><Button label={t(taskCopy.taskListReminderSet)} type="submit" variant="primary" size="sm" disabled={reminderMutation.busy || !customReminderAt} /></form> : null}
          <p className={styles.hint}>{t(taskCopy.taskListReminderInApp)}</p>
        </div> : null}
        {reminderValidation ? <p role="alert" className={styles.error}>{reminderValidation}</p> : null}
        {reminderFailureTaskId === selectedId && reminderMutation.error ? <p role="alert" className={styles.error}>{t(reminderErrorCopy)}</p> : null}
      </section>
      </div>
      {detail.data.relatedEventId ? <section className={styles.relatedCard} aria-label={t(taskCopy.taskListRelatedEvent)}>
        <h4>{t(taskCopy.taskListRelatedEvent)}</h4>
        {relatedEvent.loading && !relatedEvent.data ? <Skeleton lines={1} /> : relatedEvent.error ? <RetryCard title={t(taskCopy.taskListRelatedEventReadFailed)} onRetry={relatedEvent.refresh} /> : relatedEvent.data ? <a className={styles.relatedEventLink} href={`/app/events/${encodeURIComponent(relatedEvent.data.id)}`}><span><strong>{relatedEvent.data.title}</strong><time dateTime={relatedEvent.data.startsAt}>{formatDate(relatedEvent.data.startsAt, language, timeZone)}</time></span><Icon name="right" size={16} /></a> : null}
      </section> : null}
      {detail.data.sourceNoteId ? <section className={styles.relatedCard} aria-label={t(taskCopy.taskListSourceNote)}>
        <h4>{t(taskCopy.taskListSourceNote)}</h4>
        {sourceNote.loading && !sourceNote.data ? <Skeleton lines={2} /> : sourceNote.error ? <RetryCard title={t(taskCopy.taskListSourceNoteReadFailed)} onRetry={sourceNote.refresh} /> : sourceNote.data ? <>
          {sourceNote.data.body.trim() ? <blockquote className={styles.sourceNoteQuote}>{sourceNote.data.body}</blockquote> : null}
          <div className={styles.sourceNoteMeta}><strong>{sourceNote.data.title}</strong><time dateTime={sourceNote.data.createdAt}>{formatDate(sourceNote.data.createdAt, language, timeZone)}</time></div>
        </> : null}
      </section> : null}
      {detail.data.notes ? <section className={styles.detailNotes}><h4>{t(taskCopy.taskListNotes)}</h4><p>{detail.data.notes}</p></section> : null}
      <section className={`${styles.detailSection} ${styles.historyCard}`} data-task-detail-card="history">
        <h4>{t(taskCopy.taskListHistory)}</h4>
        {activities.loading && !activities.data ? <Skeleton lines={2} /> : activities.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={activities.refresh} /> : activities.data?.length ? <ol className={styles.detailTimeline}>{activities.data.slice(0, 10).map(activity => <li key={activity.id}><time dateTime={activity.occurredAt}>{formatDate(activity.occurredAt, language, timeZone)}</time><span>{t(taskCopy[activityCopy[activity.type] ?? "taskListActivityUpdated"])}</span></li>)}</ol> : <p className={styles.hint}>{t(taskCopy.taskListNoHistory)}</p>}
      </section>
      <div className={styles.detailActions}>
        <Button label={t(detail.data.status === "completed" ? taskCopy.taskListReopen : taskCopy.todoDone).replace("{title}", detail.data.title)} disabled={mutation.busy} onClick={() => toggle(detail.data!)} />
        <Button label={t(taskCopy.taskListEdit)} variant="ghost" disabled={mutation.busy || detail.loading} onClick={() => { setDateEditing(null); setEditing({ task: detail.data!, title: detail.data!.title, notes: detail.data!.notes ?? "", conflict: false }); }} />
        <Button label={t(taskCopy.taskListDelete)} aria-label={t(taskCopy.taskListDelete)} variant="dangerGhost" disabled={mutation.busy || detail.loading || Boolean(detail.error)} onClick={() => setConfirmDelete(true)} />
      </div>
    </> : !selectedId ? <p className={styles.hint}>{t(taskCopy.taskListNoSelection)}</p> : null}
  </div>;
  const detailRail = selectedId ? <div className={styles.railPanel}>
    <div className={styles.railHeader}><h2>{t(taskCopy.taskListDetail)}</h2><button type="button" className={`btn ${styles.railClose}`} aria-label={standardCopyFor(language).action.close} onClick={() => selectTask(null)}><Icon name="x" size={20} /></button></div>
    {detailContent}
  </div> : null;
  const blocked = denied;
  const openGroups = groupTaskRows(visibleOpen, date, timeZone, filter);
  const doneGroups = groupTaskRows(visibleDone, date, timeZone, filter);
  const todayCount = openGroups.find(group => group.key === "today")?.items.length ?? 0;
  const shellSubtitle = open.data ? t(taskCopy.taskListSubtitle).replace("{total}", String(open.data.total)).replace("{today}", String(todayCount)) : undefined;
  const emptyGuide = filter === "all" && !query.trim() && !openCursor && open.data?.total === 0 && completed.data?.total === 0;
  const emptyRail = <div className={styles.emptyRail} data-task-empty-rail="">
    <h2><span aria-hidden="true">✨</span> iOrbit</h2>
    <div><h3>{t(taskCopy.taskListEmptyRailTitle)}</h3><p>{t(taskCopy.taskListEmptyRailBody)}</p></div>
  </div>;
  const orderedRows = [...(showOpen ? openGroups : []), ...(showCompleted ? doneGroups : [])].flatMap(group => group.items);
  const renderRows = (items: TaskRowView[], overdue: boolean) => items.map(item => <tr key={item.id} className={`${styles.taskRow} ${overdue ? styles.taskRowOverdue : ""} ${item.id === selectedId ? styles.selected : ""}`}>
    <td className={styles.checkCell}><CheckCircle checked={item.status === "completed"} label={t(item.status === "completed" ? taskCopy.taskListReopen : taskCopy.taskListComplete).replace("{title}", item.title)} onChange={() => toggle(item)} /></td>
    <td><button type="button" className={`btn ${styles.rowMain}`} aria-label={t(taskCopy.taskListOpenDetail).replace("{title}", item.title)} aria-current={item.id === selectedId ? "true" : undefined} ref={element => { if (element) rowButtons.current.set(item.id, element); else rowButtons.current.delete(item.id); }} onClick={() => selectTask(item.id)} onKeyDown={event => {
      if (event.key.toLowerCase() === "e" && !event.repeat && !event.altKey && !event.ctrlKey && !event.metaKey && item.status === "open" && item.id === selectedId && !mutation.busy) {
        event.preventDefault();
        toggle(item);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const index = orderedRows.findIndex(row => row.id === item.id);
      const next = orderedRows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      rowButtons.current.get(next.id)?.focus();
      selectTask(next.id);
    }}>
      <strong>{item.title}</strong><small>{item.relatedContact?.namePreview ?? t(item.relationship ? taskCopy.taskListRelationship : taskCopy.taskListPersonal)}</small>
    </button></td>
    <td className={styles.relatedCell}><Chip label={t(item.relationship ? taskCopy.taskListRelationship : taskCopy.taskListPersonal)} tone={item.relationship ? "lav" : "teal"} /></td>
    <td className={styles.rowDate}>{item.dueAt || item.plannedDate ? <Chip label={formatDate(item.dueAt ?? item.plannedDate, language, timeZone)} tone={overdue ? "coral" : undefined} /> : t(taskCopy.taskListUndated)}</td>
    <td className={styles.actionCell}>
      {item.status === "open" ? <span className={styles.quickActions}><Button label={taskTomorrowPatch(item, date, timeZone) ? t(taskCopy.todoTomorrow) : t(taskCopy.taskListEditDate)} aria-label={`${item.title}: ${taskTomorrowPatch(item, date, timeZone) ? t(taskCopy.todoTomorrow) : t(taskCopy.taskListEditDate)}`} size="sm" className={styles.quickComplete} disabled={mutation.busy} onClick={() => taskTomorrowPatch(item, date, timeZone) ? moveTomorrow(item) : editRowDate(item)} /><Button label={t(taskCopy.taskListCompleted)} aria-label={t(taskCopy.taskListComplete).replace("{title}", item.title)} size="sm" variant="primary" className={styles.quickComplete} disabled={mutation.busy} onClick={() => toggle(item)} /></span> : null}
    </td>
  </tr>);
  const renderGroup = (group: ReturnType<typeof groupTaskRows>[number]) => <tbody key={group.key}>
    <tr className={styles.groupRow}><th colSpan={5} scope="rowgroup"><div className={styles.groupHeading}><h2 className={group.key === "overdue" ? styles.overdue : ""}>{t(taskCopy[groups[group.key]])} <span>{group.items.length}</span></h2>{group.key === "overdue" ? <Button label={t(taskCopy.taskListMoveOverdueCount).replace("{count}", String(group.items.length))} size="sm" disabled={mutation.busy} onClick={() => setBulkTomorrowRows([...group.items])} /> : null}</div></th></tr>
    {renderRows(group.items, group.key === "overdue")}
  </tbody>;
  const tableHead = <thead><tr><th scope="col" className={styles.checkCell}></th><th scope="col">{t(taskCopy.taskListColumnTask)}</th><th scope="col" className={styles.relatedCell}>{t(taskCopy.taskListColumnRelated)}</th><th scope="col">{t(taskCopy.taskListColumnDue)}</th><th scope="col" className={styles.actionCell}></th></tr></thead>;

  return <>
    <ShellPage title={t(taskCopy.sourceTask)} subtitle={shellSubtitle}
      left={<a href="/app/tasks?tab=todo" className={`btn ${styles.shellBack}`} aria-label={t(taskCopy.taskListBack)}><Icon name="left" size={20} /></a>}
      right={<div className={styles.shellActions}><SearchField value={query} onChange={search} placeholder={t(taskCopy.taskListSearch)} /><Button label={t(taskCopy.taskListAdd)} icon="plus" variant="accent" onClick={() => setAdding(true)} /></div>}
      rightRail={wideShell === true ? selectedId ? detailRail : emptyGuide ? emptyRail : false : false} phoneFold />
    <main className={`${styles.page} ${inShell ? styles.pageInShell : ""}`}>
      <div className={`${styles.top} ${inShell ? styles.topInShell : ""}`}><a href="/app/tasks?tab=todo" className={styles.back}>{t(taskCopy.taskListBack)}</a><h1>{t(taskCopy.taskListTitle)}</h1><Button label={t(taskCopy.taskListAdd)} icon="plus" variant="accent" onClick={() => setAdding(true)} /></div>
      <Button hidden style={{ display: "none" }} data-task-add="" label={t(taskCopy.taskListAdd)} onClick={() => setAdding(true)} />
      {emptyGuide ? <div className={styles.emptyGrid}>
        <section className={styles.emptyGuide}><div className={styles.emptyIntro}><span className={styles.emptyMark} aria-hidden="true">✅</span><div><h2>{t(taskCopy.taskListEmptyGuide)}</h2><p>{t(taskCopy.taskListEmptyGuideBody)}</p></div></div><div className={styles.emptyGuideActions}><Button label={t(taskCopy.taskListAdd)} icon="plus" variant="primary" onClick={() => setAdding(true)} /><span>{t(taskCopy.taskListEmptyShortcut)} <kbd>N</kbd></span></div></section>
        <div className={styles.emptySources}><button type="button" className={`btn ${styles.emptySource}`} data-task-source="manual" onClick={() => setAdding(true)}><span className={styles.emptySourceIcon} aria-hidden="true">＋</span><span><strong>{t(taskCopy.taskListManualSource)}</strong><small>{t(taskCopy.taskListManualSourceHint)}</small></span><Icon name="right" size={16} /></button></div>
      </div> : null}
      <div className={styles.listCard} data-task-list-card>
      <div className={styles.toolbar}><CategoryTabs<TaskListFilter> label={t(taskCopy.taskListFilter)} value={filter} onChange={setScope} options={(["all", "relationship", "personal"] as const).map(key => ({ key, label: t(key === "all" ? taskCopy.taskListAll : key === "relationship" ? taskCopy.taskListRelationship : taskCopy.taskListPersonal) }))} />
        {inShell ? <div className={styles.mobileSearch}><SearchField value={query} onChange={search} placeholder={t(taskCopy.taskListSearch)} /></div> : <SearchField value={query} onChange={search} placeholder={t(taskCopy.taskListSearch)} />}{!showOpen ? <Button label={t(taskCopy.taskListShowOpen)} onClick={() => setShowOpen(true)} /> : null}</div>
      {mutation.error ? <p role="alert" className={styles.error}>{t(taskCopy.todoWriteFailed)}</p> : null}
      {bulkFailures ? <p role="alert" className={styles.error}>{bulkFailures}</p> : null}
      {blocked || showOpen && open.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={refresh} /> : null}
      {!blocked && showOpen && open.loading && !open.data ? <Skeleton lines={6} onRetry={refresh} /> : null}
      {!blocked && showOpen && !open.error && open.data ? <>
        {!emptyGuide ? <p className={styles.count}>{t(taskCopy.taskListCount).replace("{count}", String(open.data.total))}</p> : null}
        {visibleOpen.length === 0 ? emptyGuide ? <div className={styles.emptyRows} aria-hidden="true"><p>{t(taskCopy.taskListToday)} 0</p>{[taskCopy.taskListEmptyExampleOne, taskCopy.taskListEmptyExampleTwo, taskCopy.taskListEmptyExampleThree].map((example, index) => <div className={styles.emptyExample} key={index}><i />{t(example)} <span>{t(taskCopy.taskListEmptySample)}</span></div>)}</div> : <EmptyState title={query.trim() ? t(taskCopy.taskListNoMatches) : t(taskCopy.taskListEmpty)} action={!query.trim() ? { label: t(taskCopy.taskListAdd), onSelect: () => setAdding(true) } : undefined} ghostRows={!query.trim() ? 2 : 0} /> : <div className={styles.tableCard}><table className={styles.taskTable} aria-label={t(taskCopy.taskListTitle)}>{tableHead}{openGroups.map(renderGroup)}</table></div>}
        {openCursor || open.data.nextCursor ? <div className={styles.pager}>{openCursor ? <Button label={t(taskCopy.taskListFirstPage)} onClick={() => { setOpenCursor(null); selectTask(null); }} /> : null}{open.data.nextCursor ? <Button label={t(taskCopy.taskListNextPage)} onClick={() => { setOpenCursor(open.data!.nextCursor); selectTask(null); }} /> : null}</div> : null}
      </> : null}
      <section className={styles.group}>
        {showOpen ? <Button label={t(showCompleted ? taskCopy.taskListHideCompleted : taskCopy.taskListShowCompleted)} aria-expanded={showCompleted} onClick={() => setShowCompleted(current => !current)} variant="ghost" /> : null}
        {!blocked && showCompleted ? completed.loading && !completed.data ? <Skeleton lines={3} onRetry={completed.refresh} /> : <>
          {completed.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={completed.refresh} /> : null}
          {!completed.error && completed.data ? <><p className={styles.count}>{t(taskCopy.taskListCount).replace("{count}", String(completed.data.total))}</p>{doneGroups.length ? <div className={styles.tableCard}><table className={styles.taskTable} aria-label={t(taskCopy.taskListCompleted)}>{tableHead}{doneGroups.map(renderGroup)}</table></div> : null}
            {doneCursor || completed.data.nextCursor ? <div className={styles.pager}>{doneCursor ? <Button label={t(taskCopy.taskListFirstPage)} onClick={() => { setDoneCursor(null); selectTask(null); }} /> : null}{completed.data.nextCursor ? <Button label={t(taskCopy.taskListNextPage)} onClick={() => { setDoneCursor(completed.data!.nextCursor); selectTask(null); }} /> : null}</div> : null}</> : null}
        </> : null}
      </section>
      </div>
    </main>
    <Drawer open={Boolean(selectedId && (!inShell || wideShell === false))} onClose={() => selectTask(null)} title={t(taskCopy.taskListDetail)} size="md">{detailContent}</Drawer>
    <ConfirmDialog open={confirmDelete} title={t(taskCopy.taskListDeleteQuestion)} message={t(taskCopy.taskListDeleteMessage)} confirmLabel={t(taskCopy.taskListDeleteConfirm)} cancelLabel={t(taskCopy.taskListCancel)} destructive onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    <ConfirmDialog open={confirmDateDeferral} title={t(taskCopy.taskListDeferAgainTitle)} message={t(taskCopy.taskListDeferAgainMessage)} confirmLabel={t(taskCopy.taskListDeferAgainConfirm)} cancelLabel={t(taskCopy.taskListCancel)} onCancel={() => setConfirmDateDeferral(false)} onConfirm={() => { setConfirmDateDeferral(false); saveDateEdit(true); }} />
    <ConfirmDialog open={Boolean(confirmTomorrowTask)} title={t(taskCopy.taskListDeferAgainTitle)} message={t(taskCopy.taskListDeferAgainMessage)} confirmLabel={t(taskCopy.taskListDeferAgainConfirm)} cancelLabel={t(taskCopy.taskListCancel)} onCancel={() => setConfirmTomorrowTask(null)} onConfirm={confirmMoveTomorrow} />
    <ConfirmDialog open={Boolean(bulkTomorrowRows)} title={t(taskCopy.taskListMoveOverdueTitle)} message={t(taskCopy.taskListMoveOverdueMessage).replace("{count}", String(bulkTomorrowRows?.length ?? 0))} confirmLabel={t(taskCopy.taskListMoveOverdueConfirm)} cancelLabel={t(taskCopy.taskListCancel)} onCancel={() => setBulkTomorrowRows(null)} onConfirm={() => { if (bulkTomorrowRows) moveOverduePage(bulkTomorrowRows); }} />
    <Modal open={adding} title={t(taskCopy.taskListAdd)} onClose={() => { if (!mutation.busy) setAdding(false); }}>
      <form className={styles.addForm} onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; void mutation.run(() => client.create(draft, date), () => { setDraft(""); setAdding(false); setFilter("all"); setOpenCursor(null); open.refresh(); toast.success(t(taskCopy.todoSaved)); }, ""); }}>
        <TextField label={t(taskCopy.todoTitle)} value={draft} onChange={event => setDraft(event.target.value)} disabled={mutation.busy} autoFocus />
        <Button label={t(taskCopy.todoSave)} type="submit" variant="primary" disabled={!draft.trim() || mutation.busy} />
      </form>
    </Modal>
  </>;
}
