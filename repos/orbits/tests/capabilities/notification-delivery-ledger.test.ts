import assert from "node:assert/strict";
import test from "node:test";

import {
  createNotificationDeliveryWorker,
  createStorageNotificationDeliveryService,
} from "../../features/notifications/delivery-service";
import {
  createStoragePushDeviceActorEnumerator,
  createStoragePushDeviceService,
} from "../../features/notifications/push-device-service";
import { createEncryptedPushTokenVault } from "../../features/notifications/push-token-vault";
import { materializeCommitmentSignals } from "../../features/notifications/signal-materializer";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const NOW = "2026-08-19T12:00:00.000Z";
const tokenVault = createEncryptedPushTokenVault({
  encryptionKeyBase64: Buffer.alloc(32, 9).toString("base64"),
});

function store() {
  return createMemoryLiveRecordStore<Record<string, unknown>>();
}

function deliveryService(
  actorId: string,
  recordStore: ReturnType<typeof store>,
  devices?: ReturnType<typeof deviceService>,
  clock: () => string = () => NOW,
) {
  return createStorageNotificationDeliveryService({
    actorId,
    devices,
    store: recordStore as never,
    workspaceId: "notification-ledger-test",
    now: clock,
  });
}

function deviceService(actorId: string, recordStore: ReturnType<typeof store>) {
  return createStoragePushDeviceService({
    actorId,
    store: recordStore as never,
    tokenVault,
    workspaceId: "notification-ledger-test",
    now: () => NOW,
  });
}

test("push device registration is actor scoped and never returns the raw token", async () => {
  const recordStore = store();
  const service = deviceService("actor-a", recordStore);
  const device = await service.register({
    deviceId: "ios-installation-a",
    permission: "granted",
    platform: "ios",
    token: "ExponentPushToken[secret]",
  });
  assert.equal(device.deviceId, "ios-installation-a");
  assert.equal("token" in device, false);
  assert.equal((await deviceService("actor-b", recordStore).listActive()).length, 0);
  assert.equal((await service.listActive()).length, 1);
  const records = await recordStore.listRecords({
    collectionName: "pushDevices",
    workspaceId: "notification-ledger-test",
  });
  const payload = records[0]?.payload as Record<string, unknown>;
  assert.equal("token" in payload, false);
  assert.equal(typeof payload.tokenHash, "string");
  assert.equal((payload.encryptedToken as Record<string, unknown>).algorithm, "aes-256-gcm");
  const revoked = await service.revoke("ios-installation-a");
  assert.equal(revoked?.active, false);
  assert.equal((await service.listActive()).length, 0);
});

test("materialization is idempotent and delivery worker sends opaque payload once", async () => {
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "ios-installation-a",
    platform: "ios",
    token: "ExponentPushToken[secret]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices);
  const input = {
    body: "你有一条会前准备提醒，打开 Orbit 查看。",
    data: { kind: "pre_event_brief", phase: "pre_event" },
    phase: "pre_event" as const,
    scheduledFor: NOW,
    signalId: "event_upcoming:event-a",
    signalRevision: "2026-08-19T14:00:00.000Z",
    title: "Orbit 提醒",
  };
  const first = await delivery.materialize(input);
  const second = await delivery.materialize(input);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.delivery.deliveryId, second.delivery.deliveryId);

  const sent: Array<Record<string, string>> = [];
  const worker = createNotificationDeliveryWorker({
    dailyPushLimit: 2,
    delivery,
    devices,
    now: () => NOW,
    push: {
      async send(message) {
        sent.push(message.data as Record<string, string>);
        return { receiptId: "expo-receipt-1", verified: true };
      },
    },
    preferences: async () => ({
      followupDuePushEnabled: true,
      postEventReminderPushEnabled: true,
      preEventBriefPushEnabled: true,
      quietHours: { end: "08:00", start: "22:00" },
      timeZone: "UTC",
    }),
  });
  const result = await worker.run({ limit: 10, workerId: "worker-a" });
  assert.deepEqual(result, {
    claimed: 1,
    deferred: 0,
    deadLettered: 0,
    receiptPending: 0,
    retried: 0,
    sent: 1,
    suppressed: 0,
  });
  assert.deepEqual(sent[0], { deliveryId: first.delivery.deliveryId });
  assert.equal((await delivery.get(first.delivery.deliveryId))?.status, "sent");
});

