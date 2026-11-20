/**
 * This browser's side of reminders (agent-design AG16; 设计稿 §5.3; PLANNER 易错边界 2/6; 视觉稿 16-3).
 *
 * No interface lives here — the task pages call these:
 * - `readWebPushState()`   what this browser's line under the switch should say; it never asks the browser anything.
 * - `enableWebPush()`      only from the owner's click on "允许这个浏览器通知": asks the browser's permission, subscribes,
 *                          and registers the subscription with the server. A "no" is told to the server, which then
 *                          has no device for this browser.
 * - `disableWebPush()`     "不在这个浏览器上提醒": unsubscribes and revokes the registration.
 * - `syncWebPush()`        on opening the page, silently: keeps the server's registration in step with the browser
 *                          (a permission taken back in the browser settings, a subscription the browser replaced).
 *
 * Opening a page never makes the browser's permission prompt appear: `Notification.requestPermission` is called in
 * `enableWebPush` only.
 */

export const WEB_PUSH_SERVICE_WORKER = "/orbit-push-sw.js";
export const WEB_PUSH_DEVICE_KEY = "orbit.webPushDeviceId";

/**
 * unsupported: this browser cannot show reminders. unavailable: browser reminders are not set up on this server.
 * not_asked: the browser has not been asked (视觉稿 ①). on: allowed and registered (②). blocked: the owner said no in the
 * browser (③). stopped: allowed before, later refused by the push service — found out when a reminder could not be
 * sent (④). off: allowed in the browser but not registered (turned off here, or never finished).
 */
export type WebPushState = "unsupported" | "unavailable" | "not_asked" | "on" | "blocked" | "stopped" | "off";

export interface WebPushSubscriptionLike {
  endpoint: string;
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
}

export interface WebPushBrowser {
  /** `Notification.permission`; null when the browser has no notifications. */
  permission(): "default" | "granted" | "denied" | null;
  requestPermission(): Promise<"default" | "granted" | "denied">;
  /** Registers the service worker and returns its push manager; null when the browser has no push. */
  pushManager(): Promise<{
    getSubscription(): Promise<WebPushSubscriptionLike | null>;
    subscribe(options: { userVisibleOnly: true; applicationServerKey: Uint8Array }): Promise<WebPushSubscriptionLike>;
  } | null>;
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  fetch(path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
  randomId(): string;
}

/** The real browser. Null on the server and in browsers without service workers, push or notifications. */
export function browserWebPush(): WebPushBrowser | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return null;
  return {
    fetch: (path, init) => fetch(path, { ...init, credentials: "same-origin" }),
    permission: () => Notification.permission,
    async pushManager() {
      const registration = await navigator.serviceWorker.register(WEB_PUSH_SERVICE_WORKER, { scope: "/" });
      return registration.pushManager as never;
    },
    randomId: () => crypto.randomUUID(),
    requestPermission: () => Notification.requestPermission(),
    storage: window.localStorage,
  };
}

/** This browser's stable id for its registration (made once, kept in this browser only). */
export function webPushDeviceId(browser: WebPushBrowser, create = true): string | null {
  const existing = browser.storage.getItem(WEB_PUSH_DEVICE_KEY);
  if (existing || !create) return existing;
  const made = `web:${browser.randomId()}`;
  browser.storage.setItem(WEB_PUSH_DEVICE_KEY, made);
  return made;
}

