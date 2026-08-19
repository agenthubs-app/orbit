import assert from "node:assert/strict";
import test from "node:test";

import { createNotificationDeliveryRouteHandler } from "../../app/api/notifications/deliveries/[id]/handler";

test("authenticated delivery detail exposes an inbox target without device or push payload data", async () => {
  const handler = createNotificationDeliveryRouteHandler({
    resolveActor: async () => ({ id: "actor:a" }),
    serviceForActor: () => ({
      async get() {
        return {
          actorId: "actor:a",
          availableAt: "2026-08-20T00:00:00.000Z",
          body: "查看 Orbit 中的提醒。",
          channel: "push" as const,
          createdAt: "2026-08-19T00:00:00.000Z",
          data: { deliveryId: "delivery:a", signalId: "must-not-leak" },
          deliveredAt: undefined,
          deliveryId: "delivery:a",
          deviceId: "device:a",
          maxAttempts: 5,
          phase: "commitment" as const,
          scheduledFor: "2026-08-20T00:00:00.000Z",
          signalId: "signal:a",
          signalRevision: "v1",
          status: "scheduled" as const,
          title: "Orbit 提醒",
          attempt: 0,
          updatedAt: "2026-08-19T00:00:00.000Z",
        };
      },
    } as never),
  });
  const response = await handler(new Request("http://localhost"), {
    params: Promise.resolve({ id: "delivery:a" }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.deepEqual(body.data.data, { deliveryId: "delivery:a" });
  assert.deepEqual(body.data.target, { deliveryId: "delivery:a", kind: "inbox" });
  assert.equal("deviceId" in body.data, false);
});
