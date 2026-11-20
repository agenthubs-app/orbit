import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { applicationServerKey, disableWebPush, enableWebPush, forgetWebPushOnSignOut, readWebPushState, syncWebPush, WEB_PUSH_DEVICE_KEY, type WebPushBrowser } from "../../app/(app)/app/orbit-2026/account/web-push-client";

/**
 * agent-design AG16-1 (PLANNER 易错边界 2/6; 视觉稿 16-3, D16-3): the browser's side, without a browser. The permission
 * prompt appears only from the owner's own press; a "no" registers nothing; turning it off or losing the permission
 * revokes the registration. And the service worker: two events, the server's fixed words, a click that can only open
 * Orbit's own inbox.
 */

function fakeBrowser(start: { permission?: "default" | "granted" | "denied" | null; answer?: "default" | "granted" | "denied"; publicKey?: string | null } = {}) {
  const state = {
    asked: 0,
    calls: [] as { method: string; path: string; body: any }[],
    device: null as null | { active: boolean; revokedReason?: "user" | "provider_rejected" },
    permission: start.permission === undefined ? ("default" as "default" | "granted" | "denied" | null) : start.permission,
    storage: new Map<string, string>(),
    subscribed: 0,
    subscription: null as null | { endpoint: string; unsubscribed: boolean },
  };
  const subscriptionOf = () => state.subscription && !state.subscription.unsubscribed ? { endpoint: state.subscription.endpoint, toJSON: () => ({ endpoint: state.subscription!.endpoint, keys: { auth: "a", p256dh: "p" } }), unsubscribe: async () => { state.subscription!.unsubscribed = true; return true; } } : null;
  const browser: WebPushBrowser = {
    async fetch(pathname, init) {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body) : null;
      state.calls.push({ body, method, path: pathname });
      const json = (data: unknown, status = 200) => ({ json: async () => data, ok: status < 300, status });
      if (pathname === "/api/devices/web-push") return json({ data: { publicKey: start.publicKey === undefined ? "BPublicKey_abc-123" : start.publicKey } });
      if (pathname === "/api/devices/push-tokens" && method === "POST") {
        if (body.permission === "granted") state.device = { active: true };
        else if (state.device) state.device = { active: false, revokedReason: state.device.revokedReason ?? "user" };
        return json({ data: {} });
      }
      if (method === "DELETE") {
        if (state.device) state.device = { active: false, revokedReason: state.device.revokedReason ?? "user" };
        return json({ data: {} });
      }
      return state.device ? json({ data: state.device }) : json({ error: {} }, 404);
    },
    permission: () => state.permission,
    async pushManager() {
      return {
        getSubscription: async () => subscriptionOf(),
        async subscribe(options) {
          assert.equal(options.userVisibleOnly, true);
          assert.ok(options.applicationServerKey instanceof Uint8Array);
          state.subscribed += 1;
          state.subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", unsubscribed: false };
          return subscriptionOf()!;
        },
      };
    },
    randomId: () => "11111111-2222-3333-4444-555555555555",
    async requestPermission() {
      state.asked += 1;
      state.permission = start.answer ?? "granted";
      return state.permission;
    },
    storage: { getItem: (key) => state.storage.get(key) ?? null, setItem: (key, value) => void state.storage.set(key, value) },
  };
  return { browser, state };
}

test("D16-3: opening the page never asks the browser — reading the state and syncing make no permission prompt", async () => {
  const { browser, state } = fakeBrowser();
  assert.equal(await readWebPushState(browser), "not_asked");
  assert.equal(await syncWebPush(browser), "not_asked");
  assert.equal(state.asked, 0, "no prompt");
  assert.equal(state.storage.has(WEB_PUSH_DEVICE_KEY), false, "nothing is made for a browser that was never asked");
  assert.deepEqual(state.calls.filter((call) => call.method !== "GET"), [], "and nothing is written to the server");
});

test("the owner presses the button: the browser asks, the subscription is registered, the line says this browser will be reminded", async () => {
  const { browser, state } = fakeBrowser();
  assert.equal(await enableWebPush(browser), "on");
  assert.equal(state.asked, 1);
  assert.equal(state.subscribed, 1);
  const registered = state.calls.find((call) => call.method === "POST")!;
  assert.deepEqual(registered.body, { deviceId: "web:11111111-2222-3333-4444-555555555555", permission: "granted", platform: "web", subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { auth: "a", p256dh: "p" } } });
  assert.equal(await readWebPushState(browser), "on");
  // Pressing again does not ask again and does not subscribe twice.
  assert.equal(await enableWebPush(browser), "on");
  assert.deepEqual([state.asked, state.subscribed], [1, 1]);
});