export function applicationServerKey(publicKey: string): Uint8Array {
  const padded = publicKey.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(publicKey.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

async function publicKeyOf(browser: WebPushBrowser): Promise<string | null> {
  const response = await browser.fetch("/api/devices/web-push");
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: { publicKey?: string | null } };
  return typeof body.data?.publicKey === "string" && body.data.publicKey ? body.data.publicKey : null;
}

interface ServerDevice {
  active?: boolean;
  revokedReason?: "user" | "provider_rejected";
}

async function serverDevice(browser: WebPushBrowser, deviceId: string): Promise<ServerDevice | null> {
  const response = await browser.fetch(`/api/devices/push-tokens/${encodeURIComponent(deviceId)}`);
  if (!response.ok) return null;
  return ((await response.json()) as { data?: ServerDevice }).data ?? null;
}

const post = (browser: WebPushBrowser, body: Record<string, unknown>) => browser.fetch("/api/devices/push-tokens", { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });

async function register(browser: WebPushBrowser, deviceId: string, subscription: WebPushSubscriptionLike): Promise<boolean> {
  return (await post(browser, { deviceId, permission: "granted", platform: "web", subscription: subscription.toJSON() })).ok;
}

/** What this browser's line should say. Reads only; the browser's own prompt never appears because of this. */
export async function readWebPushState(browser: WebPushBrowser | null = browserWebPush()): Promise<WebPushState> {
  if (!browser) return "unsupported";
  const permission = browser.permission();
  if (permission === null) return "unsupported";
  if (permission === "denied") return "blocked";
  if (!(await publicKeyOf(browser))) return "unavailable";
  const deviceId = webPushDeviceId(browser, false);
  const device = deviceId ? await serverDevice(browser, deviceId) : null;
  // Found out by a reminder that could not be sent: said until the owner allows this browser again.
  if (device && !device.active && device.revokedReason === "provider_rejected") return "stopped";
  if (permission === "default") return "not_asked";
  return device?.active ? "on" : "off";
}

/**
 * The owner pressed "允许这个浏览器通知" (or "重新允许"). The browser's own prompt appears here and nowhere else.
 */
export async function enableWebPush(browser: WebPushBrowser | null = browserWebPush()): Promise<WebPushState> {
  if (!browser || browser.permission() === null) return "unsupported";
  const publicKey = await publicKeyOf(browser);
  if (!publicKey) return "unavailable";
  const deviceId = webPushDeviceId(browser)!;
  const permission = browser.permission() === "granted" ? "granted" : await browser.requestPermission();
  if (permission !== "granted") {
    // Refused (or the prompt was closed): this browser is not a device to send to.
    await post(browser, { deviceId, permission: permission === "denied" ? "denied" : "undetermined", platform: "web" }).catch(() => undefined);
    return permission === "denied" ? "blocked" : "not_asked";
  }
  const manager = await browser.pushManager();
  if (!manager) return "unsupported";
  const subscription = (await manager.getSubscription()) ?? (await manager.subscribe({ applicationServerKey: applicationServerKey(publicKey), userVisibleOnly: true }));
  return (await register(browser, deviceId, subscription)) ? "on" : "off";
}

/** "不在这个浏览器上提醒": the subscription is dropped in the browser and the registration revoked on the server. */
export async function disableWebPush(browser: WebPushBrowser | null = browserWebPush()): Promise<WebPushState> {
  if (!browser || browser.permission() === null) return "unsupported";
  const deviceId = webPushDeviceId(browser, false);
  const manager = browser.permission() === "granted" ? await browser.pushManager().catch(() => null) : null;
  await (await manager?.getSubscription())?.unsubscribe().catch(() => false);
  if (deviceId) await browser.fetch(`/api/devices/push-tokens/${encodeURIComponent(deviceId)}`, { method: "DELETE" }).catch(() => undefined);
  return browser.permission() === "denied" ? "blocked" : browser.permission() === "default" ? "not_asked" : "off";
}

/**
 * Signing out (orbit-sign-out.ts): a browser that took reminders stops them while the session still exists, so the next
 * person on this computer is not reminded of the last one's tasks. A browser that never registered is not touched (no
 * request, no service worker), and a slow network never holds the sign-out longer than `limitMs`.
 */
export async function forgetWebPushOnSignOut(browser: WebPushBrowser | null = browserWebPush(), limitMs = 2_000): Promise<void> {
  if (!browser || browser.permission() === null || !webPushDeviceId(browser, false)) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    disableWebPush(browser).catch(() => undefined),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, limitMs); }),
  ]);
  if (timer) clearTimeout(timer);
}

/**
 * On opening the page, without asking anything: a browser that once registered and no longer allows notifications is
 * reported (its registration is revoked); a browser that is registered re-sends its current subscription, which the
 * browser may have replaced. A browser the owner turned off here stays off.
 */
export async function syncWebPush(browser: WebPushBrowser | null = browserWebPush()): Promise<WebPushState> {
  if (!browser) return "unsupported";
  const permission = browser.permission();
  if (permission === null) return "unsupported";
  const deviceId = webPushDeviceId(browser, false);
  if (!deviceId) return readWebPushState(browser);
  if (permission !== "granted") {
    await post(browser, { deviceId, permission: permission === "denied" ? "denied" : "undetermined", platform: "web" }).catch(() => undefined);
    return readWebPushState(browser);
  }
  const device = await serverDevice(browser, deviceId);
  if (device?.active) {
    const subscription = await (await browser.pushManager())?.getSubscription();
    // The browser dropped its subscription (site data cleared): nothing can be sent there any more.
    if (!subscription) await browser.fetch(`/api/devices/push-tokens/${encodeURIComponent(deviceId)}`, { method: "DELETE" }).catch(() => undefined);
    else await register(browser, deviceId, subscription);
  }
  return readWebPushState(browser);
}
