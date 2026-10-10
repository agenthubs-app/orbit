/**
 * R07: the plan now lives in the Task page's プラン segment (RD-20). Old links,
 * bookmarks and login returns to /app/agent/plan land there. The plan pieces this
 * page used to compose (`iorbit-plan.tsx`, `read-current-plan.ts`) stay for R25.
 */
import { redirect } from "next/navigation";

export default function AppAgentPlanPage() {
  redirect("/app/tasks?tab=plan");
}
