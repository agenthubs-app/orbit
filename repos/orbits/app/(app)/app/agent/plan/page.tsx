/**
 * R07: the plan lives in the Task page's プラン segment, which shows the existing plan
 * screen (product decision (a), R07 review M5; composed by `plan-slot.tsx`). This
 * address stays as the compatibility redirect for old links, bookmarks, login
 * returns and the hrefs the server already produces; the browser keeps a
 * `#plan-action-…` fragment across the redirect and the slot scrolls to it.
 */
import { redirect } from "next/navigation";

export default function AppAgentPlanPage() {
  redirect("/app/tasks?tab=plan");
}
