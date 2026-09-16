import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService } from "../../features/notifications/reminder-plan-service";
import type { ReminderChannel } from "../../features/notifications/reminder-plan-contract";

const NOW = "2026-09-16T02:00:00.000Z";
const LATER = "2026-09-16T02:10:00.000Z";

async function interrupted(channels: readonly ReminderChannel[]) {
  const repository = createReminderPlanRepository({ store: createMemoryLiveRecordStore(), workspaceId: "test" });
  let failSave = true;
  let deliveryWrites = 0;
  let sends = 0;
  const faulted = {
    ...repository,
    async savePlan(plan: Parameters<typeof repository.savePlan>[0]) {
      if (plan.status === "delivered" && failSave) { failSave = false; throw new Error("plan save interrupted"); }
      return repository.savePlan(plan);
    },
    async saveDelivery(value: Parameters<typeof repository.saveDelivery>[0]) {
      deliveryWrites++;
      return repository.saveDelivery(value);
    },
  };
  const service = createReminderPlanService({ repository: faulted, now: () => NOW });
  const plan = await service.create({ actorId: "actor:a", targetId: "task:a", targetType: "task", channels,
    fireAt: NOW, timeZone: "UTC", title: "Reminder", body: "Body", deepLink: "/app/tasks/task%3Aa", createdBy: "user", idempotencyKey: "one" });
  await service.registerDevice({ actorId: "actor:a", deviceId: "ios:a", platform: "ios", token: "test", permission: "granted" });
  const provider = { async send() { sends++; return { ok: true as const, providerMessageId: "test" }; } };
  await assert.rejects(service.dispatchDue({ now: NOW, provider }), /plan save interrupted/);
  assert.equal((await repository.getPlan("actor:a", plan.id))?.status, "scheduled");
  return { repository, faulted, provider, plan, counts: () => ({ deliveryWrites, sends }) };
}

test("new service instance completes interrupted in-app plan without rewriting its delivery", async () => {
  const h = await interrupted(["in_app"]);
  const before = await h.repository.listDeliveries("actor:a");
  const restarted = createReminderPlanService({ repository: h.faulted, now: () => LATER });
  // A later preference change must not erase already committed delivery evidence.
  await restarted.updatePreferences({ actorId: "actor:a", inAppEnabled: false, iosPushEnabled: false,
    lockScreenContent: "private", quietHours: { enabled: false, start: "22:00", end: "08:00", timeZone: "UTC" } });
  const replay = await restarted.dispatchDue({ now: LATER, provider: h.provider });
  assert.equal(replay.claimed, 1);
  assert.equal(replay.inAppDelivered, 0);
  assert.equal((await h.repository.getPlan("actor:a", h.plan.id))?.status, "delivered");
  assert.equal((await h.repository.getPlan("actor:a", h.plan.id))?.deliveredAt, NOW);
  assert.deepEqual(await h.repository.listDeliveries("actor:a"), before);
  assert.deepEqual(h.counts(), { deliveryWrites: 1, sends: 0 });
  assert.equal((await restarted.dispatchDue({ now: LATER, provider: h.provider })).claimed, 0);
});

test("recovery does not replay or terminalize mixed/push plans after existing delivery evidence", async () => {
  for (const channels of [["in_app", "ios_push"], ["ios_push"]] as const) {
    const h = await interrupted(channels);
    const before = h.counts();
    const restarted = createReminderPlanService({ repository: h.faulted, now: () => LATER });
    assert.equal((await restarted.dispatchDue({ now: LATER, provider: h.provider })).claimed, 0);
    assert.equal((await h.repository.getPlan("actor:a", h.plan.id))?.status, "scheduled");
    assert.deepEqual(h.counts(), before);
  }
});
