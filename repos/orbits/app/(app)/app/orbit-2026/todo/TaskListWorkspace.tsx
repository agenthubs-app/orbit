"use client";

import { useMemo, useRef, useState } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { createTasksClient, TasksClientError } from "../../tasks/tasks-client";
import { useTasksMutation, useTasksResource } from "../../tasks/tasks-hooks";
import type { TaskRowView, TaskView } from "../../tasks/tasks-view-model";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Button, Card, CategoryTabs, CheckCircle, Chip, ConfirmDialog, EmptyState, Modal, Orbit2026Scope, RetryCard, SearchField, Skeleton, TextField, ToastProvider, useToast } from "../ui";
import { ShellPage, useInShell } from "../shell/slots";
import { groupTaskRows, type TaskListFilter, type TaskListGroupKey } from "./task-list-groups";
import styles from "./task-list.module.css";

const groups: Record<TaskListGroupKey, keyof typeof taskCopy> = {
  overdue: "taskListOverdue", today: "taskListToday", upcoming: "taskListUpcoming",
  undated: "taskListUndated", completed: "taskListCompleted",
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
  const toast = useToast();
  const client = useMemo(() => createTasksClient(), []);
  const [filter, setFilter] = useState<TaskListFilter>("all");
  const [query, setQuery] = useState("");
  const [openCursor, setOpenCursor] = useState<string | null>(null);
  const [doneCursor, setDoneCursor] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(initialCompleted);
  const [showOpen, setShowOpen] = useState(!initialCompleted);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(initialAdd);
  const [draft, setDraft] = useState("");
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const inShell = useInShell();
  const open = useTasksResource(() => client.loadScopedPage("open", filter, query, openCursor), JSON.stringify([filter, query.trim(), openCursor, "open"]));
  const completed = useTasksResource(() => client.loadScopedPage("completed", filter, query, doneCursor), JSON.stringify([filter, query.trim(), doneCursor, "completed"]));
  const detail = useTasksResource<TaskView | null>(() => selectedId ? client.loadTask(selectedId) : Promise.resolve(null), selectedId ?? "none");
  const mutation = useTasksMutation();
  const denied = [open.error, completed.error, detail.error].some(error => error instanceof TasksClientError && error.code === "UNAUTHORIZED");
  const visibleOpen = !denied ? open.data?.items ?? [] : [];
  const visibleDone = !denied ? completed.data?.items ?? [] : [];
  const setScope = (next: TaskListFilter) => { setFilter(next); setOpenCursor(null); setDoneCursor(null); setSelectedId(null); setConfirmDelete(false); };
  const search = (next: string) => { setQuery(next); setOpenCursor(null); setDoneCursor(null); setSelectedId(null); setConfirmDelete(false); };
  const refresh = () => { open.refresh(); completed.refresh(); detail.refresh(); };

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
      setConfirmDelete(false); setSelectedId(null); setOpenCursor(null); setDoneCursor(null); open.refresh(); completed.refresh();
      toast.success(t(taskCopy.taskListDeleted));
    }, "");
  }
  const selectedRow = [...visibleOpen, ...visibleDone].find(item => item.id === selectedId);
  const rail = <Card className={styles.rail} aria-label={t(taskCopy.taskListDetail)}>
    <h2>{t(taskCopy.taskListDetail)}</h2>
    {selectedId && detail.loading && !detail.data ? <Skeleton lines={4} onRetry={detail.refresh} /> : null}
    {selectedId && detail.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={detail.refresh} /> : null}
    {selectedId && !denied && detail.data ? <>
      <h3 className={styles.detailTitle}>{detail.data.title}</h3>
      <div className={styles.detailMeta}><Chip label={t(detail.data.status === "completed" ? taskCopy.taskListCompleted : taskCopy.taskListOpen)} tone={detail.data.status === "completed" ? "ok" : "lav"} />{selectedRow?.relatedContact ? <span>{selectedRow.relatedContact.namePreview}</span> : null}</div>
      <dl className={styles.detailFacts}><dt>{t(taskCopy.taskListDate)}</dt><dd>{formatDate(detail.data.dueAt ?? detail.data.plannedDate, language, timeZone)}</dd></dl>
      {detail.data.notes ? <section className={styles.detailNotes}><h4>{t(taskCopy.taskListNotes)}</h4><p>{detail.data.notes}</p></section> : null}
      <div className={styles.detailActions}>
        <Button label={t(detail.data.status === "completed" ? taskCopy.taskListReopen : taskCopy.todoDone).replace("{title}", detail.data.title)} disabled={mutation.busy} onClick={() => toggle(detail.data!)} />
        <a className={styles.editLink} href={detail.data.href}>{t(taskCopy.taskListEdit)}</a>
        <Button label={t(taskCopy.taskListDelete)} aria-label={t(taskCopy.taskListDelete)} variant="dangerGhost" disabled={mutation.busy || detail.loading || Boolean(detail.error)} onClick={() => setConfirmDelete(true)} />
      </div>
    </> : !selectedId ? <p className={styles.hint}>{t(taskCopy.taskListNoSelection)}</p> : null}
  </Card>;
  const blocked = denied;
  const openGroups = groupTaskRows(visibleOpen, date, timeZone, filter);
  const doneGroups = groupTaskRows(visibleDone, date, timeZone, filter);
  const orderedRows = [...(showOpen ? openGroups : []), ...(showCompleted ? doneGroups : [])].flatMap(group => group.items);
  const renderRows = (items: TaskRowView[], overdue: boolean) => items.map(item => <div key={item.id} className={`${styles.taskRow} ${overdue ? styles.taskRowOverdue : ""} ${item.id === selectedId ? styles.selected : ""}`}>
    <CheckCircle checked={item.status === "completed"} label={t(item.status === "completed" ? taskCopy.taskListReopen : taskCopy.taskListComplete).replace("{title}", item.title)} onChange={() => toggle(item)} />
    <button type="button" className={`btn ${styles.rowMain}`} aria-label={t(taskCopy.taskListOpenDetail).replace("{title}", item.title)} aria-current={item.id === selectedId ? "true" : undefined} ref={element => { if (element) rowButtons.current.set(item.id, element); else rowButtons.current.delete(item.id); }} onClick={() => setSelectedId(item.id)} onKeyDown={event => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const index = orderedRows.findIndex(row => row.id === item.id);
      const next = orderedRows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      rowButtons.current.get(next.id)?.focus();
      setSelectedId(next.id);
    }}>
      <strong>{item.title}</strong><small>{item.relatedContact?.namePreview ?? t(item.relationship ? taskCopy.taskListRelationship : taskCopy.taskListPersonal)}</small>
    </button>
    <span className={styles.rowSide}>
      <span className={styles.rowDate}>{formatDate(item.dueAt ?? item.plannedDate, language, timeZone)}</span>
      {item.status === "open" ? <Button label={t(taskCopy.taskListCompleted)} aria-label={t(taskCopy.taskListComplete).replace("{title}", item.title)} size="sm" variant="primary" className={styles.quickComplete} disabled={mutation.busy} onClick={() => toggle(item)} /> : null}
    </span>
  </div>);
  const renderGroup = (group: ReturnType<typeof groupTaskRows>[number]) => <section key={group.key} className={styles.group}>
    <h2 className={group.key === "overdue" ? styles.overdue : ""}>{t(taskCopy[groups[group.key]])} <span>{group.items.length}</span></h2>
    <div className={styles.rows}>{renderRows(group.items, group.key === "overdue")}</div>
  </section>;

  return <>
    <ShellPage title={t(taskCopy.taskListTitle)} rightRail={rail} phoneFold />
    <main className={styles.page}>
      <div className={styles.top}><a href="/app/tasks?tab=todo" className={styles.back}>{t(taskCopy.taskListBack)}</a><h1>{t(taskCopy.taskListTitle)}</h1><Button label={t(taskCopy.taskListAdd)} icon="plus" variant="accent" onClick={() => setAdding(true)} /></div>
      <button type="button" hidden data-task-add="" onClick={() => setAdding(true)}>{t(taskCopy.taskListAdd)}</button>
      <div className={styles.toolbar}><CategoryTabs<TaskListFilter> label={t(taskCopy.taskListFilter)} value={filter} onChange={setScope} options={(["all", "relationship", "personal"] as const).map(key => ({ key, label: t(key === "all" ? taskCopy.taskListAll : key === "relationship" ? taskCopy.taskListRelationship : taskCopy.taskListPersonal) }))} />
        <SearchField value={query} onChange={search} placeholder={t(taskCopy.taskListSearch)} />{!showOpen ? <Button label={t(taskCopy.taskListShowOpen)} onClick={() => setShowOpen(true)} /> : null}</div>
      {mutation.error ? <p role="alert" className={styles.error}>{t(taskCopy.todoWriteFailed)}</p> : null}
      {blocked || showOpen && open.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={refresh} /> : null}
      {!blocked && showOpen && open.loading && !open.data ? <Skeleton lines={6} onRetry={refresh} /> : null}
      {!blocked && showOpen && open.data ? <>
        <p className={styles.count}>{t(taskCopy.taskListCount).replace("{count}", String(open.data.total))}</p>
        {visibleOpen.length === 0 ? <EmptyState title={query.trim() ? t(taskCopy.taskListNoMatches) : t(taskCopy.taskListEmpty)} action={!query.trim() ? { label: t(taskCopy.taskListAdd), onSelect: () => setAdding(true) } : undefined} ghostRows={!query.trim() ? 2 : 0} /> : openGroups.map(renderGroup)}
        {openCursor || open.data.nextCursor ? <div className={styles.pager}>{openCursor ? <Button label={t(taskCopy.taskListFirstPage)} onClick={() => { setOpenCursor(null); setSelectedId(null); }} /> : null}{open.data.nextCursor ? <Button label={t(taskCopy.taskListNextPage)} onClick={() => { setOpenCursor(open.data!.nextCursor); setSelectedId(null); }} /> : null}</div> : null}
      </> : null}
      <section className={styles.group}>
        {showOpen ? <Button label={t(showCompleted ? taskCopy.taskListHideCompleted : taskCopy.taskListShowCompleted)} aria-expanded={showCompleted} onClick={() => setShowCompleted(current => !current)} variant="ghost" /> : null}
        {!blocked && showCompleted ? completed.loading && !completed.data ? <Skeleton lines={3} onRetry={completed.refresh} /> : <>
          {completed.error ? <RetryCard title={t(taskCopy.taskListReadFailed)} onRetry={completed.refresh} /> : null}
          {completed.data ? <><p className={styles.count}>{t(taskCopy.taskListCount).replace("{count}", String(completed.data.total))}</p>{doneGroups.map(renderGroup)}
            {doneCursor || completed.data.nextCursor ? <div className={styles.pager}>{doneCursor ? <Button label={t(taskCopy.taskListFirstPage)} onClick={() => { setDoneCursor(null); setSelectedId(null); }} /> : null}{completed.data.nextCursor ? <Button label={t(taskCopy.taskListNextPage)} onClick={() => { setDoneCursor(completed.data!.nextCursor); setSelectedId(null); }} /> : null}</div> : null}</> : null}
        </> : null}
      </section>
      {!inShell && !blocked ? <aside className={styles.inlineRail}>{rail}</aside> : null}
    </main>
    <ConfirmDialog open={confirmDelete} title={t(taskCopy.taskListDeleteQuestion)} message={t(taskCopy.taskListDeleteMessage)} confirmLabel={t(taskCopy.taskListDeleteConfirm)} cancelLabel={t(taskCopy.taskListCancel)} destructive onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    <Modal open={adding} title={t(taskCopy.taskListAdd)} onClose={() => { if (!mutation.busy) setAdding(false); }}>
      <form className={styles.addForm} onSubmit={event => { event.preventDefault(); if (!draft.trim()) return; void mutation.run(() => client.create(draft, date), () => { setDraft(""); setAdding(false); setFilter("all"); setOpenCursor(null); open.refresh(); toast.success(t(taskCopy.todoSaved)); }, ""); }}>
        <TextField label={t(taskCopy.todoTitle)} value={draft} onChange={event => setDraft(event.target.value)} disabled={mutation.busy} autoFocus />
        <Button label={t(taskCopy.todoSave)} type="submit" variant="primary" disabled={!draft.trim() || mutation.busy} />
      </form>
    </Modal>
  </>;
}
