import type { OrbitApiClient } from "../api/client";
export {
  shouldRegisterPushToken,
  shouldRequestPushPermission,
} from "./push-policy";

export const PUSH_DEVICE_ID_KEY = "orbit.pushDeviceId";
export const PUSH_NOTIFICATIONS_ENABLED_KEY = "orbit.pushNotificationsEnabled";
export const LEGACY_PUSH_DEVICE_ID_KEY = "orbit.notifications.device-id.v1";

type PushOptInListener = () => void;
const optInListeners = new Set<PushOptInListener>();
const fallback = new Map<string, string>();

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? fallback.get(key) ?? null;
  } catch {
    return fallback.get(key) ?? null;
  }
}

function write(key: string, value: string | null): void {
  if (value === null) fallback.delete(key);
  else fallback.set(key, value);
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  } catch {
    // Memory storage preserves behavior when browser storage is unavailable.
  }
}

export async function readOrCreatePushDeviceId(): Promise<string> {
  const stored = read(PUSH_DEVICE_ID_KEY)?.trim();
  if (stored) return stored;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const generated = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
  write(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

export async function migrateLegacyPushDeviceRegistration(
  _client: OrbitApiClient,
): Promise<boolean> {
  write(LEGACY_PUSH_DEVICE_ID_KEY, null);
  return true;
}

export async function isPushNotificationsOptedIn(): Promise<boolean> {
  return read(PUSH_NOTIFICATIONS_ENABLED_KEY) === "true";
}

export async function setPushNotificationsOptIn(enabled: boolean): Promise<void> {
  write(PUSH_NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : null);
  optInListeners.forEach(listener => listener());
}

export function onPushNotificationsOptInChanged(
  listener: PushOptInListener,
): () => void {
  optInListeners.add(listener);
  return () => optInListeners.delete(listener);
}

export async function revokeRegisteredPushDevice(_input: {
  client: OrbitApiClient;
}): Promise<boolean> {
  // Browser notification registration is not implemented, so no native token
  // exists to revoke. Clear browser-only state without calling the API.
  write(PUSH_DEVICE_ID_KEY, null);
  return true;
}
