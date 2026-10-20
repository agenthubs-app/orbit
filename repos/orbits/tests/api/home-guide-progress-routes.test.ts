import assert from "node:assert/strict";
import test from "node:test";

import { createHomeGuideProgressHandler } from "../../app/api/home/guide-progress/route";

const actor = { id: "actor:home-guide-api", userId: "user:home-guide-api" };

test("guide progress route requires the authenticated actor and exposes real progress without demo state", async () => {
  const noSession = createHomeGuideProgressHandler({ resolveActor: async () => null });
  assert.equal((await noSession()).status, 401);
  const ready = createHomeGuideProgressHandler({
    resolveActor: async () => actor,
    readProgress: async (input) => {
      assert.deepEqual(input, { actorId: actor.id, userId: actor.userId });
      return { kind: "progress", completed: 1, confirmedContacts: 3, nextStep: "goal",
        steps: { contacts: true, goal: false, plan: false } };
    },
  });
  const response = await ready();
  assert.equal(response.status, 200);
  const body = (await response.json()).data;
  assert.equal(body.completed, 1);
  assert.equal("inDemo" in body, false);
  const unavailable = createHomeGuideProgressHandler({ resolveActor: async () => actor,
    readProgress: async () => ({ kind: "unavailable" }) });
  const failed = await unavailable();
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.context.reason, "GUIDE_PROGRESS_UNAVAILABLE");
});
