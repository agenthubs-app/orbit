import type { NotificationPermission, ReminderPlanContract } from "../api/contract/reminders";

interface NativePermissionInput {
  granted: boolean;
  iosStatus?: number | null;
  status: string;
}

interface LocalNotificationPlan {
  body: string;
  deepLink: string;
  fireAt: string;
  id: string;
  status: ReminderPlanContract["status"];
  title: string;
}

export interface LocalNotificationRequest {
  content: {
    body: string;
    data: Record<string, unknown> & { deepLink: string; notificationId: string };
    sound: "default";
    title: string;
  };
  triggerAt: string;
}

const allowedPaths = [
  /^\/tasks\/[^/?#]+$/u,
  /^\/schedule(?:\/events\/[^/?#]+)?$/u,
  /^\/inbox(?:\/[^/?#]+)?$/u,
  /^\/today$/u,
];

export function notificationHrefFromDeepLink(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let path = value.trim();

  if (path.startsWith("orbit://")) {
    try {
      const url = new URL(path);
      path = `/${url.host}${url.pathname}`;
    } catch {
      return null;
    }
  } else if (!path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  try {
    if (decodeURIComponent(path).includes("..")) return null;
  } catch {
    return null;
  }

  return allowedPaths.some((pattern) => pattern.test(path)) ? path : null;
}

export function createNotificationResponseGuard(limit = 100) {
  const handled = new Set<string>();

  return {
    shouldHandle(notificationId: string, actionId: string): boolean {
      const key = `${notificationId}\u0000${actionId}`;
      if (handled.has(key)) return false;
      handled.add(key);
      while (handled.size > Math.max(1, limit)) {
        const oldest = handled.values().next().value;
        if (oldest === undefined) break;
        handled.delete(oldest);
      }
      return true;
    },
  };
}

export function notificationPermissionFromNative(input: NativePermissionInput): NotificationPermission {
  if (input.iosStatus === 3) return "provisional";
  if (input.granted || input.iosStatus === 2 || input.iosStatus === 4) return "granted";
  if (input.status === "denied" || input.iosStatus === 1) return "denied";
  return "undetermined";
}

export function localNotificationRequest(
  plan: LocalNotificationPlan,
  now: string,
): LocalNotificationRequest | null {
  if (plan.status !== "scheduled" || Date.parse(plan.fireAt) <= Date.parse(now)) return null;
  if (!notificationHrefFromDeepLink(plan.deepLink)) return null;

  return {
    content: {
      body: plan.body,
      data: { deepLink: plan.deepLink, notificationId: plan.id },
      sound: "default",
      title: plan.title,
    },
    triggerAt: plan.fireAt,
  };
}
