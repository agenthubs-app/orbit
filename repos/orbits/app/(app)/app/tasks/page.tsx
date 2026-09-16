import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { loadRelationshipLifecycleTasks } from "./relationship-lifecycle-tasks";
import { TasksPageContent } from "./tasks-page-content";

export const dynamic = "force-dynamic";

export default async function AppTasksPage({ searchParams }: { searchParams?: Promise<{ view?: string }> } = {}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user?.id) {
    const next = params?.view === "completed" ? "/app/tasks?view=completed" : "/app/tasks";
    redirect(`/app/account/login?${new URLSearchParams({ next })}`);
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  const relationshipTasks = await loadRelationshipLifecycleTasks({
    actorId: actor?.id ?? "",
  });

  return <TasksPageContent
    initialStatus={params?.view === "completed" ? "completed" : "open"}
    relationshipTasks={relationshipTasks}
  />;
}
