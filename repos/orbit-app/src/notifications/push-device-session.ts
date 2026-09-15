import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { OrbitApiClient } from "../api/client";
import { ORBIT_API_ENDPOINTS, pushTokenPath } from "../api/endpoints";
export {
  shouldRegisterPushToken,
  shouldRequestPushPermission
} from "./push-policy";

export const PUSH_DEVICE_ID_KEY = "orbit.pushDeviceId";
export const PUSH_NOTIFICATIONS_ENABLED_KEY = "orbit.pushNotificationsEnabled";
export const LEGACY_PUSH_DEVICE_ID_KEY = "orbit.notifications.device-id.v1";

type PushOptInListener = () => void;
const optInListeners = new Set<PushOptInListener>();

export async function readOrCreatePushDeviceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY);
  if (stored?.trim()) return stored.trim();
  const legacy = await AsyncStorage.getItem(LEGACY_PUSH_DEVICE_ID_KEY);
  if (legacy?.trim()) {
    await SecureStore.setItemAsync(PUSH_DEVICE_ID_KEY, legacy.trim());
    return legacy.trim();
  }
  const bytes = await Crypto.getRandomBytesAsync(16);
  const generated = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  await SecureStore.setItemAsync(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

export async function migrateLegacyPushDeviceRegistration(
  client: OrbitApiClient,
): Promise<boolean> {
  try {
    const legacyId = await AsyncStorage.getItem(LEGACY_PUSH_DEVICE_ID_KEY);
    if (!legacyId?.trim()) return true;
    const result = await client.delete(ORBIT_API_ENDPOINTS.devicePushToken, {
      body: { deviceId: legacyId.trim() },
    });
    if (!result.success) return false;
    await AsyncStorage.removeItem(LEGACY_PUSH_DEVICE_ID_KEY);
    return true;
  } catch {
    return false;
  }
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
  client: OrbitApiClient;
}): Promise<boolean> {
  const deviceId = await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY).catch(() => null);
  const canonical = deviceId?.trim()
    ? input.client.delete(pushTokenPath(deviceId.trim())).catch(() => ({ success: false }))
    : Promise.resolve({ success: true });
  const legacy = migrateLegacyPushDeviceRegistration(input.client);
  const [canonicalResult, legacyResult] = await Promise.all([canonical, legacy]);
  return canonicalResult.success && legacyResult;
}
