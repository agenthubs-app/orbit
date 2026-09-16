import { AccountTopNav } from "../orbit-account-shell";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { TaskDetailWorkspace } from "./task-detail-workspace";
import { TasksPageHeading } from "./tasks-page-heading";
import { TasksStyles } from "./tasks-styles";
import { TasksWorkspace } from "./tasks-workspace";
import { RelationshipLifecycleTasksSection } from "./relationship-lifecycle-tasks-section";
import type { RelationshipLifecycleTaskReadModel } from "./relationship-lifecycle-tasks";

export function TasksPageContent({
  taskId,
  initialStatus = "open",
  relationshipTasks,
}: {
  taskId?: string;
  initialStatus?: "open" | "completed";
  relationshipTasks?: RelationshipLifecycleTaskReadModel;
}) {
  return <>
    <OrbitReferenceStyles />
    <TasksStyles />
    <main data-orbit-real-page="tasks">
      <AccountTopNav active="today" />
      <div className="orbit-task-page">
        <TasksPageHeading detail={taskId !== undefined} />
        {taskId !== undefined ? <TaskDetailWorkspace taskId={taskId} /> : <>
          <TasksWorkspace initialStatus={initialStatus} />
          {relationshipTasks ? <RelationshipLifecycleTasksSection model={relationshipTasks} /> : null}
        </>}
      </div>
    </main>
  </>;
}
