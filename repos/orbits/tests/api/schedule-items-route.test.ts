import assert from "node:assert/strict";
import test from "node:test";

import { createScheduleItemsGetHandler } from "../../app/api/schedule-items/handler";

test("schedule items route is actor scoped and returns the provider projection", async () => {
  let observedActorId = "";
  const handler = createScheduleItemsGetHandler({
    resolveActor: async () => ({ email: "xiaoyu@example.test", id: "actor:xiaoyu", name: "小雨" }),
    scheduleProvider: {
      async list({ actorId }) {
        observedActorId = actorId;
        return [{
          category: "personal",
          endsAt: "2026-08-29T09:30:00.000Z",
          id: "schedule:review",
          kind: "personal",
          location: "Orbit 办公室",
          sourceId: "schedule:review",
          startsAt: "2026-08-29T08:30:00.000Z",
          state: "upcoming",
          title: "本周经营复盘与下周优先级",
        }];
      },
    },
  });

  const response = await handler();
  assert.equal(response.status, 200);
  assert.equal(observedActorId, "actor:xiaoyu");
  assert.equal((await response.json()).data.scheduleItems[0].kind, "personal");
});

test("schedule items route rejects unauthenticated requests before reading storage", async () => {
  let listed = false;
  const handler = createScheduleItemsGetHandler({
    resolveActor: async () => null,
    scheduleProvider: { async list() { listed = true; return []; } },
  });
  const response = await handler();
  assert.equal(response.status, 401);
  assert.equal(listed, false);
});
