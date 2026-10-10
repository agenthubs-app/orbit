import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { PlanReviewScreen } from "../../../orbit-2026/plan/PlanReviewScreen";

export const dynamic = "force-dynamic";

// R25: 見直し (前提 → AI 修正 → 手動編集) inside the shell. `?draft=` names the review
// draft just opened; without it the page reads the plan's open review. Same path
// segments as the App (`app/plans/[planId]/review.tsx`, DESIGN §7).
export default async function PlanReviewPage({ params, searchParams }: { params: Promise<{ planId: string }>; searchParams?: Promise<{ draft?: string | string[] }> }) {
  const { planId } = await params;
  const query = await searchParams;
  const draft = typeof query?.draft === "string" && query.draft ? query.draft : null;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/plans/${encodeURIComponent(planId)}/review` })}`);
  return <PlanReviewScreen planId={planId} draftId={draft} />;
}
