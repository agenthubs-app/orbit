import assert from "node:assert/strict";
import test from "node:test";

import { createPushTokenDeleteHandler, createPushTokenPostHandler } from "../../app/api/devices/push-token/handler";
import { createReminderPushDeviceGateway } from "../../features/notifications/push-device-reminder-adapter";
import { createStoragePushDeviceService } from "../../features/notifications/push-device-service";
import { createEncryptedPushTokenVault } from "../../features/notifications/push-token-vault";
import { createReminderPlanRepository } from "../../features/notifications/reminder-plan-repository";
import { createReminderPlanService } from "../../features/notifications/reminder-plan-service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const NOW = "2026-09-15T03:00:00.000Z";

function harness() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const serviceForActor = (actorId: string) => createStoragePushDeviceService({
    actorId,
    now: () => NOW,
    store: store as never,
    tokenVault: createEncryptedPushTokenVault({
      encryptionKeyBase64: Buffer.alloc(32, 9).toString("base64"),
    }),
    workspaceId: "push-consolidation",
  });
  const pushDevices = createReminderPushDeviceGateway({ serviceForActor });
  const repository = createReminderPlanRepository({ store, workspaceId: "push-consolidation" });
  const reminder = createReminderPlanService({
    now: () => NOW,
    pushDevices,
    repository,
  });
  return { pushDevices, reminder, repository, serviceForActor, store };
}

test("reminder compatibility writes only the canonical pushDevices collection", async () => {
  const { reminder, store } = harness();
  await reminder.registerDevice({
    actorId: "actor:a",
    deviceId: "installation:a",
    permission: "provisional",
    platform: "ios",
    token: "ExponentPushToken[a]",
  });

  assert.equal((await reminder.notificationAvailability("actor:a")).iosPushAvailable, true);
  assert.equal((await store.listRecords({ limit: "unbounded", collectionName: "pushDevices", userId: "actor:a", workspaceId: "push-consolidation" })).length, 1);
  assert.equal((await store.listRecords({ limit: "unbounded", collectionName: "devicePushTokens", userId: "actor:a", workspaceId: "push-consolidation" })).length, 0);
  await reminder.revokeDevice({ actorId: "actor:a", deviceId: "installation:a" });
  assert.equal((await reminder.notificationAvailability("actor:a")).iosPushAvailable, false);
});

test("the singular endpoint revokes canonical and legacy records during the compatibility window", async () => {
  const { reminder, repository, serviceForActor } = harness();
  const resolveActor = async () => ({ id: "actor:a" });
  const register = createPushTokenPostHandler({ resolveActor, service: reminder });
  const response = await register(new Request("http://localhost/api/devices/push-token", {
    body: JSON.stringify({
      deviceId: "installation:a",
      permission: "granted",
      platform: "ios",
      token: "ExponentPushToken[a]",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }));
  assert.equal(response.status, 200);
  assert.equal((await serviceForActor("actor:a").listActive()).length, 1);
  await repository.saveDevice({
    accountId: "actor:a",
    createdAt: NOW,
    deviceId: "installation:a",
    id: "legacy:installation:a",
    lastVerifiedAt: NOW,
    ownerUserId: "actor:a",
    permission: "granted",
    platform: "ios",
    status: "active",
    token: "ExponentPushToken[legacy]",
    updatedAt: NOW,
  });

  const revoke = createPushTokenDeleteHandler({ resolveActor, service: reminder });
  assert.equal((await revoke(new Request("http://localhost/api/devices/push-token", {
    body: JSON.stringify({ deviceId: "installation:a" }),
    headers: { "content-type": "application/json" },
    method: "DELETE",
  }))).status, 200);
  assert.equal((await serviceForActor("actor:a").listActive()).length, 0);
  assert.equal((await repository.listDevices("actor:a"))[0]?.status, "revoked");
});
