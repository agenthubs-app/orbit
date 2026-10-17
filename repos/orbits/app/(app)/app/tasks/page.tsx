import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { loadPlanSlot, planStartHref } from "./plan-slot";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { TaskContainer } from "../orbit-2026/task/TaskContainer";
import { taskTabFrom } from "../orbit-2026/task/task-tabs";
import { TodoTaskSlot } from "../orbit-2026/todo/TodoTaskSlot";
import type { LifecyclePageSearchParams } from "./lifecycle-pages-route-service";
import { PersonalScheduleWorkspace } from "./personal-schedule-workspace";
import { TasksPageContent } from "./tasks-page-content";
import { TasksStyles } from "./tasks-styles";

export const dynamic = "force-dynamic";

// R07: /app/tasks is the Task container — カレンダー / To-do / プラン / メモ (`?tab=`).
// R20a: To-do reads the new source aggregate. The explicit completed view stays
// on its existing task list until the independent SC-09 list replacement lands.
// Calendar is still the personal schedule during the staged rewrite. プラン is the
// plan v2 overview / goal input / 以前のプラン (`plan-slot.tsx`), read only when that
// tab is asked for: switching tabs on the client re-requests the page with ?tab=.
export default async function AppTasksPage({ searchParams }: { searchParams?: Promise<LifecyclePageSearchParams & { tab?: string; plan?: string; new?: string }> } = {}) {
  const params = await searchParams;
  const tab = taskTabFrom(params?.tab);
  const session = await auth();
  if (!session?.user?.id) {
    const continuation = new URLSearchParams();
    if (params?.tab) continuation.set("tab", tab);
    if (typeof params?.plan === "string") continuation.set("plan", params.plan);
    if (params?.new === "1") continuation.set("new", "1");
    if (params?.view === "completed") continuation.set("view", "completed");
    const next = `/app/tasks${continuation.size ? `?${continuation}` : ""}`;
    redirect(`/app/account/login?${new URLSearchParams({ next })}`);
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  // R25: `plan` picks the goal (after the switcher's `open`), `new=1` opens the goal input.
  const plan = tab === "plan" && actor ? await loadPlanSlot(actor, { newGoal: params?.new === "1", planId: typeof params?.plan === "string" ? params.plan : null }) : undefined;

  return <TaskContainer
    initialTab={tab}
    calendar={actor ? <><OrbitReferenceStyles /><TasksStyles /><main data-orbit-real-page="tasks"><div className="orbit-task-page"><PersonalScheduleWorkspace key={actor.id} actorId={actor.id} /></div></main></> : null}
    todo={params?.view === "completed" ? <TasksPageContent initialStatus="completed" /> : actor ? <TodoTaskSlot initialAdd={tab === "todo" && params?.new === "1"} /> : null}
    plan={plan}
    planStartHref={planStartHref()}
  />;
}
