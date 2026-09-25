import { inboxSummarySchema } from "../../../../shared/api-schema/inbox-summary";

export async function readWebInboxSummary(actor: string, _language: string): Promise<{ threads: number; alerts: number }> {
  const response = await fetch("/api/inbox/summary", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Inbox summary unavailable");
  const body = await response.json();
  if (body.success !== true) throw new Error("Inbox summary unavailable");
  const summary = inboxSummarySchema.parse(body.data);
  if (summary.actorId !== actor) throw new Error("Account changed");
  return { threads: summary.messagesUnread, alerts: summary.notificationsUnread };
}