test("the owner says no in the browser's prompt: nothing is subscribed, the server has no device, the line says blocked", async () => {
  const { browser, state } = fakeBrowser({ answer: "denied" });
  assert.equal(await enableWebPush(browser), "blocked");
  assert.equal(state.subscribed, 0);
  assert.deepEqual(state.calls.filter((call) => call.method === "POST").map((call) => [call.body.permission, call.body.subscription]), [["denied", undefined]]);
  assert.equal(await readWebPushState(browser), "blocked");
  // Closing the prompt without choosing leaves it "not asked".
  const closed = fakeBrowser({ answer: "default" });
  assert.equal(await enableWebPush(closed.browser), "not_asked");
});

test("'不在这个浏览器上提醒' drops the subscription and the registration; a permission taken back later is reported when the page opens", async () => {
  const { browser, state } = fakeBrowser();
  await enableWebPush(browser);
  assert.equal(await disableWebPush(browser), "off");
  assert.equal(state.subscription?.unsubscribed, true);
  assert.deepEqual(state.device, { active: false, revokedReason: "user" });
  assert.equal(await syncWebPush(browser), "off", "turned off here stays off: opening the page does not turn it back on");
  assert.equal(state.device?.active, false);

  const other = fakeBrowser();
  await enableWebPush(other.browser);
  other.state.permission = "denied";
  assert.equal(await syncWebPush(other.browser), "blocked");
  assert.deepEqual(other.state.device, { active: false, revokedReason: "user" });
  assert.equal(other.state.asked, 1, "only the first press asked");
});

test("视觉稿 16-3 ④: a browser the push service refused says 'stopped' until the owner allows it again", async () => {
  const { browser, state } = fakeBrowser();
  await enableWebPush(browser);
  state.device = { active: false, revokedReason: "provider_rejected" };
  assert.equal(await readWebPushState(browser), "stopped");
  assert.equal(await syncWebPush(browser), "stopped", "opening the page does not quietly register it again");
  assert.equal(await enableWebPush(browser), "on", "'重新允许' registers it again");
  assert.equal(await readWebPushState(browser), "on");
});

test("signing out: a browser that took reminders stops them before the session ends; one that never did is not touched; a slow network does not hold the sign-out", async () => {
  const taken = fakeBrowser();
  assert.equal(await enableWebPush(taken.browser), "on");
  taken.state.calls.length = 0;
  await forgetWebPushOnSignOut(taken.browser);
  assert.equal(taken.state.subscription?.unsubscribed, true, "the subscription is dropped");
  assert.ok(taken.state.calls.some((call) => call.method === "DELETE" && call.path.startsWith("/api/devices/push-tokens/")), "and the registration revoked while still signed in");
  assert.equal(taken.state.asked, 1, "no new prompt");

  const never = fakeBrowser({ permission: "granted" });
  await forgetWebPushOnSignOut(never.browser);
  assert.deepEqual(never.state.calls, [], "never registered here: no request and no service worker");
  await forgetWebPushOnSignOut(null);

  const slow = fakeBrowser();
  await enableWebPush(slow.browser);
  slow.browser.fetch = () => new Promise(() => undefined);
  const started = Date.now();
  await forgetWebPushOnSignOut(slow.browser, 50);
  assert.ok(Date.now() - started < 1_000, "the sign-out goes on");
});

test("a browser without notifications, or a server without browser reminders set up, asks for nothing", async () => {
  assert.equal(await readWebPushState(null), "unsupported");
  assert.equal(await enableWebPush(null), "unsupported");
  const none = fakeBrowser({ permission: null });
  assert.equal(await readWebPushState(none.browser), "unsupported");
  const unset = fakeBrowser({ publicKey: null });
  assert.equal(await readWebPushState(unset.browser), "unavailable");
  assert.equal(await enableWebPush(unset.browser), "unavailable");
  assert.equal(unset.state.asked, 0, "the browser is not asked for a permission that could not be used");
  assert.deepEqual([...applicationServerKey("AQID_-8")], [1, 2, 3, 255, 239]);
});

