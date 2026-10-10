import type { NotificationPermission, ReminderPlanContract } from "../api/contract/reminders";
import { eventParticipantHref } from "../view-models/event-participant-route";

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
  /^\/schedule\/events\/[^/?#]+$/u,
  /^\/inbox(?:\/[^/?#]+)?$/u,
];

// R05: reminders scheduled before the Task page (and servers still sending the old
// addresses) open the matching Task segment instead of the redirect route; the new
// address keeps only a known segment and To-do's list selection (review M3).
const TASK_SEGMENTS = new Set(["calendar", "todo", "plan", "memo"]);

// Only URL is assumed (the notification runtime does not provide URLSearchParams).
function taskSegmentHref(path: string, query: { get(name: string): string | null }): string | null {
  if (path === "/schedule") return "/task?seg=calendar";
  if (path === "/today") return "/task?seg=todo";
  if (path !== "/task") return null;
  const segment = query.get("seg");
  if (!segment || !TASK_SEGMENTS.has(segment)) return "/task";
  if (segment !== "todo") return "/task?seg=" + segment;
  // The same normalisation as taskListHref (view-models/task-list-scope), kept local so
  // this module stays light for the notification runtime.
  return "/task?seg=todo" + (query.get("scope") === "relationship" ? "&scope=relationship" : "") + (query.get("view") === "completed" ? "&view=completed" : "");
}

export function notificationHrefFromDeepLink(value: unknown): string | null {
  const participant = eventParticipantHref(value);
  if (participant) return participant;
  if (typeof value !== "string" || !value.trim()) return null;
  let path = value.trim();

  let query: { get(name: string): string | null } = { get: () => null };
  if (path.startsWith("orbit://")) {
    try {
      const url = new URL(path);
      path = `/${url.host}${url.pathname}`;
      query = url.searchParams;
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

  // Only the Task page takes a query; any other address with one is refused as before.
  if (path.includes("?")) {
    const parsed = new URL(path, "orbit://local");
    return taskSegmentHref(parsed.pathname, parsed.searchParams);
  }
  const task = taskSegmentHref(path, query);
  if (task) return task;
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
