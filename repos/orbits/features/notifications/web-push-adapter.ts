/**
 * Web Push for browsers (agent-design AG16; 设计稿 §5.3; PLANNER 易错边界 6/7).
 *
 * A browser's "token" is its push subscription: the push service's endpoint and the two keys the browser made. The
 * message is encrypted for that browser (RFC 8291, aes128gcm) and signed with this deployment's VAPID key pair
 * (RFC 8292) by the `web-push` library; this file sends the request itself, so that the timeout and the meaning of each
 * answer are the same as for the Expo adapter:
 * - 2xx: the push service took it (Web Push has no receipts — the ticket is final);
 * - 404 / 410: the subscription is gone (permission taken away, site data cleared): an explicit refusal that reads
 *   `DeviceNotRegistered`, so the caller revokes the device;
 * - other 4xx and 429: an explicit refusal (may be sent again);
 * - 5xx, a timeout, no answer: unknown — never sent again.
 *
 * The endpoint comes from the client, and the server posts to it: only the push services of the browsers are allowed
 * (https, known hosts). The agent eval adds its local simulator; nothing else may.
 */
import webpush from "web-push";

import type { OrbitPushAdapter } from "./push-adapter";

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The push services browsers hand out subscriptions for (Chrome/Edge/Opera/Brave, Firefox, Safari, Edge on Windows). */
const PUSH_SERVICE_HOSTS = [/^fcm\.googleapis\.com$/u, /^updates\.push\.services\.mozilla\.com$/u, /^[a-z0-9-]+\.push\.apple\.com$/u, /^[a-z0-9-]+\.notify\.windows\.com$/u];

const BASE64URL = /^[A-Za-z0-9_-]+$/u;

/**
 * The agent eval's local push simulator (tests/agent-eval/preload): allowed only when the process runs as the eval
 * (`ORBIT_AGENT_EVAL=1`) and only on this machine. A production build never has that flag.
 */
function evalSimulatorEndpoint(url: URL, env: NodeJS.ProcessEnv): boolean {
  return env.ORBIT_AGENT_EVAL === "1" && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost") && url.pathname.startsWith("/__agent-eval/push/web/");
}

export function webPushEndpointAllowed(endpoint: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (evalSimulatorEndpoint(url, env)) return true;
  return url.protocol === "https:" && (url.port === "" || url.port === "443") && PUSH_SERVICE_HOSTS.some((host) => host.test(url.hostname));
}

/**
 * A browser subscription as registered: an allowed endpoint and the browser's two keys (base64url; p256dh is a 65-byte
 * P-256 point, auth is 16 bytes). Null: not a subscription this server will send to.
 */
export function parseWebPushSubscription(value: unknown, env: NodeJS.ProcessEnv = process.env): WebPushSubscription | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > 2048 || !webPushEndpointAllowed(endpoint, env)) return null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  if (!BASE64URL.test(keys.p256dh) || !BASE64URL.test(keys.auth)) return null;
  if (Buffer.from(keys.p256dh, "base64url").length !== 65 || Buffer.from(keys.auth, "base64url").length !== 16) return null;
  return { endpoint, keys: { auth: keys.auth, p256dh: keys.p256dh } };
}

/** What is stored as the device's token: the subscription and nothing else the client sent. */
export function webPushTokenOf(subscription: WebPushSubscription): string {
  return JSON.stringify({ endpoint: subscription.endpoint, keys: { auth: subscription.keys.auth, p256dh: subscription.keys.p256dh } });
}

export interface WebPushConfig {
  publicKey: string;
  privateKey: string;
  /** VAPID `sub`: how a push service can reach whoever runs this server (a mailto: or https: address). */
  subject: string;
}

/**
 * The key pair is made on the machine that runs the server and never committed (CONVENTIONS §2). The subject is
 * `ORBIT_WEB_PUSH_SUBJECT`, or the site's own address (`AUTH_URL` / `NEXTAUTH_URL`) when that is https. Null: browser
 * reminders are not set up in this deployment.
 */
export function webPushConfig(env: NodeJS.ProcessEnv = process.env): WebPushConfig | null {
  const publicKey = env.ORBIT_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.ORBIT_WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey || !BASE64URL.test(publicKey) || !BASE64URL.test(privateKey)) return null;
  if (Buffer.from(publicKey, "base64url").length !== 65 || Buffer.from(privateKey, "base64url").length !== 32) return null;
  const site = (env.AUTH_URL ?? env.NEXTAUTH_URL)?.trim();
  const subject = env.ORBIT_WEB_PUSH_SUBJECT?.trim() || (site?.startsWith("https://") ? site : "");
  if (!/^(mailto:.+@.+|https:\/\/.+)$/u.test(subject)) return null;
  return { privateKey, publicKey, subject };
}

/** The public half, which the browser needs to subscribe; null when browser reminders are not set up. */
export function webPushPublicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return webPushConfig(env)?.publicKey ?? null;
}

function refusal(status: number, detail: string, gone: boolean): Error {
  const error = new Error(`Web push adapter returned HTTP ${status}: ${gone ? "DeviceNotRegistered" : detail}`);
  return Object.assign(error, { notAccepted: true });
}

export function createConfiguredWebPushAdapter(env: NodeJS.ProcessEnv = process.env, fetchImplementation: typeof fetch = fetch): OrbitPushAdapter | null {
  const config = webPushConfig(env);
  if (!config) return null;
  return {
    async send(message) {
      const subscription = parseWebPushSubscription(message.token, env);
      // Not a subscription this server sends to: an explicit, permanent refusal — the registration is revoked.
      if (!subscription) throw refusal(400, "", true);
      // The whole payload: the fixed title and sentence the caller gave, and its opaque data. Nothing is added here.
      const payload = JSON.stringify({ body: message.body, data: message.data, title: message.title });
      const topic = (message.data.deliveryId ?? "").replace(/[^A-Za-z0-9_-]/gu, "").slice(-32);
      const details = webpush.generateRequestDetails(subscription, payload, {
        TTL: 12 * 3600,
        contentEncoding: "aes128gcm",
        // A later round for the same period replaces one the push service still holds, so a device never shows two.
        ...(topic ? { topic } : {}),
        urgency: "normal",
        vapidDetails: { privateKey: config.privateKey, publicKey: config.publicKey, subject: config.subject },
      });
      const response = await fetchImplementation(details.endpoint, {
        body: details.body ? new Uint8Array(details.body) : undefined,
        headers: Object.fromEntries(Object.entries(details.headers).map(([name, value]) => [name, String(value)])),
        method: details.method,
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404 || response.status === 410) throw refusal(response.status, "", true);
      if (response.status === 413) throw refusal(413, "MessageTooBig", false);
      if (response.status === 429 || (response.status >= 400 && response.status < 500)) throw refusal(response.status, "request rejected", false);
      // 5xx and anything unexpected: unknown — it may still be delivered, so it is not marked as refused.
      if (!response.ok) throw new Error(`Web push adapter returned HTTP ${response.status}.`);
      const location = response.headers.get("location");
      return { receiptId: `web:${(location ? location.split("/").pop() : "") || topic || "accepted"}`.slice(0, 200), verified: true };
    },
  };
}
