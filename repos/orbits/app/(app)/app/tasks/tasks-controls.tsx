"use client";

import { useRef, useState } from "react";
import { useOrbitLanguage } from "../orbit-language-context";
import { tasksErrorMessage } from "./tasks-client";
import { taskCategoryLabel, taskTimeLabel, type TaskSuggestionView, type TaskView } from "./tasks-view-model";

export function TasksFeedback({ error, message }: { error: unknown; message?: string }) {
  const { language } = useOrbitLanguage();
  return <>
    {error ? <p className="task-error" role="alert">{tasksErrorMessage(error, language !== "zh")}</p> : null}
    {message ? <p className="task-success" role="status">{message}</p> : null}
  </>;
}

export function TasksReadError({ error, hasData, onRetry }: { error: unknown; hasData: boolean; onRetry: () => void }) {
  const { t } = useOrbitLanguage();
  if (!error) return null;
  return <div className="task-read-error">
    {hasData ? <p>{t({ zh: "刷新未完成，当前仍显示上次读取的内容。", en: "Refresh failed. Previously loaded data is still shown." })}</p> : null}
    <TasksFeedback error={error} />
    <button className="btn btn-ghost btn-sm" onClick={onRetry} type="button">{t({ zh: "重试", en: "Retry" })}</button>
  </div>;
}

export function TaskComposer({ busy, onCreate }: { busy: boolean; onCreate: (title: string) => Promise<boolean> }) {
  const { t } = useOrbitLanguage();
  const [draft, setDraft] = useState("");
  const pending = useRef(false);
  return <form aria-label={t({ zh: "新增待办表单", en: "New task form" })} className="task-composer" onSubmit={async (event) => {
    event.preventDefault();
    if (pending.current || busy || !draft.trim()) return;
    pending.current = true;
    try { if (await onCreate(draft)) setDraft(""); }
    finally { pending.current = false; }
  }}>
    <input aria-label={t({ zh: "添加待办", en: "Add a task" })} disabled={busy} maxLength={300} onChange={(event) => setDraft(event.target.value)} placeholder={t({ zh: "添加待办", en: "Add a task" })} value={draft} />
    <button className="btn btn-primary" disabled={busy || !draft.trim()} type="submit">{t({ zh: "添加", en: "Add" })}</button>
  </form>;
}

export function TaskRows({ items, busy, onToggle }: { items: readonly TaskView[]; busy: boolean; onToggle: (task: TaskView) => void }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const english = language !== "zh";
  return <ul className="task-rows">
    {items.map((task) => <li key={task.id}>
      <input aria-label={`${task.status === "completed" ? t({ zh: "恢复", en: "Reopen" }) : t({ zh: "完成", en: "Complete" })}：${task.title}`} checked={task.status === "completed"} disabled={busy} onChange={() => onToggle(task)} type="checkbox" />
      <a className={`task-row-copy${task.status === "completed" ? " task-done" : ""}`} href={preserveHref(task.href)}>
        <span className="task-row-title">{task.title}</span>
        <span className="task-meta">{taskCategoryLabel(task.category, english)} · {taskTimeLabel(task.dueAt ?? task.plannedDate, english)}</span>
      </a>
      <span aria-hidden="true" className="task-chevron">›</span>
    </li>)}
  </ul>;
}

export function TaskSuggestions({ items, busy, onResolve }: { items: readonly TaskSuggestionView[]; busy: boolean; onResolve: (id: string, action: "accept" | "dismiss") => void }) {
  const { t } = useOrbitLanguage();
  if (!items.length) return null;
  return <section className="task-suggestions" aria-label={t({ zh: "待办建议", en: "Task suggestions" })}>
    <h2>{t({ zh: "Orbit 建议", en: "Orbit suggestions" })}</h2>
    {items.map((item) => <article key={item.id}>
      <h3>{item.title}</h3><p className="task-meta">{item.reason}</p>
      <div className="task-actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onResolve(item.id, "accept")} type="button">{t({ zh: "加入待办", en: "Add to tasks" })}</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onResolve(item.id, "dismiss")} type="button">{t({ zh: "忽略", en: "Dismiss" })}</button>
      </div>
    </article>)}
  </section>;
}
