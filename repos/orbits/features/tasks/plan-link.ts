import type { TaskPlanLink } from "../../shared/contract/tasks";
import type { PlanV2Repository, PlanV2Scope } from "../plans/v2/types";

/** Plan rows are actor-scoped by the repository; never infer ownership from IDs alone. */
export function isActivePlanTypeLink(
  repository: PlanV2Repository,
  scope: PlanV2Scope,
  link: TaskPlanLink,
): Promise<boolean> {
  return repository.read(scope, async (reader) => {
    const plan = await reader.plan(link.planId);
    if (!plan || plan.status !== "active" || plan.achievedAt) return false;
    return (await reader.typeItems(plan.id)).some((item) =>
      item.id === link.typeItemId && item.planId === plan.id);
  });
}
