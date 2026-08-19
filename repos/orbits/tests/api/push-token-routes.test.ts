import assert from "node:assert/strict";
import test from "node:test";

import { createPushTokenRouteHandlers } from "../../app/api/devices/push-tokens/handler";
import { createEncryptedPushTokenVault } from "../../features/notifications/push-token-vault";
import { createStoragePushDeviceService } from "../../features/notifications/push-device-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const tokenVault = createEncryptedPushTokenVault({
  encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64"),
});

test("push token API derives actor from auth and does not echo token", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const handler = createPushTokenRouteHandlers({
    resolveActor: async () => ({ id: "account-a" }),
    serviceForActor: (actorId) =>
      createStoragePushDeviceService({
        actorId,
        store: store as never,
        tokenVault,
        workspaceId: "push-route-test",
      }),
  });
  const response = await handler.POST(
    new Request("http://localhost/api/devices/push-tokens", {
      body: JSON.stringify({
        deviceId: "device-a",
        permission: "granted",
        platform: "ios",
        token: "ExponentPushToken[secret]",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.equal(body.data.deviceId, "device-a");
  assert.equal("token" in body.data, false);
  assert.equal(
    (await handler.DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: "device-a" }) })).status,
    200,
  );
});

test("push token API rejects unauthenticated registration", async () => {
  const handler = createPushTokenRouteHandlers({ resolveActor: async () => null });
  const response = await handler.POST(
    new Request("http://localhost/api/devices/push-tokens", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  assert.equal(response.status, 401);
});
