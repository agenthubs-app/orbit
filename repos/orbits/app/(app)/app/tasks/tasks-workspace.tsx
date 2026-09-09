"use client";

import { useMemo, useState } from "react";
import { useOrbitLanguage } from "../orbit-language-context";
import { createTasksClient } from "./tasks-client";
import { TaskComposer, TaskRows, TaskSuggestions, TasksFeedback, TasksReadError } from "./tasks-controls";
import { useTasksMutation, useTasksResource } from "./tasks-hooks";

export function TasksWorkspace({ initialStatus = "open" }: { initialStatus?: "open" | "completed" } = {}) {
  const { t } = useOrbitLanguage();
  const client = useMemo(() => createTasksClient(), []);
  const [status, setStatus] = useState(initialStatus);
  const [query, setQuery] = useState("");
  const tasks = useTasksResource(() => client.loadList(status), status);
  const suggestions = useTasksResource(() => client.loadSuggestions(), "suggestions");
  const mutation = useTasksMutation();
  const visible = tasks.data?.filter((task) => `${task.title} ${task.notes}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) ?? [];
  const refresh = () => { tasks.refresh(); suggestions.refresh(); };

  return <section className="orbit-tasks" aria-label={t({ zh: "待办事项", en: "Tasks" })}>
    <div className="task-toolbar">
      <div className="task-tabs" role="group" aria-label={t({ zh: "待办状态", en: "Task status" })}>
        <button aria-label={t({ zh: "查看待办", en: "View open tasks" })} aria-pressed={status === "open"} className="btn btn-ghost" onClick={() => setStatus("open")} type="button">{t({ zh: "待办", en: "Open" })}</button>
        <button aria-label={t({ zh: "查看已完成待办", en: "View completed tasks" })} aria-pressed={status === "completed"} className="btn btn-ghost" onClick={() => setStatus("completed")} type="button">{t({ zh: "已完成", en: "Completed" })}</button>
      </div>
      <button className="btn btn-ghost btn-sm" disabled={tasks.loading || mutation.busy} onClick={refresh} type="button">{t({ zh: "刷新", en: "Refresh" })}</button>
    </div>
    <TaskComposer busy={mutation.busy} onCreate={(title) => mutation.run(() => client.create(title), () => { setStatus("open"); setQuery(""); refresh(); }, t({ zh: "待办已添加", en: "Task added" }))} />
    <label className="task-search">{t({ zh: "搜索待办", en: "Search tasks" })}<input onChange={(event) => setQuery(event.target.value)} type="search" value={query} /></label>
    <TasksFeedback error={mutation.error} message={mutation.message} />
    <TasksReadError error={tasks.error} hasData={!!tasks.data} onRetry={tasks.refresh} />
    {tasks.loading && !tasks.data ? <p role="status">{t({ zh: "正在读取待办…", en: "Loading tasks…" })}</p> : null}
    {tasks.data && !visible.length ? <p className="task-empty">{query.trim() ? t({ zh: "没有匹配的待办", en: "No matching tasks" }) : status === "open" ? t({ zh: "暂无待办，可以在上方添加。", en: "No open tasks. Add one above." }) : t({ zh: "暂无完成记录", en: "No completed tasks yet" })}</p> : null}
    <TaskRows items={visible} busy={mutation.busy} onToggle={(task) => {
      void mutation.run(() => client.setCompleted(task.id, task.status !== "completed"), refresh,
        task.status === "completed" ? t({ zh: "已恢复待办", en: "Task reopened" }) : t({ zh: "已完成待办", en: "Task completed" }));
    }} />
    {status === "open" ? <>
      <TasksReadError error={suggestions.error} hasData={!!suggestions.data} onRetry={suggestions.refresh} />
      <TaskSuggestions items={suggestions.data ?? []} busy={mutation.busy} onResolve={(id, action) => {
        void mutation.run(() => client.resolveSuggestion(id, action), refresh, action === "accept" ? t({ zh: "建议已加入待办", en: "Suggestion added to tasks" }) : t({ zh: "已忽略建议", en: "Suggestion dismissed" }));
      }} />
    </> : null}
  </section>;
}
