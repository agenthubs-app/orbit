import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { createPushTokenRouteHandlers } from "../../app/api/devices/push-tokens/handler";
import { createNotificationDeliveryRouteHandler } from "../../app/api/notifications/deliveries/[id]/handler";
import { pushDeliveryIdOf } from "../../features/agent/automations/runs";
import { setTaskReminder } from "../../features/agent/automations/reminder";
import { resolveRuleReminderTarget } from "../../features/agent/automations/reminder-target";
import { createEncryptedPushTokenVault } from "../../features/notifications/push-token-vault";
import { createStoragePushDeviceService } from "../../features/notifications/push-device-service";
import { agentPushDeviceStateSchema, agentScheduledTaskReminderInputSchema } from "../../shared/api-schema/agent-v1";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createDispatchKit, createRule, serviceFor } from "../capabilities/agent-automation-kit";

/**
 * agent-design AG16-1 (PLANNER 易错边界 2/6): a browser becomes a device to send to only with the permission granted and a
 * real push subscription; a browser that said no is not one. And the calls the task pages will use: this device's
 * state, the task's own switch, and where a reminder leads.
 */
const sim = createRequire(import.meta.url)("../agent-eval/preload/web-push-sim.cjs") as { evalWebPushSubscription(deviceId: string, port: number): { endpoint: string; keys: { p256dh: string; auth: string } } };
const tokenVault = createEncryptedPushTokenVault({ encryptionKeyBase64: Buffer.alloc(32, 7).toString("base64") });
const EVAL = { ORBIT_AGENT_EVAL: "1" } as unknown as NodeJS.ProcessEnv;
const browserSubscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: sim.evalWebPushSubscription("b1", 1).keys };

