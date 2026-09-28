/**
 * 「我的计划」route adapter（`/app/agent/plan`，RW-10，Sprint W0009）。
 *
 * 服务端以本人身份读当前生效计划（W0007 `PlanService.getCurrent()`）作为首帧交给
 * `iorbit-0918/iorbit-plan.tsx`；读不到时显示「暂时读不到」，不伪造内容。打勾与手动记录
 * 由客户端走 W0007 的接口。引导开关（`ORBIT_GUIDE_DEMO`）决定无计划时的落点：
 * 打开 → `/app/start`（第 3 步生成计划），关闭 → `/app/agent`。
 *
 * 人脉需求里的联系人名字：按快照里关联的 id 列表一次批量读取（本人归属谓词，
 * `features/plans/contact-names.ts`）；读失败只降级为占位名，不影响计划本身。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import {
  planContactIds,
  readPlanContactNames,
  type PlanContactName,
} from "../../../../../features/plans/contact-names";
import type { PlanSnapshot } from "../../../../../features/plans/contract";
import { resolvePlanService } from "../../../../../features/plans/service-factory";
import { readGuideDemoConfig } from "../../../../../shared/config/guide-demo";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { IOrbitPlan } from "../iorbit-0918/iorbit-plan";

export const dynamic = "force-dynamic";

/** 本人的当前生效计划；没有为 null，服务不可用或读取失败为 "unavailable"。 */
async function readCurrentPlan(actorId: string): Promise<PlanSnapshot | null | "unavailable"> {
  try {
    const resolution = resolvePlanService({ actorId });
    if (resolution.success === false) return "unavailable";
    return await resolution.service.getCurrent();
  } catch {
    return "unavailable";
  }
}

async function readContactNames(
  actorId: string,
  snapshot: PlanSnapshot | null | "unavailable",
): Promise<Record<string, PlanContactName>> {
  if (!snapshot || snapshot === "unavailable") return {};
  try {
    return await readPlanContactNames(actorId, planContactIds(snapshot));
  } catch {
    return {};
  }
}

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
  const snapshot = await readCurrentPlan(actor.id);
  const contactNames = await readContactNames(actor.id, snapshot);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <IOrbitPlan
        contactNames={contactNames}
        guideEnabled={readGuideDemoConfig().enabled}
        initialSnapshot={snapshot}
      />
    </>
  );
}
