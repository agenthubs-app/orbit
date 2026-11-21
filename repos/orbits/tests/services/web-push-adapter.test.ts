import assert from "node:assert/strict";
import { createECDH, createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";

import { createRulePushChannel } from "../../features/agent/automations/push-configured";
import { rulePushMessage } from "../../features/agent/automations/push";
import { createConfiguredWebPushAdapter, parseWebPushSubscription, webPushConfig, webPushEndpointAllowed, webPushPublicKey, webPushTokenOf } from "../../features/notifications/web-push-adapter";
import { evalVapidKeys } from "../agent-eval/lib/env-guard";

/**
 * agent-design AG16-2 (PLANNER 易错边界 3/6/7): what a browser is sent. No real push service is contacted: the adapter's
 * request is taken by a local stand-in that plays the browser — it holds the subscription's private key and decrypts
 * the message (the same code the eval's push simulator runs).
 */
const sim = createRequire(import.meta.url)("../agent-eval/preload/web-push-sim.cjs") as {
  decryptWebPush(body: Buffer, keys: { ecdh: ReturnType<typeof createECDH>; auth: string }): string;
  evalWebPushKeys(deviceId: string): { ecdh: ReturnType<typeof createECDH>; auth: string; p256dh: string };
  evalWebPushSubscription(deviceId: string, port: number): { endpoint: string; keys: { p256dh: string; auth: string } };
};

const ENV = { ...evalVapidKeys("unit-test-secret"), ORBIT_AGENT_EVAL: "1", ORBIT_WEB_PUSH_SUBJECT: "mailto:agent-eval@orbit.test" } as unknown as NodeJS.ProcessEnv;
const RUN = `autorun:${createHash("sha256").update("run").digest("hex").slice(0, 32)}`;

function standIn(status = 201) {
  const requests: { url: string; headers: Record<string, string>; body: Buffer; method: string }[] = [];
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ body: Buffer.from(init?.body as Uint8Array), headers: init?.headers as Record<string, string>, method: String(init?.method), url: String(url) });
    return new Response(null, { headers: status === 201 ? { location: "https://push.example/message/abc123" } : {}, status });
  }) as typeof fetch;
  return { fetchImplementation, requests };
}

test("AG16-2: the encrypted message a browser gets holds the fixed title, the fixed sentence and the opaque id — and no other field", async () => {
  const { fetchImplementation, requests } = standIn();
  const adapter = createConfiguredWebPushAdapter(ENV, fetchImplementation)!;
  const subscription = sim.evalWebPushSubscription("device-1", 3230);
  const ticket = await adapter.send({ ...rulePushMessage("zh", RUN), platform: "web", token: webPushTokenOf(subscription) });
  assert.deepEqual(ticket, { receiptId: "web:abc123", verified: true }, "Web Push has no receipts: the accepted ticket is final");
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request.url, subscription.endpoint);
  assert.equal(request.method, "POST");
  assert.equal(request.headers["Content-Encoding"], "aes128gcm");
  assert.equal(request.headers.TTL, String(12 * 3600));
  assert.equal(request.headers.Topic, RUN.slice("autorun:".length), "a later round replaces one still waiting at the push service");
  assert.equal(request.body.includes(Buffer.from("Orbit")), false, "nothing readable travels: the body is encrypted for this browser");
  const message = JSON.parse(sim.decryptWebPush(request.body, sim.evalWebPushKeys("device-1")));
  assert.deepEqual(message, { body: "有新结果，请到 Orbit 查看。", data: { deliveryId: `rule-push:${RUN.slice("autorun:".length)}` }, title: "Orbit" });
  // Signed with this deployment's VAPID key: the audience is the push service, the subject is how to reach us.
  const authorization = request.headers.Authorization;
  assert.match(authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/u);
  assert.equal(authorization.split("k=")[1], ENV.ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY);
  const claims = JSON.parse(Buffer.from(authorization.split("t=")[1].split(",")[0].split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.aud, "http://127.0.0.1:3230");
  assert.equal(claims.sub, "mailto:agent-eval@orbit.test");
  assert.equal(JSON.stringify(request.headers).includes(String(ENV.ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY)), false);
  // Another browser cannot read it.
  assert.throws(() => sim.decryptWebPush(request.body, sim.evalWebPushKeys("device-2")));
});

test("AG16-1: what the push service answers decides what happens next — gone revokes, a refusal may be sent again, no answer is never sent again", async () => {
  const token = webPushTokenOf(sim.evalWebPushSubscription("device-1", 3230));
  const send = async (status: number) => {
    try {
      await createConfiguredWebPushAdapter(ENV, standIn(status).fetchImplementation)!.send({ ...rulePushMessage("en", RUN), platform: "web", token });
      return null;
    } catch (error) {
      return error as Error & { notAccepted?: boolean };
    }
  };
  for (const status of [404, 410]) {
    const error = await send(status);
    assert.equal(error?.notAccepted, true);
    assert.match(error!.message, /DeviceNotRegistered/u, `${status}: the subscription is gone`);
  }
  for (const status of [400, 401, 403, 429]) {
    const error = await send(status);
    assert.equal(error?.notAccepted, true, `${status} is an explicit refusal`);
    assert.doesNotMatch(error!.message, /DeviceNotRegistered/u);
  }
  assert.match((await send(413))!.message, /MessageTooBig/u);
  for (const status of [500, 502, 503]) assert.equal((await send(status))?.notAccepted, undefined, `${status}: unknown, it may still arrive`);
  const failing = createConfiguredWebPushAdapter(ENV, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch)!;
  await assert.rejects(failing.send({ ...rulePushMessage("en", RUN), platform: "web", token }), (error: Error & { notAccepted?: boolean }) => error.notAccepted === undefined);
  // A token that is not a subscription this server sends to: refused for good, nothing is requested.
  const { fetchImplementation, requests } = standIn();
  await assert.rejects(createConfiguredWebPushAdapter(ENV, fetchImplementation)!.send({ ...rulePushMessage("en", RUN), platform: "web", token: "ExponentPushToken[abc]" }), /DeviceNotRegistered/u);
  assert.equal(requests.length, 0);
});

