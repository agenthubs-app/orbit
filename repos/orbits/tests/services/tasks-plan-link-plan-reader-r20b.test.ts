import assert from "node:assert/strict";
import test from "node:test";

import { demoPlanV2State } from "../../features/plans/v2/mock-seed";
import { createMemoryPlanV2Repository } from "../../features/plans/v2/repository";
import { isActivePlanTypeLink } from "../../features/tasks/plan-link";

test("task links resolve only an actor's live v2 plan and an item inside it", async () => {
  const repository = createMemoryPlanV2Repository();
  const actor = { actorId: "actor:owner", workspaceId: "workspace:r20b" };
  const other = { actorId: "actor:other", workspaceId: actor.workspaceId };
  const state = demoPlanV2State();
  const plan = state.plans![0]!;
  const type = state.typeItems![0]!;
  const link = { planId: plan.id, typeItemId: type.id };
  repository.seed(actor, state);

  assert.equal(await isActivePlanTypeLink(repository, actor, link), true);
  assert.equal(await isActivePlanTypeLink(repository, other, link), false);
  assert.equal(await isActivePlanTypeLink(repository, actor, { ...link, typeItemId: "type:forged" }), false);
  assert.equal(await isActivePlanTypeLink(repository, actor, { ...link, planId: "plan:forged" }), false);

  repository.seed(actor, { ...state, plans: [{ ...plan, status: "archived", archivedAt: "2026-10-18T08:00:00.000Z" }] });
  assert.equal(await isActivePlanTypeLink(repository, actor, link), false);
  repository.seed(actor, { ...state, plans: [{ ...plan, achievedAt: "2026-10-18T08:00:00.000Z" }] });
  assert.equal(await isActivePlanTypeLink(repository, actor, link), false);
});
