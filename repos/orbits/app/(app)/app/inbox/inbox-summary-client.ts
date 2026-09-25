import { inboxSummarySchema } from "../../../../shared/api-schema/inbox-summary";
import { notificationInboxView } from "./notification-inbox-view-model";

/** Null means only an old deployment's explicit 404/405, not a transient failure. */
export async function readWebInboxSummary(actor: string, language: string): Promise<{ threads: number; alerts: number } | null> {
  const response = await fetch("/api/inbox/summary", { cache: "no-store", credentials: "same-origin" });
  if (response.status === 404 || response.status === 405) return null;
  if (!response.ok) throw new Error("Inbox summary unavailable");
  const body = await response.json();
  if (body.success !== true) throw new Error("Inbox summary unavailable");
  const summary = inboxSummarySchema.parse(body.data);
  if (summary.actorId !== actor) throw new Error("Account changed");
  if (summary.notificationRead === "ready") return { threads: summary.messagesUnread, alerts: summary.notificationsUnread };
  const typed = await fetch(`/api/inbox/notifications?${new URLSearchParams({ limit: "1", language })}`, { cache: "no-store", credentials: "same-origin" });
  if (typed.status === 401 || typed.status === 403) throw new Error("Account access changed");
  if (!typed.ok) return { threads: summary.messagesUnread, alerts: 0 };
  const envelope = await typed.json();
  if (envelope.success !== true) return { threads: summary.messagesUnread, alerts: 0 };
  const notifications = notificationInboxView(envelope.data, actor);
  return { threads: summary.messagesUnread, alerts: notifications.enabled ? notifications.unreadCount : 0 };
}