test("AG16: the server posts only to browsers' push services — a client cannot make it call anything else", () => {
  const production = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"]) {
    assert.equal(webPushEndpointAllowed(endpoint, production), true, endpoint);
  }
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/abc", "https://fcm.googleapis.com.evil.example/abc", "https://evil.example/fcm.googleapis.com", "https://169.254.169.254/latest/meta-data", "https://localhost/abc",
    "http://127.0.0.1:3230/__agent-eval/push/web/device-1", "https://user:pass@fcm.googleapis.com/abc", "https://fcm.googleapis.com:8443/abc", "file:///etc/passwd", "not a url",
  ]) assert.equal(webPushEndpointAllowed(endpoint, production), false, endpoint);
  // The eval's own simulator, on this machine, only when the process runs as the eval.
  assert.equal(webPushEndpointAllowed("http://127.0.0.1:3230/__agent-eval/push/web/device-1", ENV), true);
  assert.equal(webPushEndpointAllowed("http://127.0.0.1:3230/api/internal/anything", ENV), false);
  assert.equal(webPushEndpointAllowed("http://10.0.0.5:3230/__agent-eval/push/web/device-1", ENV), false);

  const keys = { auth: randomBytes(16).toString("base64url"), p256dh: (() => { const ecdh = createECDH("prime256v1"); ecdh.generateKeys(); return ecdh.getPublicKey().toString("base64url"); })() };
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys };
  assert.deepEqual(parseWebPushSubscription(good, production), good);
  assert.deepEqual(parseWebPushSubscription(JSON.stringify({ ...good, expirationTime: null, extra: "dropped" }), production), good, "only the endpoint and the two keys are kept");
  assert.equal(parseWebPushSubscription({ ...good, endpoint: "https://evil.example/x" }, production), null);
  assert.equal(parseWebPushSubscription({ endpoint: good.endpoint, keys: { ...keys, auth: "short" } }, production), null);
  assert.equal(parseWebPushSubscription({ endpoint: good.endpoint, keys: { ...keys, p256dh: keys.auth } }, production), null);
  assert.equal(parseWebPushSubscription({ endpoint: good.endpoint }, production), null);
  assert.equal(parseWebPushSubscription("ExponentPushToken[abc]", production), null);
});

test("AG16: browser reminders are off unless this deployment has its own key pair and a way to be reached", () => {
  assert.equal(createConfiguredWebPushAdapter({} as NodeJS.ProcessEnv), null);
  assert.equal(webPushPublicKey({} as NodeJS.ProcessEnv), null);
  const keys = evalVapidKeys("another");
  assert.equal(webPushConfig({ ...keys } as unknown as NodeJS.ProcessEnv), null, "no subject, no site address");
  assert.equal(webPushConfig({ ...keys, AUTH_URL: "http://localhost:3000" } as unknown as NodeJS.ProcessEnv), null, "a local address is not a contact");
  assert.equal(webPushConfig({ ...keys, AUTH_URL: "https://orbit.example" } as unknown as NodeJS.ProcessEnv)?.subject, "https://orbit.example");
  assert.equal(webPushConfig({ ...keys, ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY: "not-a-key", ORBIT_WEB_PUSH_SUBJECT: "mailto:a@b.c" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(webPushPublicKey(ENV), ENV.ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY);
  assert.notEqual(evalVapidKeys("a").ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY, evalVapidKeys("b").ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY, "each machine's eval derives its own pair");
});

test("AG16: a reminder goes through the channel of its device — a browser's never reaches Expo, a phone's never Web Push", async () => {
  const calls: string[] = [];
  const adapter = (name: string, receipts: boolean) => ({ ...(receipts ? { getReceipt: async () => ({ status: "ok" as const }) } : {}), send: async (message: { token: string }) => { calls.push(`${name}:${message.token}`); return { receiptId: `${name}-1` }; } });
  const channel = createRulePushChannel({ expo: adapter("expo", true), web: adapter("web", false) })!;
  await channel.send({ ...rulePushMessage("zh", RUN), platform: "web", token: "W" });
  await channel.send({ ...rulePushMessage("zh", RUN), platform: "ios", token: "I" });
  await channel.send({ ...rulePushMessage("zh", RUN), platform: "android", token: "A" });
  assert.deepEqual(calls, ["web:W", "expo:I", "expo:A"]);
  assert.deepEqual([channel.hasReceipts?.("ios"), channel.hasReceipts?.("web")], [true, false]);
  const phonesOnly = createRulePushChannel({ expo: adapter("expo", true), web: null })!;
  assert.deepEqual([phonesOnly.supports("ios"), phonesOnly.supports("web")], [true, false]);
  await assert.rejects(phonesOnly.send({ ...rulePushMessage("zh", RUN), platform: "web", token: "W" }));
  assert.equal(createRulePushChannel({ expo: null, web: null }), null);
});
