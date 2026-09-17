import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { OrbitApiClient } from "../api/client";
import type { NotificationPermission, ReminderPlanContract } from "../api/contract/reminders";
import { remindersPath } from "../api/endpoints";
import { notificationPermissionFromNative } from "./notification-model";
import { syncLocalReminderNotifications, type LocalNotificationAdapter } from "./notification-sync";
import {handoffLocalDelivery} from './delivery-ownership';
import {readOrCreatePushDeviceId} from './push-device-session';

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
    const owner = await handoffLocalDelivery({ client, adapter: expoLocalNotificationAdapter, deviceId: await readOrCreatePushDeviceId(), isCurrent: () => generation === reminderGeneration });
    if (owner !== 'legacy') return owner;
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

const reminderPlanChangedListeners = new Set<() => void>();

export function notifyReminderPlansChanged(): void {
  for (const listener of reminderPlanChangedListeners) listener();
}

export function onReminderPlansChanged(listener: () => void): () => void {
  reminderPlanChangedListeners.add(listener);
  return () => reminderPlanChangedListeners.delete(listener);
}