function setup(actorId = "account-a") {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const serviceForActor = (id: string) => createStoragePushDeviceService({ actorId: id, store: store as never, tokenVault, workspaceId: "push-web-test" });
  const actor = { id: actorId };
  const handlers = createPushTokenRouteHandlers({ env: EVAL, resolveActor: async () => actor, serviceForActor });
  const post = (body: unknown) => handlers.POST(new Request("http://localhost/api/devices/push-tokens", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" }));
  const get = (id: string) => handlers.GET(new Request("http://localhost"), { params: Promise.resolve({ id }) });
  return { actor, get, handlers, post, serviceForActor };
}

test("AG16-1: a browser that allowed notifications registers its subscription; only phones are listed for the senders written for phones", async () => {
  const { post, serviceForActor } = setup();
  const response = await post({ deviceId: "web:1", permission: "granted", platform: "web", subscription: { ...browserSubscription, expirationTime: null } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: Record<string, unknown> };
  assert.deepEqual([body.data.deviceId, body.data.platform, body.data.active], ["web:1", "web", true]);
  assert.equal(JSON.stringify(body).includes("fcm.googleapis.com"), false, "the subscription is not echoed");
  await post({ deviceId: "phone-1", permission: "granted", platform: "ios", token: "ExponentPushToken[abc]" });
  const service = serviceForActor("account-a");
  assert.deepEqual((await service.listActive()).map((device) => device.platform), ["ios"], "the senders written for phones never see a browser's subscription");
  const all = await service.listActive({ includeWeb: true });
  assert.deepEqual(all.map((device) => device.platform).sort(), ["ios", "web"]);
  assert.deepEqual(JSON.parse(all.find((device) => device.platform === "web")!.token), browserSubscription, "stored: the endpoint and the two keys, nothing else");
});

test("AG16-1: a browser that said no is not registered — and one that takes its permission back loses its registration", async () => {
  const { get, post, serviceForActor } = setup();
  const refused = await post({ deviceId: "web:1", permission: "denied", platform: "web" });
  assert.equal(refused.status, 200);
  assert.deepEqual((await refused.json() as { data: unknown }).data, { active: false, deviceId: "web:1", permission: "denied", platform: "web" });
  assert.equal((await serviceForActor("account-a").listActive({ includeWeb: true })).length, 0);
  assert.equal((await get("web:1")).status, 404, "nothing was stored for it");
  // A denied browser cannot be registered by sending a subscription along either.
  await post({ deviceId: "web:1", permission: "denied", platform: "web", subscription: browserSubscription });
  assert.equal((await serviceForActor("account-a").listActive({ includeWeb: true })).length, 0);

  await post({ deviceId: "web:2", permission: "granted", platform: "web", subscription: browserSubscription });
  assert.equal((await serviceForActor("account-a").listActive({ includeWeb: true })).length, 1);
  const takenBack = await post({ deviceId: "web:2", permission: "denied", platform: "web" });
  assert.equal(((await takenBack.json()) as { data: { active: boolean } }).data.active, false);
  assert.equal((await serviceForActor("account-a").listActive({ includeWeb: true })).length, 0);
  const state = (await (await get("web:2")).json() as { data: Record<string, unknown> }).data;
  assert.equal(agentPushDeviceStateSchema.safeParse(state).success, true);
  assert.deepEqual([state.active, state.revokedReason], [false, "user"]);
});

test("AG16-1: a browser registration needs a real subscription at a browser's push service", async () => {
  const { post } = setup();
  const bad = [
    { deviceId: "web:1", permission: "granted", platform: "web" },
    { deviceId: "web:1", permission: "granted", platform: "web", token: "ExponentPushToken[abc]" },
    { deviceId: "web:1", permission: "granted", platform: "web", subscription: { ...browserSubscription, endpoint: "https://evil.example/collect" } },
    { deviceId: "web:1", permission: "granted", platform: "web", subscription: { ...browserSubscription, endpoint: "http://169.254.169.254/latest" } },
    { deviceId: "web:1", permission: "granted", platform: "web", subscription: { endpoint: browserSubscription.endpoint, keys: { auth: "x", p256dh: "y" } } },
    { deviceId: "", permission: "granted", platform: "web", subscription: browserSubscription },
    { deviceId: "web:1", permission: "maybe", platform: "web" },
  ];
  for (const body of bad) {
    const response = await post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, "PUSH_DEVICE_INVALID");
  }
  // The local simulator is accepted only where the process runs as the eval.
  const simulator = sim.evalWebPushSubscription("web:1", 3230);
  assert.equal((await post({ deviceId: "web:1", permission: "granted", platform: "web", subscription: simulator })).status, 200);
  const production = createPushTokenRouteHandlers({ env: {} as NodeJS.ProcessEnv, resolveActor: async () => ({ id: "account-a" }), serviceForActor: setup().serviceForActor });
  assert.equal((await production.POST(new Request("http://localhost", { body: JSON.stringify({ deviceId: "web:1", permission: "granted", platform: "web", subscription: simulator }), method: "POST" }))).status, 400);
});

test("AG16-1 (视觉稿 16-3 ④): a device the push service refused says so until its owner allows it again — and only to its owner", async () => {
  const { actor, get, handlers, post, serviceForActor } = setup();
  await post({ deviceId: "web:1", permission: "granted", platform: "web", subscription: browserSubscription });
  let state = (await (await get("web:1")).json() as { data: Record<string, unknown> }).data;
  assert.deepEqual(state, { active: true, deviceId: "web:1", permission: "granted", platform: "web" });
  await serviceForActor("account-a").revoke("web:1", "provider_rejected");
  state = (await (await get("web:1")).json() as { data: Record<string, unknown> }).data;
  assert.deepEqual([state.active, state.revokedReason, typeof state.revokedAt], [false, "provider_rejected", "string"]);
  assert.equal(JSON.stringify(state).includes("fcm"), false);
  // Turning it off here afterwards does not hide why it stopped.
  await handlers.DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: "web:1" }) });
  assert.equal(((await (await get("web:1")).json()) as { data: { revokedReason: string } }).data.revokedReason, "provider_rejected");
  // Allowed again: a fresh registration.
  await post({ deviceId: "web:1", permission: "granted", platform: "web", subscription: browserSubscription });
  state = (await (await get("web:1")).json() as { data: Record<string, unknown> }).data;
  assert.deepEqual([state.active, state.revokedReason], [true, undefined]);
  // Another account asking for the same device id finds nothing.
  actor.id = "account-b";
  assert.equal((await get("web:1")).status, 404);
  const anonymous = createPushTokenRouteHandlers({ resolveActor: async () => null });
  assert.equal((await anonymous.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "web:1" }) })).status, 401);
});