// ── the service worker ──

function loadWorker() {
  const listeners = new Map<string, (event: any) => void>();
  const shown: { title: string; options: any }[] = [];
  const opened: string[] = [];
  const windows: { url: string; navigated: string[]; focused: number; navigate(url: string): Promise<any>; focus(): Promise<any> }[] = [];
  const self = {
    addEventListener: (name: string, handler: (event: any) => void) => void listeners.set(name, handler),
    clients: { matchAll: async () => windows, openWindow: async (url: string) => void opened.push(url) },
    location: { origin: "https://orbit.example" },
    registration: { showNotification: async (title: string, options: any) => void shown.push({ options, title }) },
  };
  const source = fs.readFileSync(path.join(process.cwd(), "public/orbit-push-sw.js"), "utf8");
  vm.runInNewContext(source, { self, URL });
  const fire = async (name: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(name)!({ ...event, waitUntil: (promise: Promise<unknown>) => void waits.push(promise) });
    await Promise.all(waits);
  };
  return { fire, listeners, opened, shown, source, windows };
}

test("the service worker handles push and notificationclick and nothing else — no fetch handler, no cache, no import", () => {
  const worker = loadWorker();
  assert.deepEqual([...worker.listeners.keys()].sort(), ["notificationclick", "push"]);
  const code = worker.source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
  for (const word of ["fetch", "caches", "importScripts", "indexedDB", "postMessage", "skipWaiting"]) assert.equal(code.includes(word), false, `${word} is not used`);
});

test("push shows exactly what the server sent — the fixed title and sentence — and keeps only the opaque id", async () => {
  const worker = loadWorker();
  const deliveryId = "rule-push:0123456789abcdef0123456789abcdef";
  await worker.fire("push", { data: { json: () => ({ body: "有新结果，请到 Orbit 查看。", data: { deliveryId, url: "https://evil.example", extra: "x" }, title: "Orbit", url: "https://evil.example" }) } });
  // (Objects made inside the worker's own context: compared by value.)
  assert.deepEqual(JSON.parse(JSON.stringify(worker.shown)), [{ options: { body: "有新结果，请到 Orbit 查看。", data: { deliveryId }, tag: deliveryId }, title: "Orbit" }]);
  // A message that cannot be read still shows only the product's name.
  await worker.fire("push", { data: { json: () => { throw new Error("not json"); } } });
  await worker.fire("push", { data: null });
  assert.deepEqual(worker.shown.slice(1).map((item) => [item.title, item.options.body, item.options.data.deliveryId]), [["Orbit", "", null], ["Orbit", "", null]]);
});

test("a click opens Orbit's own inbox and nowhere else, whatever the message held", async () => {
  const worker = loadWorker();
  let closed = 0;
  const notification = (data: unknown) => ({ close: () => void (closed += 1), data });
  await worker.fire("notificationclick", { notification: notification({ deliveryId: "rule-push:0123456789abcdef0123456789abcdef", url: "https://evil.example" }) });
  assert.deepEqual(worker.opened, ["https://orbit.example/app/inbox?tab=notifications&delivery=rule-push%3A0123456789abcdef0123456789abcdef"]);
  await worker.fire("notificationclick", { notification: notification({ deliveryId: "https://evil.example/?x=1" }) });
  await worker.fire("notificationclick", { notification: notification(null) });
  assert.deepEqual(worker.opened.slice(1), ["https://orbit.example/app/inbox?tab=notifications", "https://orbit.example/app/inbox?tab=notifications"]);
  assert.equal(closed, 3);
  // An Orbit window that is already open is used; a window of another site is never navigated.
  const make = (url: string) => { const client = { focused: 0, navigated: [] as string[], url, navigate: async (target: string) => { client.navigated.push(target); return client; }, focus: async () => { client.focused += 1; return client; } }; return client; };
  const foreign = make("https://other.example/page");
  const own = make("https://orbit.example/app/contacts");
  worker.windows.push(foreign, own);
  await worker.fire("notificationclick", { notification: notification({ deliveryId: "rule-push:0123456789abcdef0123456789abcdef" }) });
  assert.deepEqual([foreign.navigated.length, own.navigated.length, own.focused, worker.opened.length], [0, 1, 1, 3]);
  assert.match(own.navigated[0], /^https:\/\/orbit\.example\/app\/inbox\?tab=notifications&delivery=/u);
});
