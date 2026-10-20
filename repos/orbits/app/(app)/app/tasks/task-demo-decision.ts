import { readGuideStatusForActor } from "../../../../features/guide/progress";
import { createProfileService } from "../../../../features/profile/service-factory";
import { readGuideDemoConfig } from "../../../../shared/config/guide-demo";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { demoModeViewFromGuideStatus } from "../_demo/demo-guide-view";

/** Task must distinguish an explicit real-data decision from an unavailable guide read. */
export async function readTaskDemoDecisionForActor(
  input: { actorId: string; userId?: string | null },
  deps: {
    enabled?: () => boolean;
    readGoal?: (actorId: string) => Promise<string>;
    readStatus?: typeof readGuideStatusForActor;
  } = {},
) {
  if (!(deps.enabled ?? (() => readGuideDemoConfig().enabled))()) return null;
  const relationshipGoal = await (deps.readGoal ?? readRelationshipGoal)(input.actorId);
  const status = await (deps.readStatus ?? readGuideStatusForActor)({
    actorId: input.actorId, relationshipGoal, userId: input.userId ?? null,
  });
  if (!status) throw new Error("TASK_DEMO_STATUS_UNAVAILABLE");
  return demoModeViewFromGuideStatus(status);
}

async function readRelationshipGoal(actorId: string): Promise<string> {
  const result = await createProfileService(resolveModuleMode()).getProfile({ actorId });
  if (result.success === false) throw new Error("TASK_DEMO_PROFILE_UNAVAILABLE");
  return result.data.profile?.relationshipGoal ?? "";
}
