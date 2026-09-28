/**
 * 「我的计划」route adapter（`/app/agent/plan`，RW-10，Sprint W0009）。
 *
 * 服务端以本人身份读当前生效计划（W0007；W0021 起为投影 `PlanService.getCurrentView()`）作为首帧交给
 * `iorbit-0918/iorbit-plan.tsx`；读不到时显示「暂时读不到」，不伪造内容。打勾与手动记录
 * 由客户端走 W0007 的接口。引导开关（`ORBIT_GUIDE_DEMO`）决定无计划时的落点：
 * 打开 → `/app/start`（第 3 步生成计划），关闭 → `/app/agent`。
 *
 * 人脉需求里的联系人名字：按快照里关联的 id 列表一次批量读取（本人归属谓词，
 * `features/plans/contact-names.ts`）；读失败只降级为占位名，不影响计划本身。
 *
 * W0014 示例模式：开关打开且本人在引导期示例里时（`readDemoModeViewForActor`，与人脉页同一套
 * 判定），不读计划也不读联系人名字，直接让计划屏渲染示例人物的计划；开关关闭时那次判定不做
 * 任何读取，下面的真实路径与改动前一致。
 *
 * W0012：读计划前先惰性判定「进入新阶段」（幂等；失败不影响读取；W0021 与 API 共用 `getCurrentView`）；另读本月重新分析额度、资料里的
 * 目标（「目标被改」提示）以及——只在计划到期时——计划期间新增的联系人（到期回顾）。这些读取失败
 * 都只降级为不提示／回退口径，不影响计划本身。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../../auth";
import {
  planContactIds,
  readPlanContactNames,
  readPlanPeriodContacts,
  type PlanContactName,
} from "../../../../../features/plans/contact-names";
import type { PlanService, PlanViewSnapshot } from "../../../../../features/plans/contract";
import { planWeekState } from "../../../../../features/plans/week";
import { readCurrentPlan } from "./read-current-plan";
import { createProfileService } from "../../../../../features/profile/service-factory";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import { readGuideDemoConfig } from "../../../../../shared/config/guide-demo";
import { resolveAuthenticatedApiActorFromSession } from "../../../../api/_shared/authenticated-actor";
import { readDemoModeViewForActor } from "../../_demo/demo-guide-view";
import { OrbitReferenceStyles } from "../../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../../orbit-visual-freeze-runtime";
import { IOrbitPlan } from "../iorbit-0918/iorbit-plan";
import type { PlanTrackingInput } from "./plan-route-view-model";

export const dynamic = "force-dynamic";

async function readTracking(
  actorId: string,
  service: PlanService | null,
  snapshot: PlanViewSnapshot | null | "unavailable",
): Promise<PlanTrackingInput | null> {
  if (!service || !snapshot || snapshot === "unavailable") return null;
  // 每一项单独降级：读不到额度 → 按钮不可用；读不到目标 → 不据此提示；读不到联系人 → 回顾退回计划口径。
  const settle = <T,>(read: () => Promise<T>): Promise<T | null> =>
    Promise.resolve()
      .then(read)
      .catch(() => null);
  const [quota, goal, periodContacts] = await Promise.all([
    settle(async () => (await service.reanalysisQuota()).remaining),
    settle(async () => {
      const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
      return result.success ? result.data.profile?.relationshipGoal ?? null : null;
    }),
    settle(async () =>
      planWeekState(snapshot.plan, new Date()).ended
        ? readPlanPeriodContacts(actorId, new Date(`${snapshot.plan.startsOn}T00:00:00+09:00`).toISOString())
        : null,
    ),
  ]);
  return { currentGoal: goal, periodContacts, quotaRemaining: quota };
}

async function readContactNames(
  actorId: string,
  snapshot: PlanViewSnapshot | null | "unavailable",
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
  const guide = await readDemoModeViewForActor({ actorId: actor.id, userId: session.user.id });
  if (guide) {
    return (
      <>
        <OrbitReferenceStyles />
        <OrbitVisualFreezeRuntime />
        <IOrbitPlan guide={guide} guideEnabled initialSnapshot={null} />
      </>
    );
  }
  const { service, snapshot } = await readCurrentPlan(actor.id);
  const [contactNames, tracking] = await Promise.all([
    readContactNames(actor.id, snapshot),
    readTracking(actor.id, service, snapshot),
  ]);

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <IOrbitPlan
        contactNames={contactNames}
        guideEnabled={readGuideDemoConfig().enabled}
        initialSnapshot={snapshot}
        tracking={tracking}
      />
    </>
  );
}
