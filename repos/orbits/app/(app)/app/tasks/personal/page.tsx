import { redirect } from "next/navigation";
import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { AccountTopNav } from "../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { TasksStyles } from "../tasks-styles";
import { PersonalScheduleWorkspace } from "../personal-schedule-workspace";
export const dynamic = "force-dynamic";
export default async function PersonalSchedulePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Ftasks%2Fpersonal");
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }
  return <><OrbitReferenceStyles /><TasksStyles /><main data-orbit-real-page="tasks"><AccountTopNav active="today" /><div className="orbit-task-page"><a href="/app/tasks">返回待办</a><h1>个人日程</h1><PersonalScheduleWorkspace key={actor.id} actorId={actor.id} /></div></main></>;
}
