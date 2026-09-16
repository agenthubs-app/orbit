import { notificationHrefFromDeepLink } from "../notifications/notification-model";

// The existing notification interaction HTTP response is not in the shared
// contract yet. Decode only this consumer's fields; do not copy Web features.
interface InboxNotificationAction {
  canPersist: boolean;
  href: string | undefined;
  ignored: boolean;
  read: boolean;
  unavailable: boolean;
}

function notificationRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function notificationId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function inboxNotificationHref(value: unknown): string | undefined {
  if (typeof value !== "string" || !value || /[?#\\\s]/u.test(value)) return undefined;
  let path = value.startsWith("orbit://") ? `/${value.slice(8)}` : value;
  if (path.startsWith("/app/")) path = path.slice(4);
  if (!path.startsWith("/") || path.startsWith("//")) return undefined;
  const segments = path.slice(1).split("/");
  try {
    if (segments.some(segment => {
      const decoded = decodeURIComponent(segment);
      return !decoded || decoded === "." || decoded.includes("..") || /[\\/?#%\s\u0000-\u001f\u007f]/u.test(decoded);
    })) return undefined;
  } catch { return undefined; }
  const owned = notificationHrefFromDeepLink(path);
  if (owned) return owned;
  // These explicit server destinations already have native detail routes.
  // Participant drawers and event-context queries are not equivalent to them.
  if (segments.length === 2 && segments[0] === "contacts"
    && !["new", "list", "dashboard", "graph", "intros", "pipeline", "all-actions"].includes(decodeURIComponent(segments[1]!))) return path;
  if (segments.length === 2 && segments[0] === "events"
    && decodeURIComponent(segments[1]!) !== "center") return path;
  return undefined;
}

export function inboxNotificationsReadable(value: unknown): boolean {
  const data = notificationRecord(value);
  if (!data || !Array.isArray(data.reminders) || !data.reminders.every(item => notificationRecord(item))) return false;
  if (data.state !== undefined && data.state !== "success" && data.state !== "empty") return false;
  if (data.notificationInteractions === undefined) return true;
  const states = notificationRecord(data.notificationInteractions);
  return states !== null && Object.values(states).every(state => state === "read" || state === "ignored");
}

export function inboxNotificationActions(value: unknown): Map<string, InboxNotificationAction> {
  const actions = new Map<string, InboxNotificationAction>();
  if (!inboxNotificationsReadable(value)) return actions;
  const data = notificationRecord(value)!;
  const states = notificationRecord(data.notificationInteractions);
  const canPersist = states !== null && (data.state === "success" || data.state === "empty");
  const seen = new Set<string>();
  for (const raw of data.reminders as unknown[]) {
    const reminder = notificationRecord(raw)!;
    const id = reminder.reminderId;
    if (!notificationId(id)) continue;
    if (seen.has(id)) { actions.delete(id); continue; }
    seen.add(id);
    const state = states && Object.prototype.hasOwnProperty.call(states, id) ? states[id] : undefined;
    const followupTaskId = notificationId(reminder.followupTaskId)
      ? reminder.followupTaskId
      : undefined;
    const href = inboxNotificationHref(reminder.href);
    actions.set(id, {
      canPersist,
      href,
      unavailable: reminder.href === "" || (!href && Boolean(followupTaskId)),
      ignored: canPersist && state === "ignored",
      read: canPersist && state === "read",
    });
  }
  return actions;
}

export function inboxNotificationReceiptMatches(value: unknown, id: string, state: "read" | "ignored"): boolean {
  const receipt = notificationRecord(value);
  return receipt !== null && receipt.notificationId === id && receipt.state === state
    && typeof receipt.updatedAt === "string" && receipt.updatedAt.trim() === receipt.updatedAt
    && Number.isFinite(Date.parse(receipt.updatedAt));
}
