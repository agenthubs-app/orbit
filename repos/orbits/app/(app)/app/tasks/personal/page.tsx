import { redirect } from "next/navigation";
import { auth } from "../../../../../auth";
import { AccountTopNav } from "../../orbit-account-shell";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { TasksStyles } from "../tasks-styles";
import { PersonalScheduleWorkspace } from "../personal-schedule-workspace";
export const dynamic = "force-dynamic";
export default async function PersonalSchedulePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Ftasks%2Fpersonal");
  return <><OrbitReferenceStyles /><TasksStyles /><main data-orbit-real-page="tasks"><AccountTopNav active="today" /><div className="orbit-task-page"><a href="/app/tasks">返回待办</a><h1>个人日程</h1><PersonalScheduleWorkspace key={session.user.id} actorId={session.user.id} /></div></main></>;
}
