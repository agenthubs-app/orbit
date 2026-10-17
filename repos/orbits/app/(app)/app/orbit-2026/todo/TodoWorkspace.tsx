"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { TodoSectionKey } from "../../../../../shared/contract/todo-page";
import { calendarDate, resolveLocalDateTime } from "../../../../../features/tasks/local-date-time";
import { useSharedReadAccount } from "../../orbit-shared-read-account";
import { createTasksClient } from "../../tasks/tasks-client";
import { pickCopy } from "../copy/types";
import { taskCopy } from "../copy/task";
import { Button, ListRow, Modal, Orbit2026Scope, TextField, ToastProvider, useToast } from "../ui";
import { createTodoDecisionClient } from "./todo-decision-client";
import { TodoPresenter, todoSourceCopy } from "./TodoPresenter";
import { todoPageView, type DecisionAction } from "./todo-view-model";
import { useTodoPage } from "./useTodoPage";
import styles from "./todo.module.css";
import { TodoDraftDrawer, type ManualTodoDraft } from "./TodoDraftDrawer";

export function TodoWorkspace({ language, timeZone, date, initialAdd = false }: { language: OrbitLanguage; timeZone: string; date: string; initialAdd?: boolean }) {
  const { account } = useSharedReadAccount();
  return <Orbit2026Scope language={language}><ToastProvider><Workspace key={account ?? "signed-out"} timeZone={timeZone} date={date} language={language} initialAdd={initialAdd} /></ToastProvider></Orbit2026Scope>;
}

function Workspace({ language, timeZone, date, initialAdd }: { language: OrbitLanguage; timeZone: string; date: string; initialAdd: boolean }) {
  const resource = useTodoPage(timeZone, date);
  const { account } = useSharedReadAccount();
  const view = resource.page ? todoPageView(resource.page) : null;
  const toast = useToast();
  const t = (entry: typeof taskCopy[keyof typeof taskCopy]) => pickCopy(entry, language);
  const clients = useMemo(() => ({ decisions: createTodoDecisionClient(), tasks: createTasksClient() }), [account]);
  const [adding, setAdding] = useState(initialAdd);
  const [title, setTitle] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState<TodoSectionKey | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { title: string; reason?: string; value: ManualTodoDraft }>>({});
  const scope = JSON.stringify([account, date, timeZone]);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const operation = useRef<symbol | null>(null);
  useEffect(() => { operation.current = null; setBusy(false); setError(false); setAll(null); }, [scope]);
  useEffect(() => { if (initialAdd) setAdding(true); }, [initialAdd]);
  useEffect(() => () => { activeScope.current = "unmounted"; operation.current = null; }, []);

  async function mutate(write: () => Promise<unknown>, message: string, settled?: () => void) {
    if (operation.current) return;
    const token = Symbol();
    operation.current = token;
    setBusy(true); setError(false);
    try {
      await write();
      if (activeScope.current !== scope || operation.current !== token) return;
      settled?.();
      toast.success(message);
      await resource.refresh();
    } catch (error) {
      if (activeScope.current === scope && operation.current === token) {
        setError(true); toast.error(t(taskCopy.todoWriteFailed));
        if (error instanceof Error && "code" in error && error.code === "UNAUTHORIZED") await resource.refresh();
      }
    } finally {
      if (activeScope.current === scope && operation.current === token) { operation.current = null; setBusy(false); }
    }
  }

  function decide(key: string, action: DecisionAction) {
    const item = resource.page?.decisions.items.find(row => row.key === key);
    if (!item || item.sample || resource.page?.sources[item.source] !== "ok") return;
    let nextVisibleAt: string | undefined;
    if (item.source === "task_suggestion" && action === "snooze") {
      const tomorrow = calendarDate(date)!;
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      nextVisibleAt = resolveLocalDateTime(tomorrow.toISOString().slice(0, 10), "09:00", timeZone) ?? undefined;
    }
    void mutate(() => clients.decisions.decide(item, action, { nextVisibleAt }), t(taskCopy.todoDecisionSaved));
  }

  const sectionTitle = (section: TodoSectionKey) => t(section === "decisions" ? taskCopy.todoDecisions : section === "nextMoves" ? taskCopy.todoNextMoves : taskCopy.todoFollowups);
  function openDraft(key: string) {
    const row = resource.page?.nextMoves.items.find(item => item.key === key);
    if (!row?.draftAvailable) return;
    setDrafts(current => current[key] ? current : { ...current, [key]: { title: row.titlePreview, reason: row.reasonPreview, value: { to: "", subject: row.titlePreview, body: "" } } });
    setDraftKey(key);
  }
  const draft = draftKey ? drafts[draftKey] : null;
  return <>
    <button type="button" hidden data-task-add="" onClick={() => { setAdding(true); setError(false); }}>{t(taskCopy.todoAdd)}</button>
    <TodoPresenter state={resource.state} view={view} onRetry={() => { void resource.refresh(); }} onDecision={decide} onMore={setAll} onDraft={openDraft} />
    {draft ? <TodoDraftDrawer key={draftKey} open title={draft.title} reason={draft.reason} value={draft.value} onChange={value => setDrafts(current => ({ ...current, [draftKey!]: { ...current[draftKey!]!, value } }))} onClose={() => setDraftKey(null)} /> : null}
    {error && !adding ? <p role="alert" className={styles.note}>{t(taskCopy.todoWriteFailed)}</p> : null}
    <Modal open={adding} title={t(taskCopy.todoAdd)} onClose={() => { if (!busy) setAdding(false); }}>
      <form onSubmit={event => { event.preventDefault(); if (!title.trim()) return; void mutate(() => clients.tasks.create(title, date), t(taskCopy.todoSaved), () => { setTitle(""); setAdding(false); }); }}>
        <TextField label={t(taskCopy.todoTitle)} value={title} autoFocus disabled={busy} onChange={event => setTitle(event.target.value)} />
        {error ? <p role="alert" className={styles.note}>{t(taskCopy.todoWriteFailed)}</p> : null}
        <div className={styles.moveFoot}><Button type="submit" label={t(taskCopy.todoSave)} variant="primary" disabled={!title.trim() || busy} loading={busy} /></div>
      </form>
    </Modal>
    <Modal open={all !== null} title={all ? sectionTitle(all) : ""} size={680} onClose={() => setAll(null)}>
      {all && view ? <>
        {view[all].items.map(row => <ListRow key={row.key} title={row.title} subtitle={row.subtitle ?? row.contactName} href={"href" in row ? row.href : undefined} hoverActions={"actions" in row && !busy ? row.actions.map(action => ({ key: action, label: t(action === "accept" ? taskCopy.todoDone : action === "dismiss" ? taskCopy.todoDismiss : taskCopy.todoLater), icon: action === "accept" ? "check" : action === "dismiss" ? "x" : "clock", onSelect: () => decide(row.key, action) })) : []} />)}
        {view[all].more.map(source => <div key={source} className={styles.moveFoot}><Button label={t(todoSourceCopy[source])} loading={resource.paging[source] === "loading"} onClick={() => { void resource.loadMore(all, source); }} />{resource.paging[source] === "failed" ? <span role="alert" className={styles.note}>{t(taskCopy.todoUnavailable)}</span> : null}</div>)}
      </> : null}
    </Modal>
  </>;
}
