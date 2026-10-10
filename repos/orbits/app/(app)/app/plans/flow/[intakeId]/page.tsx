import { redirect } from "next/navigation";

import { auth } from "../../../../../../auth";
import { PlanFlowScreen } from "../../../orbit-2026/plan/PlanFlowScreen";

export const dynamic = "force-dynamic";

// R23: the plan generation flow (背景 → ≤5 問 → 前提 → 初版 → AI 修正) inside the shell.
// Same path segments as the App (`app/plans/flow/[intakeId].tsx`, DESIGN §7).
export default async function PlanFlowPage({ params }: { params: Promise<{ intakeId: string }> }) {
  const { intakeId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/app/account/login?${new URLSearchParams({ next: `/app/plans/flow/${encodeURIComponent(intakeId)}` })}`);
  return <PlanFlowScreen intakeId={intakeId} />;
}
