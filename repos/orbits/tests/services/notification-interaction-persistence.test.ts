import assert from "node:assert/strict";
import test from "node:test";

import { createNotificationStatePostHandler } from "../../app/api/notifications/[id]/state/handler";
import { createNotificationsGetHandler } from "../../app/api/notifications/handler";
import { createNotificationInteractionService } from "../../features/notifications/interaction-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

test("notification read and ignored states persist per actor, and ignored reminders stay absent after refresh", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  let clock = 0;
  const interactions = createNotificationInteractionService({ now: () => `2026-08-04T12:00:0${clock++}.000Z`, store, workspaceId: "workspace:test" });
  const actorA = { email: "a@example.test", id: "actor:a", name: "A" };
  const actorB = { email: "b@example.test", id: "actor:b", name: "B" };
  const stateHandler = (actor: typeof actorA) => createNotificationStatePostHandler({ interactions, resolveActor: async () => actor });
  const ignore = await stateHandler(actorA)(new Request("http://localhost/api/notifications/reminder%3Afollowup%3Amaya-deck/state", { body: JSON.stringify({ state: "ignored" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: "reminder:followup:maya-deck" }) });
  assert.equal(ignore.status, 200);
  const read = await stateHandler(actorA)(new Request("http://localhost/api/notifications/reminder%3Afollowup%3Adiego-case-study/state", { body: JSON.stringify({ state: "read" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: "reminder:followup:diego-case-study" }) });
  assert.equal(read.status, 200);
  assert.deepEqual(await interactions.list(actorA.id, ["reminder:followup:maya-deck", "reminder:followup:diego-case-study"]), {
    "reminder:followup:diego-case-study": "read",
    "reminder:followup:maya-deck": "ignored",
  });
  assert.deepEqual(await interactions.list(actorB.id, ["reminder:followup:maya-deck"]), {});

  const previousMode = process.env.ORBIT_FEATURE_MODE;
  const previousModuleMode = process.env.ORBIT_MODULE_MODE;
  process.env.ORBIT_FEATURE_MODE = "mock";
  process.env.ORBIT_MODULE_MODE = "mock";
  try {
    for (let refresh = 0; refresh < 2; refresh += 1) {
      const response = await createNotificationsGetHandler(async () => actorA, interactions)(new Request("http://localhost/api/notifications"));
      assert.equal(response.status, 200);
      const payload = (await response.json()).data as { notificationInteractions: Record<string, string>; reminders: readonly { reminderId: string }[] };
      assert.equal(payload.reminders.some((reminder) => reminder.reminderId === "reminder:followup:maya-deck"), false);
      assert.equal(payload.notificationInteractions["reminder:followup:diego-case-study"], "read");
    }
  } finally {
    if (previousMode === undefined) delete process.env.ORBIT_FEATURE_MODE;
    else process.env.ORBIT_FEATURE_MODE = previousMode;
    if (previousModuleMode === undefined) delete process.env.ORBIT_MODULE_MODE;
    else process.env.ORBIT_MODULE_MODE = previousModuleMode;
  }
});
