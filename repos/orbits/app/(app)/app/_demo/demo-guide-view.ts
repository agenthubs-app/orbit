/**
 * 服务端：本人此刻是否在引导期示例里（W0005 人脉页用；与 `/app/agent` 同一套判定）。
 *
 * `/app/agent` 能从首页数据拿到 relationshipGoal；人脉页没有首页数据，所以这里自己读
 * 本人资料的目标，再交给 `features/guide/progress.ts` 的 `readGuideStatusForActor`。
 *
 * - 开关关闭：不做任何读取，直接返回 null（人脉页与改动前完全一致）；
 * - 资料读不到：fail closed，返回 null，渲染真实人脉页（与 progress.ts 的口径一致）；
 * - 只有「在示例里」才返回非空的 `DemoModeView`。
 */
import { readGuideStatusForActor, type GuideStatus } from "../../../../features/guide/progress";
import { createProfileService } from "../../../../features/profile/service-factory";
import { readGuideDemoConfig } from "../../../../shared/config/guide-demo";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import type { DemoModeView } from "./demo-mode-core";

/** 引导状态 → 示例视图（只有「在示例里」才非空）。与 `/app/agent` 的映射相同。 */
export function demoModeViewFromGuideStatus(status: GuideStatus | null): DemoModeView | null {
  if (!status?.inDemo || !status.progress) return null;
  return {
    bannerCollapsed: status.bannerCollapsed,
    completed: status.progress.completed,
    confirmedContacts: status.progress.confirmedContacts,
    nextStep: status.progress.nextStep,
    steps: status.progress.steps,
  };
}

/** 本人资料里的关系目标；读不到时抛错（调用方 fail closed）。 */
async function readRelationshipGoal(actorId: string): Promise<string> {
  const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
  if (result.success === false) throw new Error(result.error.message);
  return result.data.profile?.relationshipGoal ?? "";
}

export interface DemoGuideViewDependencies {
  enabled?: () => boolean;
  readGuideStatus?: typeof readGuideStatusForActor;
  readRelationshipGoal?: (actorId: string) => Promise<string>;
}

export async function readDemoModeViewForActor(
  input: { actorId: string; userId?: string | null },
  dependencies: DemoGuideViewDependencies = {},
): Promise<DemoModeView | null> {
  const enabled = dependencies.enabled ?? (() => readGuideDemoConfig().enabled);
  if (!enabled()) return null;
  try {
    const relationshipGoal = await (dependencies.readRelationshipGoal ?? readRelationshipGoal)(input.actorId);
    const status = await (dependencies.readGuideStatus ?? readGuideStatusForActor)({
      actorId: input.actorId,
      relationshipGoal,
      userId: input.userId ?? null,
    });
    return demoModeViewFromGuideStatus(status);
  } catch {
    return null;
  }
}