test("quiet-hours defer delivery to the next IANA quiet-end instead of suppressing it", async () => {
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "ios-installation-a",
    platform: "ios",
    token: "ExponentPushToken[quiet-hours]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices);
  const queued = await delivery.materialize({
    body: "查看 Orbit 中的提醒。",
    phase: "commitment",
    scheduledFor: "2026-08-19T13:30:00.000Z",
    signalId: "followup_due:quiet-hours",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  const worker = createNotificationDeliveryWorker({
    delivery,
    devices,
    now: () => "2026-08-19T13:30:00.000Z",
    push: {
      async send() {
        return { receiptId: "should-not-send-during-quiet-hours" };
      },
    },
    preferences: async () => ({
      followupDuePushEnabled: true,
      postEventReminderPushEnabled: true,
      preEventBriefPushEnabled: true,
      quietHours: { end: "08:00", start: "22:00" },
      timeZone: "America/Los_Angeles",
    }),
  });
  const result = await worker.run({ limit: 1, workerId: "worker-quiet" });
  assert.equal(result.deferred, 1);
  assert.equal(result.suppressed, 0);
  assert.equal(
    (await delivery.get(queued.delivery.deliveryId))?.availableAt,
    "2026-08-19T15:00:00.000Z",
  );
  assert.equal((await delivery.get(queued.delivery.deliveryId))?.status, "retry_scheduled");
});

test("materializes one logical delivery per device and isolates revocation", async () => {
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "device-a",
    platform: "ios",
    token: "ExponentPushToken[a]",
  });
  await devices.register({
    deviceId: "device-b",
    platform: "ios",
    token: "ExponentPushToken[b]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices);
  const queued = await delivery.materialize({
    body: "查看 Orbit 中的提醒。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "followup_due:multi-device",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  assert.equal(queued.deliveries.length, 2);
  assert.deepEqual(
    queued.deliveries.map((item) => item.deviceId).sort(),
    ["device-a", "device-b"],
  );
  assert.equal(
    (await delivery.materialize({
      body: "查看 Orbit 中的提醒。",
      phase: "commitment",
      scheduledFor: NOW,
      signalId: "followup_due:multi-device",
      signalRevision: "v1",
      title: "Orbit 提醒",
    })).created,
    false,
  );
  await devices.revoke("device-b");
  const sentTokens: string[] = [];
  const worker = createNotificationDeliveryWorker({
    delivery,
    devices,
    now: () => NOW,
    push: {
      async send(message) {
        sentTokens.push(message.token);
        return { receiptId: `verified:${message.token}`, verified: true };
      },
    },
  });
  const result = await worker.run({ limit: 10, workerId: "worker-multi-device" });
  assert.equal(result.sent, 1);
  assert.equal(result.suppressed, 1);
  assert.deepEqual(sentTokens, ["ExponentPushToken[a]"]);
  assert.equal(
    (await delivery.get(queued.deliveries.find((item) => item.deviceId === "device-a")!.deliveryId))?.status,
    "sent",
  );
  assert.equal(
    (await delivery.get(queued.deliveries.find((item) => item.deviceId === "device-b")!.deliveryId))?.suppressionReason,
    "device_revoked",
  );
  const duplicate = await worker.run({ limit: 10, workerId: "worker-multi-device" });
  assert.equal(duplicate.claimed, 0);
  assert.deepEqual(sentTokens, ["ExponentPushToken[a]"]);
});

test("provider ticket stays receipt-pending until verified and unregisters bad devices", async () => {
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "device-a",
    platform: "ios",
    token: "ExponentPushToken[pending]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices);
  const queued = await delivery.materialize({
    body: "查看 Orbit 中的提醒。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "followup_due:receipt",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  let receiptPolls = 0;
  let sends = 0;
  const worker = createNotificationDeliveryWorker({
    delivery,
    devices,
    now: () => NOW,
    push: {
      async send() {
        sends += 1;
        return { receiptId: "ticket-1" };
      },
      async getReceipt() {
        receiptPolls += 1;
        return receiptPolls === 1
          ? { status: "pending" as const }
          : { status: "ok" as const };
      },
    },
  });
  const first = await worker.run({ limit: 1, workerId: "worker-receipt" });
  assert.equal(first.sent, 0);
  assert.equal(first.receiptPending, 1);
  assert.equal((await delivery.get(queued.delivery.deliveryId))?.status, "receipt_pending");
  const second = await worker.run({ limit: 1, workerId: "worker-receipt" });
  assert.equal(second.claimed, 0);
  assert.equal((await delivery.get(queued.delivery.deliveryId))?.status, "receipt_pending");
  const third = await worker.run({ limit: 1, workerId: "worker-receipt" });
  assert.equal(third.claimed, 0);
  assert.equal((await delivery.get(queued.delivery.deliveryId))?.status, "sent");
  assert.equal(sends, 1);

  const bad = await delivery.materialize({
    body: "坏 token 测试。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "followup_due:bad-token",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  await devices.register({
    deviceId: "device-a",
    platform: "ios",
    token: "ExponentPushToken[pending-rotated]",
  });
  const badWorker = createNotificationDeliveryWorker({
    delivery,
    devices,
    now: () => NOW,
    push: {
      async send() {
        return { receiptId: "ticket-bad" };
      },
      async getReceipt(receiptId) {
        return receiptId === "ticket-bad"
          ? { status: "error" as const, error: "DeviceNotRegistered" }
          : { status: "pending" as const };
      },
    },
  });
  await badWorker.run({ limit: 1, workerId: "worker-bad-receipt" });
  assert.equal((await delivery.get(bad.delivery.deliveryId))?.status, "receipt_pending");
  await badWorker.run({ limit: 1, workerId: "worker-bad-receipt" });
  assert.equal((await delivery.get(bad.delivery.deliveryId))?.status, "failed");
  assert.equal((await devices.listActive()).length, 0);
});

test("daily quota uses the actor timezone's real local midnight", async () => {
  let current = "2026-08-18T23:30:00.000Z";
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "device-a",
    platform: "ios",
    token: "ExponentPushToken[quota]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices, () => current);
  const worker = createNotificationDeliveryWorker({
    dailyPushLimit: 1,
    delivery,
    devices,
    now: () => current,
    push: {
      async send() {
        return { receiptId: `quota:${current}`, verified: true };
      },
    },
    preferences: async () => ({
      followupDuePushEnabled: true,
      postEventReminderPushEnabled: true,
      preEventBriefPushEnabled: true,
      quietHours: { end: "08:00", start: "22:00" },
      timeZone: "Asia/Tokyo",
    }),
  });
  const first = await delivery.materialize({
    body: "东京本地日配额。",
    phase: "commitment",
    scheduledFor: current,
    signalId: "followup_due:tokyo-first",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  assert.equal((await worker.run({ limit: 1, workerId: "worker-quota" })).sent, 1);
  assert.equal((await delivery.get(first.delivery.deliveryId))?.status, "sent");

  // 23:30Z is 08:30 on Aug 19 in Tokyo. The next tick is 00:30Z, still Aug
  // 19 locally, even though it is a new UTC date.
  current = "2026-08-19T00:30:00.000Z";
  const second = await delivery.materialize({
    body: "东京本地日配额。",
    phase: "commitment",
    scheduledFor: current,
    signalId: "followup_due:tokyo-second",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  const capped = await worker.run({ limit: 1, workerId: "worker-quota" });
  assert.equal(capped.suppressed, 1);
  assert.equal((await delivery.get(second.delivery.deliveryId))?.suppressionReason, "daily_push_limit");
});

test("server actor enumeration sees only active granted devices and preserves actor isolation", async () => {
  const recordStore = store();
  const actorA = deviceService("actor-a", recordStore);
  const actorB = deviceService("actor-b", recordStore);
  await actorA.register({
    deviceId: "device-a",
    platform: "ios",
    token: "ExponentPushToken[a]",
  });
  await actorB.register({
    deviceId: "device-b",
    permission: "denied",
    platform: "ios",
    token: "ExponentPushToken[b]",
  });
  const sqlClient = {
    async query<T>(text: string, values?: readonly unknown[]) {
      assert.match(text, /collection_name = \$2/u);
      assert.deepEqual(values, ["notification-ledger-test", "pushDevices"]);
      const records = await recordStore.listRecords({
        collectionName: "pushDevices",
        lifecycleState: "active",
        workspaceId: "notification-ledger-test",
      });
      const rows = records
        .filter((record) => {
          const device = (record.payload as Record<string, unknown>).device as Record<string, unknown>;
          return device.permission === "granted" && !device.revokedAt;
        })
        .map((record) => ({ actor_id: record.userId }));
      return { rows } as unknown as { rows: readonly T[] };
    },
  };
  const enumerator = createStoragePushDeviceActorEnumerator({
    sqlClient,
    workspaceId: "notification-ledger-test",
  });
  assert.deepEqual(await enumerator.listOptedInActorIds(), ["actor-a"]);
  assert.equal((await actorA.listActive()).length, 1);
  assert.equal((await actorB.listActive()).length, 0);
});

test("transient provider failure is persisted for retry and daily cap suppresses later work", async () => {
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "ios-installation-a",
    platform: "ios",
    token: "ExponentPushToken[secret]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices);
  const first = await delivery.materialize({
    body: "查看 Orbit 中的提醒。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "followup_due:task-a",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  const second = await delivery.materialize({
    body: "查看 Orbit 中的另一条提醒。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "followup_due:task-b",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  let shouldFail = true;
  const worker = createNotificationDeliveryWorker({
    dailyPushLimit: 1,
    delivery,
    devices,
    now: () => NOW,
    push: {
      async send() {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("temporary Expo outage");
        }
        return { receiptId: "expo-receipt-2", verified: true };
      },
    },
    preferences: async () => ({
      followupDuePushEnabled: true,
      postEventReminderPushEnabled: true,
      preEventBriefPushEnabled: true,
      quietHours: { end: "08:00", start: "22:00" },
      timeZone: "UTC",
    }),
  });
  const firstResult = await worker.run({ limit: 1, workerId: "worker-a" });
  assert.equal(firstResult.retried, 1);
  assert.equal((await delivery.get(first.delivery.deliveryId))?.status, "retry_scheduled");

  const secondResult = await worker.run({ limit: 1, workerId: "worker-a" });
  assert.equal(secondResult.sent, 1);
  assert.equal((await delivery.get(second.delivery.deliveryId))?.status, "sent");

  const third = await delivery.materialize({
    body: "查看 Orbit 中的第三条提醒。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "followup_due:task-c",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  const capped = await worker.run({ limit: 1, workerId: "worker-a" });
  assert.equal(capped.suppressed, 1);
  assert.equal((await delivery.get(third.delivery.deliveryId))?.suppressionReason, "daily_push_limit");
});

test("follow-up signals use the commitment delivery phase and stale relationships are skipped", async () => {
  const recordStore = store();
  const delivery = deliveryService("actor-a", recordStore);
  const signal = {
    actions: [],
    changes: [],
    confidence: 0.9,
    fingerprint: "followup_due:task-a",
    firstObservedAt: NOW,
    importance: 90,
    lastMeaningfulChangeAt: NOW,
    lastObservedAt: NOW,
    materialHash: "hash-a",
    occurredAt: NOW,
    reason: "due now",
    resolvedAt: undefined,
    severity: "high" as const,
    signalId: "signal:followup_due:task-a",
    snoozedUntil: undefined,
    sources: [],
    status: "new" as const,
    summary: "Follow up",
    targetId: "task-a",
    targetType: "task" as const,
    title: "跟进",
    type: "followup_due" as const,
  };
  const first = await materializeCommitmentSignals({
    delivery,
    now: NOW,
    preferences: { followupDuePushEnabled: true },
    signals: [signal],
  });
  const second = await materializeCommitmentSignals({
    delivery,
    now: NOW,
    preferences: { followupDuePushEnabled: true },
    signals: [signal],
  });
  assert.deepEqual(first, { created: 1, skipped: 0 });
  assert.deepEqual(second, { created: 0, skipped: 1 });
  const deliveries = await delivery.list();
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].phase, "commitment");
  assert.equal(deliveries[0].signalId, signal.signalId);
  const stale = await materializeCommitmentSignals({
    delivery,
    now: NOW,
    preferences: { followupDuePushEnabled: true },
    signals: [{ ...signal, type: "relationship_stale" as const }],
  });
  assert.deepEqual(stale, { created: 0, skipped: 1 });
  assert.equal((await delivery.list()).length, 1);

  const snoozedUntil = "2026-08-20T08:00:00.000Z";
  const snoozed = await materializeCommitmentSignals({
    delivery,
    now: NOW,
    preferences: { followupDuePushEnabled: true },
    signals: [{ ...signal, snoozedUntil, status: "snoozed" as const }],
  });
  assert.deepEqual(snoozed, { created: 1, skipped: 0 });
  const afterSnooze = await delivery.list();
  assert.equal(afterSnooze.length, 2);
  const snoozedDelivery = afterSnooze.find((item) =>
    item.signalRevision.includes(":snooze:"),
  );
  assert.equal(snoozedDelivery?.scheduledFor, snoozedUntil);
  assert.match(snoozedDelivery?.signalRevision ?? "", /:snooze:/u);
});

test("delivery worker suppresses a signal that is no longer active", async () => {
  const recordStore = store();
  const devices = deviceService("actor-a", recordStore);
  await devices.register({
    deviceId: "ios-installation-inactive",
    permission: "granted",
    platform: "ios",
    token: "ExponentPushToken[inactive]",
  });
  const delivery = deliveryService("actor-a", recordStore, devices);
  const queued = await delivery.materialize({
    body: "查看 Orbit 中的提醒。",
    phase: "commitment",
    scheduledFor: NOW,
    signalId: "signal:followup_due:inactive",
    signalRevision: "v1",
    title: "Orbit 提醒",
  });
  const result = await createNotificationDeliveryWorker({
    delivery,
    devices,
    now: () => NOW,
    push: {
      async send() {
        throw new Error("inactive source must not reach the provider");
      },
    },
    sourceEligible: async () => false,
  }).run({ limit: 1, workerId: "worker-inactive" });
  assert.equal(result.suppressed, 1);
  assert.equal(
    (await delivery.get(queued.delivery.deliveryId))?.suppressionReason,
    "source_inactive",
  );
});
