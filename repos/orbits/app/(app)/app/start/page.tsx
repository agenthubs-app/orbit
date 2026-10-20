/**
 * 引导页 `/app/start` route adapter（W0006，RW-04 / RW-05 第 3 步）。
 *
 * - 示例开关不限制真实指南读取；
 * - 资料未完成时，私有路由门禁会先转到五屏资料引导，保留 `/app/start` 为安全 next；
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
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { resolveAuthenticatedApiActorFromSession } from "../../../api/_shared/authenticated-actor";
import { ShellPage } from "../orbit-2026/shell/slots";
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
    <div data-r28-guide data-orbit-route="app-start-guide-route">
      <ShellPage rightRail={false} />
      {body}
    </div>
  );
}
