import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { PlanDoneScreen } from "../../../orbit-2026/plan/PlanDoneScreen";

export const dynamic = "force-dynamic";

// R25: 目標達成 → 完了 → 次の目標 inside the shell. Same path segments as the App
// (`app/plans/[planId]/done.tsx`, DESIGN §7).
export default async function PlanDonePage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/plans/${encodeURIComponent(planId)}/done` })}`);
  return <PlanDoneScreen planId={planId} />;
}
