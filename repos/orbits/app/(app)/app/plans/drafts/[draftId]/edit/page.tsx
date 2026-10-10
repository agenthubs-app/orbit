import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { PlanManualEditScreen } from "../../../../orbit-2026/plan/PlanManualEditScreen";

export const dynamic = "force-dynamic";

// R23: 手動編集 (once; saving confirms the plan) inside the shell. Same path
// segments as the App (`app/plans/drafts/[draftId]/edit.tsx`, DESIGN §7).
export default async function PlanDraftEditPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/plans/drafts/${encodeURIComponent(draftId)}/edit` })}`);
  return <PlanManualEditScreen draftId={draftId} />;
}
