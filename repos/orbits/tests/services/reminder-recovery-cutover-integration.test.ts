import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService } from "../../features/notifications/reminder-plan-service";

test("interrupted in-app recovery respects the delivery cutover gate before reading or changing history", async () => {
  const now = "2026-09-17T00:00:00.000Z";
  const repository = createReminderPlanRepository({ store: createMemoryLiveRecordStore(), workspaceId: "merge-recovery" });
  let interrupted = false;
  let externallyManaged = false;
  let gateHeld = false;
  let deliveryReads = 0;
  const service = createReminderPlanService({
    now: () => now,
    repository: {
      ...repository,
      async getDelivery(actor, id) {
        assert.equal(gateHeld, true);
        deliveryReads++;
        return repository.getDelivery(actor, id);
      },
      async savePlan(plan) {
        if (plan.status === "delivered") {
          assert.equal(gateHeld, true);
          if (!interrupted) { interrupted = true; throw new Error("interrupted after delivery"); }
        }
        return repository.savePlan(plan);
      },
    },
    async withDeliveryGate(actor, operation) {
      assert.equal(actor, "owner");
      gateHeld = true;
      try { await operation(); } finally { gateHeld = false; }
    },
    async deliveryManagedExternally() {
      assert.equal(gateHeld, true);
      return externallyManaged;
    },
  });
  const plan = await service.create({ actorId: "owner", body: "Body", channels: ["in_app"], createdBy: "user", deepLink: "/app/tasks/task", fireAt: now, idempotencyKey: "one", targetId: "task", targetType: "task", timeZone: "UTC", title: "Reminder" });
  const provider = { async send(): Promise<never> { throw new Error("push must not run"); } };
  await assert.rejects(service.dispatchDue({ now, provider }), /interrupted after delivery/);
  const history = await repository.listDeliveries("owner");
  assert.equal(history.length, 1);
  const reads = deliveryReads;
  externallyManaged = true;
  assert.equal((await service.dispatchDue({ now, provider })).claimed, 0);
  assert.equal(deliveryReads, reads, "cutover must happen before even reading legacy delivery history");
  assert.equal((await repository.getPlan("owner", plan.id))?.status, "scheduled");
  externallyManaged = false;
  assert.equal((await service.dispatchDue({ now, provider })).claimed, 1);
  assert.equal((await repository.getPlan("owner", plan.id))?.status, "delivered");
  assert.deepEqual(await repository.listDeliveries("owner"), history);
});
