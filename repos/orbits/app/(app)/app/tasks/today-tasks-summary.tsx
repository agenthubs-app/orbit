"use client";

import { useMemo } from "react";
import { useOrbitLanguage } from "../orbit-language-context";
import { createTasksClient } from "./tasks-client";
import { TaskComposer, TaskRows, TaskSuggestions, TasksFeedback, TasksReadError } from "./tasks-controls";
import { useTasksMutation, useTasksResource } from "./tasks-hooks";
import { TasksStyles } from "./tasks-styles";

export function TodayTasksSummary() {
  const { t, preserveHref } = useOrbitLanguage();
  const client = useMemo(() => createTasksClient(), []);
  const resource = useTasksResource(() => client.loadToday(), "today");
  const mutation = useTasksMutation();
  return <section aria-label={t({ zh: "今天的待办", en: "Today's tasks" })} className="orbit-tasks task-summary">
    <TasksStyles />
    <header className="task-toolbar"><h2>{t({ zh: "待办", en: "Tasks" })}{resource.data ? <span className="task-count">{resource.data.count}</span> : null}</h2><a className="btn btn-ghost btn-sm" href={preserveHref("/app/tasks")}>{t({ zh: "全部待办", en: "All tasks" })}</a></header>
    <TaskComposer busy={mutation.busy} onCreate={(title) => mutation.run(() => client.create(title), resource.refresh, t({ zh: "待办已添加", en: "Task added" }))} />
    <TasksFeedback error={mutation.error} message={mutation.message} />
    <TasksReadError error={resource.error} hasData={!!resource.data} onRetry={resource.refresh} />
    {resource.loading && !resource.data ? <p className="task-meta" role="status">{t({ zh: "正在读取待办…", en: "Loading tasks…" })}</p> : null}
    {resource.data ? <>
      {!resource.data.tasks.length ? <p className="task-meta">{t({ zh: "今天暂无待办", en: "No tasks planned for today" })}</p> : null}
      <TaskRows items={resource.data.tasks.slice(0, 3)} busy={mutation.busy} onToggle={(task) => {
        void mutation.run(() => client.setCompleted(task.id, true), resource.refresh, t({ zh: "已完成待办", en: "Task completed" }));
      }} />
      <TaskSuggestions items={resource.data.suggestions.slice(0, 2)} busy={mutation.busy} onResolve={(id, action) => {
        void mutation.run(() => client.resolveSuggestion(id, action), resource.refresh, action === "accept" ? t({ zh: "建议已加入待办", en: "Suggestion added to tasks" }) : t({ zh: "已忽略建议", en: "Suggestion dismissed" }));
      }} />
    </> : null}
  </section>;
}
