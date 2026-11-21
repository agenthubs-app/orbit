/**
 * agent-design AG16 (approved draft 16-5 「点开去哪」): a reminder carries one opaque id. Clicked in the browser it opens
 * `/app/inbox?tab=notifications&delivery=<id>` (public/orbit-push-sw.js); the inbox asks the server, under this
 * browser's own sign-in, which entry that id is, and selects it. Another account's id, a removed entry or an address
 * outside the inbox gives null and the list stays as it is.
 */
const INBOX_HREF = /^\/inbox\/(?:notifications\/)?([^/?#]+)$/u;

export function inboxEntryFromDeliveryAnswer(answer: unknown, deliveryId: string): string | null {
  const data = answer && typeof answer === "object" ? (answer as { data?: unknown }).data : null;
  const target = data && typeof data === "object" ? (data as { target?: unknown }).target : null;
  if (!target || typeof target !== "object") return null;
  const { deliveryId: id, kind, status, href } = target as { deliveryId?: unknown; kind?: unknown; status?: unknown; href?: unknown };
  if (id !== deliveryId || kind !== "inbox" || status !== "available" || typeof href !== "string") return null;
  const match = INBOX_HREF.exec(href);
  if (!match) return null;
  try {
    const entry = decodeURIComponent(match[1]!);
    return entry && entry !== "." && entry !== ".." && !/[\\/\u0000-\u001f]/u.test(entry) ? entry : null;
  } catch {
    return null;
  }
}

export async function inboxEntryOfDelivery(deliveryId: string, signal?: AbortSignal): Promise<string | null> {
  const response = await fetch(`/api/notifications/deliveries/${encodeURIComponent(deliveryId)}`, { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) return null;
  return inboxEntryFromDeliveryAnswer(await response.json().catch(() => null), deliveryId);
}