test("AG16-1: the task page's own switch turns the reminder on for that one task, at once, and keeps what the task already told", async () => {
  const kit = createDispatchKit();
  const one = await createRule(kit.storage, "user:a", kit.now);
  const other = await createRule(kit.storage, "user:a", kit.now, { title: "每周五看看周末的设计活动" });
  const service = serviceFor(kit.storage, "user:a", kit.now);
  assert.equal(agentScheduledTaskReminderInputSchema.safeParse({ push: true, locale: "ja" }).success, true);
  assert.equal(agentScheduledTaskReminderInputSchema.safeParse({ push: "yes" }).success, false);
  assert.equal(agentScheduledTaskReminderInputSchema.safeParse({ push: true, title: "x" }).success, false, "nothing else can be changed through the switch");
  const on = await setTaskReminder(service, one.automationId, { push: true });
  // The switch only: the reminder's sentence follows the language of the task's results when it is sent.
  assert.deepEqual(on?.rule?.notify, { inApp: true, push: true });
  assert.deepEqual([on?.version, on?.rule?.toldFromVersion, on?.delivery], [2, 1, "push"]);
  assert.deepEqual((await service.get(other.automationId))?.rule?.notify, { inApp: true, push: false }, "the other task is untouched");
  assert.equal((await kit.storage.direct.due.get({ key: one.automationId, kind: "rule", ownerId: "user:a" }))?.version, 2, "the dispatcher's row carries the switch");
  const again = await setTaskReminder(service, one.automationId, { push: true });
  assert.equal(again?.version, 2, "already on: nothing changes");
  const off = await setTaskReminder(service, one.automationId, { push: false });
  assert.deepEqual([off?.rule?.notify, off?.version, off?.rule?.toldFromVersion], [{ inApp: true, push: false }, 3, 1]);
  assert.equal(await setTaskReminder(serviceFor(kit.storage, "user:b", kit.now), one.automationId, { push: true }), null, "another account's task does not resolve");
  assert.equal(await setTaskReminder(service, "rule:missing", { push: true }), null);
  // The route answers in the envelope both clients read (the App accepts only { success, data | error }).
  const route = fs.readFileSync(new URL("../../app/api/agent/automations/[id]/reminder/route.ts", import.meta.url), "utf8");
  assert.match(route, /NextResponse\.json\(\{ success: true, data: \{ task:/u);
  assert.equal((route.match(/\{ success: false, error: \{ code: "(VALIDATION_ERROR|NOT_FOUND)"/gu) ?? []).length, 2);
});

test("AG16-2: a reminder's id leads its signed-in owner to that period's inbox entry — and tells nobody else anything", async () => {
  const kit = createDispatchKit();
  const rule = await createRule(kit.storage, "user:a", kit.now, { rule: { notify: { inApp: true, push: true } } });
  await kit.dispatch("2026-11-20T09:10:00+09:00");
  const [run] = await kit.runs("user:a", rule.automationId);
  const deliveryId = pushDeliveryIdOf(run.runId);
  const target = await resolveRuleReminderTarget("user:a", deliveryId, kit.storage);
  assert.deepEqual(target, { body: "有新结果，请到 Orbit 查看。", href: `/inbox/notifications/${encodeURIComponent(run.delivery.inbox.inboxId!)}`, inboxId: run.delivery.inbox.inboxId, status: run.delivery.push.state, title: "Orbit" });
  assert.equal(await resolveRuleReminderTarget("user:b", deliveryId, kit.storage), null, "another account gets nothing, not even that it exists");
  assert.equal(await resolveRuleReminderTarget("user:a", "rule-push:not-an-id", kit.storage), null);
  assert.equal(await resolveRuleReminderTarget("user:a", "delivery:123", kit.storage), null);

  const handler = (actorId: string | null) => createNotificationDeliveryRouteHandler({
    resolveActor: async () => (actorId ? { id: actorId } : null),
    resolveRuleReminder: (id, delivery) => resolveRuleReminderTarget(id, delivery, kit.storage),
    serviceForActor: () => ({ get: async () => null }) as never,
  });
  const mine = await handler("user:a")(new Request("http://localhost"), { params: Promise.resolve({ id: deliveryId }) });
  assert.equal(mine.status, 200);
  const envelope = (await mine.json()) as { success?: unknown; data: Record<string, any> };
  // The App's client accepts only { success: true, data } (orbit-app src/api/client.ts isEnvelope); without it a tap on
  // the reminder showed 「这条提醒暂时无法读取」 on the Simulator.
  assert.equal(envelope.success, true);
  const body = envelope.data;
  assert.deepEqual(body.target, { deliveryId, href: target!.href, kind: "inbox", status: "available" });
  assert.deepEqual([body.deliveryId, body.data, body.title, body.body], [deliveryId, { deliveryId }, "Orbit", "有新结果，请到 Orbit 查看。"]);
  assert.equal(JSON.stringify(body).includes("E101"), false, "nothing of the result is in the answer");
  assert.equal((await handler("user:b")(new Request("http://localhost"), { params: Promise.resolve({ id: deliveryId }) })).status, 404);
  assert.equal((await handler(null)(new Request("http://localhost"), { params: Promise.resolve({ id: deliveryId }) })).status, 401);
});
