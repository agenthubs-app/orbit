import assert from "node:assert/strict";
import test from "node:test";

import { createGuideProgressRouteHandler } from "../../app/api/guide/progress/route-handler";

test("the guide progress route is private and returns real step facts", async () => {
  let readInput: unknown;
  const readGuide = async (input: unknown) => { readInput = input; return ({ kind: "ready" as const, snapshot: {
    completedAt: null, confirmedContacts: 2, contactSamples: [], currentStep: 3 as const,
    grandfathered: false, hasActivePlan: false, step1Skipped: false,
  } }); };
  const guest = createGuideProgressRouteHandler({ resolveActor: async () => null, readGoal: async () => "goal", readGuide });
  assert.equal((await guest()).status, 401);
  const handler = createGuideProgressRouteHandler({ resolveActor: async () => ({ id: "alice", userId: "auth-alice" }), readGoal: async () => "goal", readGuide });
  const response = await handler();
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { completed: number; flags: { contacts: boolean; goal: boolean; plan: boolean }; snapshot: { currentStep: number } } };
  assert.equal(body.data.completed, 1);
  assert.deepEqual(body.data.flags, { contacts: false, goal: true, plan: false });
  assert.equal(body.data.snapshot.currentStep, 3, "currentStep does not inflate completion");
  assert.deepEqual(readInput, { actorId: "alice", relationshipGoal: "goal", userId: "auth-alice" });
});
