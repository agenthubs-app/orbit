/**
 * 建议与行动 route adapter — Orbit_0918 iOrbit actions 屏（设计 349–426）。
 *
 * 任务 5：视觉组件换成 iOrbit 壳下的 `iorbit-0918/iorbit-actions.tsx`
 * （作用域 `agent` + `iorbit-0918`，顶栏由 `IOrbitScreenFrame` 挂）；
 * 数据仍由 `actions-route-view-model.ts` 组装，数据层一行未改。
 * 语言不再由路由下发：新屏走 `useOrbitLanguage()`（layout 的 provider 提供）。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAgentLedgerForServerPage } from "../../../../api/_shared/agent-request-context";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { IOrbitActions } from "../iorbit-0918/iorbit-actions";
import {
  loadAgentActionsRouteViewModel,
  type AgentActionsSearchParams,
} from "./actions-route-view-model";

export const dynamic = "force-dynamic";

export default async function AgentActionsPage({
  searchParams,
}: {
  searchParams?: Promise<AgentActionsSearchParams>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent%2Factions");
  }
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }

  const ledgerService = await resolveAgentLedgerForServerPage(undefined, {
    authenticate: async () => session,
  });
  const viewModel = await loadAgentActionsRouteViewModel(
    await searchParams,
    { ledgerService },
  );

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <IOrbitActions viewModel={viewModel} />
    </>
  );
}
