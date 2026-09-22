/**
 * 工作策略 / 联系人建议 route adapter — Orbit_0918 iOrbit strategy + contacts 两屏。
 *
 * 「审阅修订」3：设计的 contacts 屏（663–782）= `/app/agent/strategy?view=contacts`，
 * 不是并进 strategy——两屏面包屑 / H1 / 内容块都不同。
 * 数据仍由客户端经既有 facts 快照 server action 加载，
 * `strategy-route-view-model.ts` 一行未改。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { iorbitStrategyView } from "../iorbit-0918/iorbit-model";
import { IOrbitStrategy } from "../iorbit-0918/iorbit-strategy";

export const dynamic = "force-dynamic";

export interface AgentStrategySearchParams {
  view?: string | string[];
}

export default async function AgentStrategyPage({
  searchParams,
}: {
  searchParams?: Promise<AgentStrategySearchParams>;
} = {}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app/account/login?next=%2Fapp%2Fagent%2Fstrategy");
  }
  // 合并前终审 7：与 `/app/agent`、`/app/agent/actions`、`/app/agent/plan` 同口径。
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) {
    throw new Error("Authenticated Orbit account membership is unavailable.");
  }
  const resolved = await searchParams;

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <IOrbitStrategy view={iorbitStrategyView(resolved?.view)} />
    </>
  );
}
