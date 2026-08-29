import type { NotificationPermission, ReminderPlanContract } from "../api/contract/reminders";
import {
  localNotificationRequest,
  notificationPermissionFromNative,
  type LocalNotificationRequest,
} from "./notification-model";

interface ScheduledNotification {
  content: { data?: Record<string, unknown> | null };
  identifier: string;
}

interface NativePermissionStatus {
  granted: boolean;
  iosStatus?: number | null;
  status: string;
}

export interface LocalNotificationAdapter {
  cancelScheduledNotificationAsync: (identifier: string) => Promise<void>;
  getAllScheduledNotificationsAsync: () => Promise<readonly ScheduledNotification[]>;
  getPermissionsAsync: () => Promise<NativePermissionStatus>;
  scheduleNotificationAsync: (request: LocalNotificationRequest) => Promise<string>;
}

export async function syncLocalReminderNotifications({
  adapter,
  now,
  plans,
}: {
  adapter: LocalNotificationAdapter;
  now: string;
  plans: readonly ReminderPlanContract[];
}): Promise<{ cancelled: number; permission: NotificationPermission; scheduled: number }> {
  const nativePermission = await adapter.getPermissionsAsync();
  const permission = notificationPermissionFromNative(nativePermission);
  if (permission !== "granted" && permission !== "provisional") {
    return { cancelled: 0, permission, scheduled: 0 };
  }

  const current = await adapter.getAllScheduledNotificationsAsync();
  const orbitManaged = current.filter(
    (item) => typeof item.content.data?.orbitReminderPlanId === "string",
  );
  for (const item of orbitManaged) {
    await adapter.cancelScheduledNotificationAsync(item.identifier);
  }

  let scheduled = 0;
  for (const plan of plans) {
    const request = localNotificationRequest(plan, now);
    if (!request) continue;
    await adapter.scheduleNotificationAsync({
      ...request,
      content: {
        ...request.content,
        data: {
          ...request.content.data,
          orbitReminderPlanId: plan.id,
        },
      },
    });
    scheduled += 1;
  }

  return { cancelled: orbitManaged.length, permission, scheduled };
}
