import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { OrbitApiClient } from "../api/client";
import type { NotificationPermission, ReminderPlanContract } from "../api/contract/reminders";
import { ORBIT_API_ENDPOINTS, remindersPath } from "../api/endpoints";
import { notificationPermissionFromNative } from "./notification-model";
import { syncLocalReminderNotifications, type LocalNotificationAdapter } from "./notification-sync";

const DEVICE_ID_KEY = "orbit.notifications.device-id.v1";
let pendingReminderOperation: Promise<unknown> = Promise.resolve();
let reminderGeneration = 0;

export function getReminderNotificationGeneration(): number {
  return reminderGeneration;
}

function enqueueReminderOperation<T>(operation: () => Promise<T>): Promise<T> {
  const pending = pendingReminderOperation.then(operation);
  pendingReminderOperation = pending.catch(() => undefined);
  return pending;
}

function nativePermission(status: Notifications.NotificationPermissionsStatus) {
  return {
    granted: status.granted,
    ...(status.ios?.status === undefined ? {} : { iosStatus: status.ios.status }),
    status: status.status,
  };
}

export const expoLocalNotificationAdapter: LocalNotificationAdapter = {
  cancelScheduledNotificationAsync: Notifications.cancelScheduledNotificationAsync,
  async getAllScheduledNotificationsAsync() {
    return Notifications.getAllScheduledNotificationsAsync();
  },
  async getPermissionsAsync() {
    return nativePermission(await Notifications.getPermissionsAsync());
  },
  async scheduleNotificationAsync(request) {
    return Notifications.scheduleNotificationAsync({
      content: request.content,
      trigger: {
        date: new Date(request.triggerAt),
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    });
  },
};

export async function notificationDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const created = `ios:${Crypto.randomUUID()}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (Platform.OS !== "ios") return "denied";
  const current = await Notifications.getPermissionsAsync();
  let mapped = notificationPermissionFromNative(nativePermission(current));
  if (mapped !== "undetermined") return mapped;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  mapped = notificationPermissionFromNative(nativePermission(requested));
  return mapped;
}

export async function syncReminderNotifications(
  client: OrbitApiClient,
  generation = reminderGeneration,
): Promise<{ cancelled: number; permission: NotificationPermission; scheduled: number } | null> {
  if (Platform.OS !== "ios") return null;
  return enqueueReminderOperation(async () => {
    if (generation !== reminderGeneration) return null;
    const result = await client.get<{ reminders: ReminderPlanContract[] }>(remindersPath());
    if (generation !== reminderGeneration || !result.success) return null;
    return syncLocalReminderNotifications({
      adapter: expoLocalNotificationAdapter,
      now: new Date().toISOString(),
      plans: result.data.reminders,
    });
  });
}

export async function cancelOrbitManagedNotifications(): Promise<number> {
  if (Platform.OS !== "ios") return 0;
  reminderGeneration++;
  return enqueueReminderOperation(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const orbitManaged = scheduled.filter(
      (item) => typeof item.content.data?.orbitReminderPlanId === "string",
    );
    for (const item of orbitManaged) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
    return orbitManaged.length;
  });
}

function projectId(): string | null {
  const value = Constants.expoConfig?.extra?.easProjectId ?? Constants.easConfig?.projectId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function registerNotificationDevice(client: OrbitApiClient): Promise<boolean> {
  if (Platform.OS !== "ios" || !Device.isDevice) return false;
  const permissionStatus = await Notifications.getPermissionsAsync();
  const permission = notificationPermissionFromNative(nativePermission(permissionStatus));
  if (permission !== "granted" && permission !== "provisional") return false;
  const easProjectId = projectId();
  if (!easProjectId) return false;

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId: easProjectId });
    const response = await client.post(ORBIT_API_ENDPOINTS.devicePushToken, {
      body: {
        deviceId: await notificationDeviceId(),
        permission,
        platform: "ios",
        token: token.data,
      },
    });
    return response.success;
  } catch (error) {
    console.warn("Orbit 远程推送注册失败", error);
    return false;
  }
}

export async function revokeNotificationDevice(client: OrbitApiClient): Promise<boolean> {
  if (Platform.OS !== "ios") return true;
  const response = await client.delete(ORBIT_API_ENDPOINTS.devicePushToken, {
    body: { deviceId: await notificationDeviceId() },
  });
  return response.success;
}

const reminderPlanChangedListeners = new Set<() => void>();

export function notifyReminderPlansChanged(): void {
  for (const listener of reminderPlanChangedListeners) listener();
}

export function onReminderPlansChanged(listener: () => void): () => void {
  reminderPlanChangedListeners.add(listener);
  return () => reminderPlanChangedListeners.delete(listener);
}
