"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrbitLanguage } from "../orbit-language-context";
import { createTasksClient } from "./tasks-client";
import { TasksFeedback, TasksReadError } from "./tasks-controls";
import { useTasksMutation, useTasksResource } from "./tasks-hooks";
import { taskActivityLabel, taskCategoryLabel, taskTimeLabel, type TaskView } from "./tasks-view-model";

export function TaskDetailWorkspace({ taskId }: { taskId: string }) {
  return <TaskDetail key={taskId} taskId={taskId} />;
}

function TaskDetail({ taskId }: { taskId: string }) {
  const { t, language, preserveHref } = useOrbitLanguage();
  const english = language !== "zh";
  const client = useMemo(() => createTasksClient(), []);
  const task = useTasksResource(() => client.loadTask(taskId), taskId);
  const reminders = useTasksResource(() => client.loadReminders(taskId), taskId);
  const activities = useTasksResource(() => client.loadActivities(taskId), taskId);
  const mutation = useTasksMutation();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [baseline, setBaseline] = useState<TaskView | null>(null);
  useEffect(() => {
    if (task.data && (!baseline || (title === baseline.title && notes === baseline.notes))) {
      setBaseline(task.data);
      setTitle(task.data.title);
      setNotes(task.data.notes);
    }
  }, [task.data, baseline, title, notes]);
  const staleDraft = !!baseline && !!task.data && baseline.updatedAt !== task.data.updatedAt;
  const refresh = () => { task.refresh(); activities.refresh(); reminders.refresh(); };
  const back = <a className="btn btn-ghost" href={preserveHref("/app/tasks")}>{t({ zh: "全部待办", en: "All tasks" })}</a>;

  if (deleted) return <section className="orbit-tasks"><p role="status">{t({ zh: "待办已删除", en: "Task deleted" })}</p>{back}</section>;

  return <section className="orbit-tasks">
    <div className="task-toolbar">{back}<button className="btn btn-ghost btn-sm" disabled={task.loading || mutation.busy} onClick={refresh} type="button">{t({ zh: "刷新", en: "Refresh" })}</button></div>
    <TasksReadError error={task.error} hasData={!!task.data} onRetry={refresh} />
    {task.loading && !task.data ? <p role="status">{t({ zh: "正在读取待办…", en: "Loading task…" })}</p> : null}
    {task.data ? <>
      <div className="task-detail-grid">
        <div>
          <p className="task-meta">{task.data.status === "completed" ? t({ zh: "已完成", en: "Completed" }) : task.data.status === "cancelled" ? t({ zh: "已取消", en: "Cancelled" }) : t({ zh: "待办", en: "Open" })}</p>
          <form aria-label={t({ zh: "编辑待办表单", en: "Edit task form" })} className="task-editor" onSubmit={async (event) => {
            event.preventDefault();
            await mutation.run(() => client.update(baseline!, title, notes), (updated) => {
              task.replace(updated); setBaseline(updated); setTitle(updated.title); setNotes(updated.notes); activities.refresh();
            }, t({ zh: "已保存修改", en: "Changes saved" }));
          }}>
            <label>{t({ zh: "标题", en: "Title" })}<textarea aria-label={t({ zh: "待办标题", en: "Task title" })} className="task-title-input" disabled={mutation.busy} maxLength={300} onChange={(event) => setTitle(event.target.value)} rows={2} value={title} /></label>
            <label>{t({ zh: "备注", en: "Notes" })}<textarea aria-label={t({ zh: "备注", en: "Notes" })} disabled={mutation.busy} onChange={(event) => setNotes(event.target.value)} placeholder={t({ zh: "写一点备注", en: "Add a note" })} rows={5} value={notes} /></label>
            <div className="task-actions"><button className="btn btn-primary" disabled={mutation.busy || !baseline || staleDraft || !title.trim() || (title === baseline.title && notes === baseline.notes)} type="submit">{t({ zh: "保存修改", en: "Save changes" })}</button></div>
          </form>
          {staleDraft ? <div role="alert"><p>{t({ zh: "这条待办已有新版本，草稿已保留。请复制需要保留的内容，再载入最新版本。", en: "This task has a newer version. Your draft is kept. Copy any edits you need before loading the latest version." })}</p><button className="btn btn-ghost btn-sm" disabled={mutation.busy} onClick={() => { setBaseline(task.data); setTitle(task.data!.title); setNotes(task.data!.notes); }} type="button">{t({ zh: "放弃草稿并载入最新内容", en: "Discard draft and load latest" })}</button></div> : null}
          <TasksFeedback error={mutation.error} message={mutation.message} />
          <div className="task-actions task-detail-actions">
            {task.data.status !== "cancelled" ? <button aria-label={task.data.status === "completed" ? t({ zh: "恢复待办", en: "Reopen task" }) : t({ zh: "标记完成", en: "Mark complete" })} className="btn btn-ghost" disabled={mutation.busy} onClick={() => mutation.run(
              () => client.setCompleted(taskId, task.data!.status !== "completed"), (updated) => { task.replace(updated); refresh(); },
              task.data!.status === "completed" ? t({ zh: "已恢复待办", en: "Task reopened" }) : t({ zh: "已完成待办", en: "Task completed" }),
            )} type="button">{task.data.status === "completed" ? t({ zh: "恢复待办", en: "Reopen task" }) : t({ zh: "标记完成", en: "Mark complete" })}</button> : null}
            {!confirmDelete ? <button aria-label={t({ zh: "删除待办", en: "Delete task" })} className="btn btn-ghost task-danger" disabled={mutation.busy} onClick={() => setConfirmDelete(true)} type="button">{t({ zh: "删除", en: "Delete" })}</button> : null}
          </div>
          {confirmDelete ? <div className="task-delete-confirm" role="group" aria-label={t({ zh: "删除确认", en: "Confirm deletion" })}>
            <p>{t({ zh: "删除这条待办？它将从待办列表中移除。", en: "Delete this task? It will be removed from your task list." })}</p>
            <div className="task-actions">
              <button aria-label={t({ zh: "保留待办", en: "Keep task" })} className="btn btn-ghost" disabled={mutation.busy} onClick={() => setConfirmDelete(false)} type="button">{t({ zh: "保留", en: "Keep" })}</button>
              <button aria-label={t({ zh: "确认删除待办", en: "Confirm delete task" })} className="btn btn-ghost task-danger" disabled={mutation.busy} onClick={() => mutation.run(() => client.remove(taskId), () => setDeleted(true), "")} type="button">{t({ zh: "确认删除", en: "Delete task" })}</button>
            </div>
          </div> : null}
        </div>
        <aside className="task-details" aria-label={t({ zh: "待办信息", en: "Task information" })}>
          <dl><dt>{t({ zh: "安排", en: "Planned for" })}</dt><dd>{taskTimeLabel(task.data.dueAt ?? task.data.plannedDate, english)}</dd><dt>{t({ zh: "分类", en: "Category" })}</dt><dd>{taskCategoryLabel(task.data.category, english)}</dd></dl>
          <section><h2>{t({ zh: "提醒", en: "Reminders" })}</h2>
            <p className="task-meta">{t({ zh: "网页设置站内提醒；不代表已开启手机推送。", en: "Web reminders appear in Orbit. They do not enable phone push notifications." })}</p>
            <TasksReadError error={reminders.error} hasData={!!reminders.data} onRetry={reminders.refresh} />
            {reminders.data?.length === 0 ? <p className="task-meta">{t({ zh: "未设置提醒", en: "No reminders set" })}</p> : null}
            <ul className="task-reminders">{reminders.data?.map((reminder) => <li key={reminder.id}><span>{taskTimeLabel(reminder.fireAt, english)}</span><button className="btn btn-ghost btn-sm" disabled={mutation.busy} onClick={() => mutation.run(() => client.cancelReminder(reminder.id), reminders.refresh, t({ zh: "提醒已取消", en: "Reminder cancelled" }))} type="button">{t({ zh: "取消", en: "Cancel" })}</button></li>)}</ul>
            {task.data.status === "open" ? <button className="btn btn-ghost btn-sm" disabled={mutation.busy} onClick={() => mutation.run(() => client.addReminder(task.data!), reminders.refresh, t({ zh: "已设置 1 小时后的站内提醒", en: "In-app reminder set for one hour from now" }))} type="button">{t({ zh: "1 小时后提醒", en: "Remind me in 1 hour" })}</button> : null}
          </section>
          <section><h2>{t({ zh: "变更历史", en: "Activity" })}</h2>
            <TasksReadError error={activities.error} hasData={!!activities.data} onRetry={activities.refresh} />
            {activities.data?.length === 0 ? <p className="task-meta">{t({ zh: "暂无变更记录", en: "No activity yet" })}</p> : null}
            <ol className="task-history">{activities.data?.slice(0, 10).map((activity) => <li key={activity.id}><span>{taskActivityLabel(activity.type, english)}</span><time dateTime={activity.occurredAt}>{taskTimeLabel(activity.occurredAt, english)}</time></li>)}</ol>
          </section>
        </aside>
      </div>
    </> : null}
  </section>;
}
