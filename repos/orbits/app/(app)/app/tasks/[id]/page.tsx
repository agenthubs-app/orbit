import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Match the existing contact route: Next passes an encoded segment here.
  let taskId = id;
  try { taskId = decodeURIComponent(id); } catch { /* Preserve malformed input for the API's not-found response. */ }
  redirect(`/app/tasks?${new URLSearchParams({ tab: "todo", view: "all", task: taskId })}`);
}
