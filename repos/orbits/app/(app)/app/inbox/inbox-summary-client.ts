import { inboxSummarySchema } from "../../../../shared/api-schema/inbox-summary";

/**
 * The shell's unread badge. `actor` may still be in flight: the summary is requested at the same
 * time as the identity confirmation (2026-11-23, it used to wait ~250 ms for `/api/account/me`) and
 * is only accepted once both have answered and the summary's own `actorId` matches.
 */
export async function readWebInboxSummary(actor: string | Promise<string>, _language: string): Promise<{ threads: number; alerts: number }> {
  const [response, expected] = await Promise.all([fetch("/api/inbox/summary", { cache: "no-store", credentials: "same-origin" }), actor]);
  if (!response.ok) throw new Error("Inbox summary unavailable");
  const body = await response.json();
  if (body.success !== true) throw new Error("Inbox summary unavailable");
  const summary = inboxSummarySchema.parse(body.data);
  if (summary.actorId !== expected) throw new Error("Account changed");
  return { threads: summary.messagesUnread, alerts: summary.notificationsUnread };
}
