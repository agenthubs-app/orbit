import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { createOrbitApiClient } from "../api/client";
import { pushTokenPath } from "../api/endpoints";
export {
  shouldRegisterPushToken,
  shouldRequestPushPermission
} from "./push-policy";

export const PUSH_DEVICE_ID_KEY = "orbit.pushDeviceId";
export const PUSH_NOTIFICATIONS_ENABLED_KEY = "orbit.pushNotificationsEnabled";

type PushOptInListener = () => void;
const optInListeners = new Set<PushOptInListener>();

export async function readOrCreatePushDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY);
  if (stored?.trim()) return stored.trim();
  const bytes = await Crypto.getRandomBytesAsync(16);
  const generated = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  await SecureStore.setItemAsync(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

export async function isPushNotificationsOptedIn(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PUSH_NOTIFICATIONS_ENABLED_KEY)) === "true";
}

export async function setPushNotificationsOptIn(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(PUSH_NOTIFICATIONS_ENABLED_KEY, "true");
  } else {
    await SecureStore.deleteItemAsync(PUSH_NOTIFICATIONS_ENABLED_KEY);
  }
  optInListeners.forEach((listener) => listener());
}

export function onPushNotificationsOptInChanged(
  listener: PushOptInListener,
): () => void {
  optInListeners.add(listener);
  return () => optInListeners.delete(listener);
}

export async function revokeRegisteredPushDevice(input: {
  baseUrl: string;
  cookieHeader: string;
}): Promise<void> {
  try {
    const deviceId = await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY);
    if (!deviceId?.trim()) return;
    await createOrbitApiClient({
      authCookieHeader: input.cookieHeader,
      baseUrl: input.baseUrl,
    }).delete(pushTokenPath(deviceId));
  } catch {
    // Logout must not be blocked by a best-effort device revocation request.
  }
}
