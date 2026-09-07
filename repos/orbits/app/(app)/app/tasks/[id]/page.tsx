import { redirect } from "next/navigation";
import { auth } from "../../../../../auth";
import { TasksPageContent } from "../tasks-page-content";

export const dynamic = "force-dynamic";

export default async function AppTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Match the existing contact route: Next passes an encoded segment here.
  let taskId = id;
  try { taskId = decodeURIComponent(id); } catch { /* Preserve malformed input for the API's not-found response. */ }
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/app/account/login?${new URLSearchParams({ next: `/app/tasks/${encodeURIComponent(taskId)}` })}`);
  }
  return <TasksPageContent taskId={taskId} />;
}
