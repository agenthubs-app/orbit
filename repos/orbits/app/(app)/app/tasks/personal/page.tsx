import { redirect } from "next/navigation";

// Existing bookmarks use the Task calendar, which owns auth and actor scoping.
export default function PersonalSchedulePage() {
  redirect("/app/tasks?tab=calendar");
}
