/**
 * 执行计划 route adapter — Orbit_0918 iOrbit plan 屏（设计 429–501）。
 *
 * 任务 5：视觉组件换成 iOrbit 壳下的 `iorbit-0918/iorbit-plan.tsx`；
 * 数据仍由客户端经既有通道加载（facts 快照 server action + 账本只读 API），
 * `plan-route-view-model.ts` 一行未改。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { IOrbitPlan } from "../iorbit-0918/iorbit-plan";

export const dynamic = "force-dynamic";

export default async function AgentPlanPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent%2Fplan");
  }
  // 合并前终审 7：四条 iOrbit 路由的门禁口径统一。`session.user.id` 只说明登录过，
  // `/app/agent` 与 `/app/agent/actions` 还额外要求解析得出 Orbit 账号成员身份；
  // 这两条兄弟屏读的是同一批账户数据，门禁不能更松。
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <IOrbitPlan />
    </>
  );
}
