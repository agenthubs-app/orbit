import { redirect } from "next/navigation";

import { auth } from "../../../../../../../auth";
import { PlanTypeDetailScreen } from "../../../../orbit-2026/plan/PlanTypeDetailScreen";

export const dynamic = "force-dynamic";

// R24: 人物タイプ詳細 inside the shell (back → Task › プラン). Same path segments as the
// App (`app/plans/[planId]/types/[itemId].tsx`, DESIGN §7).
export default async function PlanTypeDetailPage({ params }: { params: Promise<{ planId: string; itemId: string }> }) {
  const { planId, itemId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/plans/${encodeURIComponent(planId)}/types/${encodeURIComponent(itemId)}` })}`);
  return <PlanTypeDetailScreen planId={planId} itemId={itemId} />;
}
