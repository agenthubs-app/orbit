import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { PlanLegacyScreen } from "../../../orbit-2026/plan/PlanLegacy";

export const dynamic = "force-dynamic";

// R25: 以前のプラン (v1, read only — no edit, no re-analysis) inside the shell. Same
// path segments as the App (`app/plans/legacy/[planId].tsx`, DESIGN §7).
export default async function PlanLegacyPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/plans/legacy/${encodeURIComponent(planId)}` })}`);
  return <PlanLegacyScreen planId={planId} />;
}
