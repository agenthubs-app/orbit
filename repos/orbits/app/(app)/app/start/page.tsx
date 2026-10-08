/**
 * 引导页 `/app/start` route adapter（W0006，RW-04 / RW-05 第 3 步）。
 *
 * - 开关 `ORBIT_GUIDE_DEMO` 关闭（D1）：直接重定向到 `/app/agent`，不做任何读取；
 * - 资料门禁豁免这一条路径（`profile-onboarding-route-policy.ts`），资料未完成的新用户也能进；
 * - 进度由服务端从真实数据推导（`features/guide/progress.ts` 的 `readStartGuideForActor`），
 *   客户端只拿到可序列化的快照。W0035 删去「活动」一步后，本页不再读社群加入记录、公开
 *   活动目录和报名事实。
 * - W0022：`?step=1`–`3` 只解析成合法的单个步骤交给客户端壳，壳按硬顺序决定能否打开，
 *   加载时不写引导记录；值为 4 的 `?step` 与其他非法值一样被丢弃；
 * - 所有按人的读取都用服务端解析出的 canonical actor id（不是 Auth.js 的 session.user.id）；
 *   session.user.id 只用于读账号创建时间（D2 判定）。
 */
import { redirect } from "next/navigation";

import { auth } from "../../../../auth";
import { resolveBusinessCardCaptureAvailability } from "../../../../features/acquisition/business-card-capture-availability";
import { readStartGuideForActor } from "../../../../features/guide/progress";
import { parseStartStepParam } from "../../../../features/guide/start-steps";
import { createProfileService } from "../../../../features/profile/service-factory";
import { readGuideDemoConfig } from "../../../../shared/config/guide-demo";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { OrbitReferenceStyles } from "../orbit-reference-styles";
import { OrbitVisualFreezeRuntime } from "../orbit-visual-freeze-runtime";
import { StartGuide, StartGuideUnavailable } from "./start-guide";

export const dynamic = "force-dynamic";

async function readProfileGoal(actorId: string): Promise<{ relationshipGoal: string; updatedAt: string | null } | null> {
  try {
    const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
    if (result.success === false) return null;
    return {
      relationshipGoal: result.data.profile?.relationshipGoal ?? "",
      updatedAt: result.data.profile?.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

export type AppStartSearchParams = {
  /** W0022：`?step=N`（1–3）请求直接打开某一步；能不能打开由客户端壳按硬顺序判定。 */
  step?: string | string[];
};

export default async function AppStartPage({
  searchParams,
}: {
  searchParams?: Promise<AppStartSearchParams>;
} = {}) {
  if (!readGuideDemoConfig().enabled) redirect("/app/agent");

  const session = await auth();
  if (!session?.user?.id) redirect("/app/account/login?next=%2Fapp%2Fstart");
  const actor = await resolveAuthenticatedApiActorFromSession({
    email: session.user.email,
    name: session.user.name,
    userId: session.user.id,
  });
  if (!actor) throw new Error("Authenticated Orbit account membership is unavailable.");

  const profile = await readProfileGoal(actor.id);
  const guide = profile
    ? await readStartGuideForActor({
        actorId: actor.id,
        relationshipGoal: profile.relationshipGoal,
        userId: session.user.id,
      })
    : ({ kind: "unavailable" } as const);
  if (guide.kind === "disabled") redirect("/app/agent");

  const requestedStep = parseStartStepParam((await searchParams)?.step);

  let body;
  if (guide.kind === "ready" && profile) {
    body = (
      <StartGuide
        cardScanAvailable={resolveBusinessCardCaptureAvailability().available}
        profileUpdatedAt={profile.updatedAt}
        relationshipGoal={profile.relationshipGoal}
        requestedStep={requestedStep}
        snapshot={guide.snapshot}
      />
    );
  } else {
    body = <StartGuideUnavailable />;
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitVisualFreezeRuntime />
      <div data-orbit-real-page="start-guide" data-orbit-route="app-start-guide-route">
        {body}
      </div>
    </>
  );
}
