import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { loadPlanSlot, planStartHref } from "../agent/plan/plan-slot";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { TaskContainer } from "../orbit-2026/task/TaskContainer";
import { taskTabFrom } from "../orbit-2026/task/task-tabs";
import { loadLifecycleTaskPages, type LifecyclePageSearchParams } from "./lifecycle-pages-route-service";
import { PersonalScheduleWorkspace } from "./personal-schedule-workspace";
import { TasksPageContent } from "./tasks-page-content";
import { TasksStyles } from "./tasks-styles";

export const dynamic = "force-dynamic";

// R07: /app/tasks is the Task container — カレンダー / To-do / プラン / メモ (`?tab=`).
// The To-do slot is the existing To-do page, the calendar slot the existing
// personal schedule (still also at /app/tasks/personal). The プラン slot is the
// existing plan screen (product decision (a), R07 review M5), read only when that
// tab is asked for: switching tabs on the client re-requests the page with ?tab=.
export default async function AppTasksPage({ searchParams }: { searchParams?: Promise<LifecyclePageSearchParams & { tab?: string; plan?: string; new?: string }> } = {}) {
  const params = await searchParams;
  const tab = taskTabFrom(params?.tab);
  const session = await auth();
  if (!session?.user?.id) {
    const next = params?.view === "completed" ? "/app/tasks?view=completed" : params?.tab ? `/app/tasks?tab=${tab}` : "/app/tasks";
    redirect(`/app/account/login?${new URLSearchParams({ next })}`);
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  const relationshipTasks = await loadLifecycleTaskPages({ actorId: actor?.id ?? "", params });
  // R25: `plan` picks the goal (after the switcher's `open`), `new=1` opens the goal input.
  const plan = tab === "plan" && actor ? await loadPlanSlot(actor, session.user.id, { newGoal: params?.new === "1", planId: typeof params?.plan === "string" ? params.plan : null }) : undefined;

  return <TaskContainer
    initialTab={tab}
    calendar={actor ? <><OrbitReferenceStyles /><TasksStyles /><main data-orbit-real-page="tasks"><div className="orbit-task-page"><PersonalScheduleWorkspace key={actor.id} actorId={actor.id} /></div></main></> : null}
    todo={<TasksPageContent initialStatus={params?.view === "completed" ? "completed" : "open"} relationshipTasks={relationshipTasks} />}
    plan={plan}
    planStartHref={planStartHref()}
  />;
}
