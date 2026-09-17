"use client";

import { useOrbitLanguage } from "../orbit-language-context";
import { taskTimeLabel } from "./tasks-view-model";
import type {
  RelationshipLifecycleTaskReadModel,
  RelationshipLifecycleTaskView,
} from "./relationship-lifecycle-tasks";

function statusLabel(
  status: RelationshipLifecycleTaskView["status"],
  english: boolean,
): string {
  const labels: Record<RelationshipLifecycleTaskView["status"], [string, string]> = {
    open: ["待处理", "Open"],
    scheduled: ["已安排", "Scheduled"],
    completed: ["已完成", "Completed"],
    dismissed: ["已忽略", "Dismissed"],
  };

  return labels[status][english ? 1 : 0];
}

function relationshipStageLabel(
  stage: RelationshipLifecycleTaskView["relationshipStage"],
  english: boolean,
): string | null {
  if (!stage) return null;

  const labels: Record<NonNullable<RelationshipLifecycleTaskView["relationshipStage"]>, [string, string]> = {
    captured: ["已记录", "Captured"],
    reviewing: ["复核中", "Reviewing"],
    active: ["进行中", "Active"],
    needs_follow_up: ["需要跟进", "Needs follow-up"],
    nurture: ["培育中", "Nurture"],
    archived: ["已归档", "Archived"],
  };

  return labels[stage][english ? 1 : 0];
}

function RelationshipLifecycleTaskRow({
  task,
}: {
  task: RelationshipLifecycleTaskView;
}) {
  const { language, preserveHref, t } = useOrbitLanguage();
  const english = language !== "zh";
  const stage = relationshipStageLabel(task.relationshipStage, english);

  return <li className="relationship-lifecycle-task-row">
    <div className="relationship-lifecycle-task-copy">
      <strong>{task.title}</strong>
      <span className="task-meta">
        {task.contactName}{task.organization ? ` · ${task.organization}` : ""}
      </span>
      <span className="task-meta">
        {statusLabel(task.status, english)} · {t({ zh: "到期", en: "Due" })} {taskTimeLabel(task.dueAt, english)}
        {stage ? ` · ${stage}` : ""}
      </span>
    </div>
    {task.connectionId && !task.issue && (task.status === "open" || task.status === "scheduled") ? <a className="btn btn-primary btn-sm" href={preserveHref(`/app/tasks/relationship/${encodeURIComponent(task.connectionId)}`)}>{t({ zh: "处理跟进", en: "Resolve follow-up" })}</a> : null}
    {task.operationHref ? <a className="btn btn-ghost btn-sm relationship-lifecycle-task-link" href={preserveHref(task.operationHref)}>
      {t({ zh: "查看联系人", en: "View contact" })}
    </a> : <span className="relationship-lifecycle-task-unavailable">
      {t({ zh: "未关联，暂不可查看", en: "Unlinked; unavailable" })}
    </span>}
  </li>;
}

function TaskGroup({
  items,
  label,
}: {
  items: readonly RelationshipLifecycleTaskView[];
  label: string;
}) {
  return <>
    <h3 className="relationship-lifecycle-task-group-heading">{label}</h3>
    {items.length ? <ul className="relationship-lifecycle-task-rows">
      {items.map((task) => <RelationshipLifecycleTaskRow key={task.id} task={task} />)}
    </ul> : <p className="task-empty">暂无记录。</p>}
  </>;
}

export function RelationshipLifecycleTasksSection({
  model,
}: {
  model: RelationshipLifecycleTaskReadModel;
}) {
  const { t } = useOrbitLanguage();

  return <section className="relationship-lifecycle-tasks" aria-label={t({ zh: "人脉跟进", en: "Relationship follow-ups" })}>
    <header className="relationship-lifecycle-task-heading">
      <div>
        <h2>{t({ zh: "人脉跟进", en: "Relationship follow-ups" })}</h2>
        <p className="task-meta">
          {t({
            zh: "处理跟进时确认关系下一步；普通待办的完成不会改写人脉关系。",
            en: "Resolve a follow-up with an explicit next step for the relationship.",
          })}
        </p>
      </div>
    </header>

    {model.state === "unavailable" ? <p className="task-empty">
      {t({ zh: "人脉跟进暂不可用。", en: "Relationship follow-ups are unavailable." })}
    </p> : <>
      <TaskGroup
        items={model.currentTasks}
        label={t({ zh: `当前跟进（${model.currentCount}）`, en: `Current follow-ups (${model.currentCount})` })}
      />
      {model.historyCount > 0 ? <details className="relationship-lifecycle-task-history" open={model.currentCount === 0}>
        <summary>{t({ zh: `历史跟进（${model.historyCount}）`, en: `Follow-up history (${model.historyCount})` })}</summary>
        <TaskGroup
          items={model.historyTasks}
          label={t({ zh: "已完成/已忽略", en: "Completed / dismissed" })}
        />
      </details> : null}
      {model.orphanCount > 0 ? <section className="relationship-lifecycle-task-orphans" aria-label={t({ zh: "无法关联的人脉跟进", en: "Unlinked relationship follow-ups" })}>
        <h3 className="relationship-lifecycle-task-group-heading">{t({ zh: `无法关联（${model.orphanCount}）`, en: `Unlinked (${model.orphanCount})` })}</h3>
        <ul className="relationship-lifecycle-task-rows">
          {model.orphanTasks.map((task) => <RelationshipLifecycleTaskRow key={task.id} task={task} />)}
        </ul>
      </section> : null}
    </>}
  </section>;
}
