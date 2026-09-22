/**
 * 执行计划 route adapter — Orbit_0918 iOrbit plan 屏（设计 429–501）。
 *
 * 任务 5：视觉组件换成 iOrbit 壳下的 `iorbit-0918/iorbit-plan.tsx`；
 * 数据仍由客户端经既有通道加载（facts 快照 server action + 账本只读 API），
 * `plan-route-view-model.ts` 一行未改。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { IOrbitPlan } from "../iorbit-0918/iorbit-plan";

export const dynamic = "force-dynamic";

export default async function AgentPlanPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent%2Fplan");
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <IOrbitPlan />
    </>
  );
}
