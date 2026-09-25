import type { ContactCardPageDTO, ContactCardSummaryDTO } from "../../../../features/contacts/contract";
import { contactCardPageSchema } from "../../../../shared/api-schema/contact-card-page";
import type { NetworkSource, NetworkStage } from "./network-0918/network-model";

export const CARD_SOURCE_GROUPS: Record<NetworkSource, string[]> = {
  event: ["event_import"], referral: ["referral"], contact: ["external_contacts"],
  scan: ["business_card_ocr"], other: ["manual", "qr_scan", "email_signal", "calendar_signal"],
};
export interface ContactCardView {
  id: string; name: string; initial: string; org: string; title: string;
  source: NetworkSource; stage: NetworkStage; pending: boolean; next: string; href: string;
}
export interface ContactCardListView {
  items: ContactCardView[]; nextPath: string | null;
}
export interface ContactCardRouteView {
  list: ContactCardListView;
  total: number;
  counts: Record<NetworkSource | "all", number>;
  query: string;
  source: NetworkSource | "all";
  params: string;
}
export function contactCardsToView(page: ContactCardPageDTO, params: string): ContactCardListView {
  const next = new URLSearchParams(params);
  next.delete("cursor");
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  return {
    items: page.items.map(card => ({
      id: card.id, name: card.displayName, initial: Array.from(card.displayName)[0] ?? "",
      org: card.organization, title: card.role,
      source: (Object.entries(CARD_SOURCE_GROUPS).find(([, codes]) => codes.includes(card.sourceType))?.[0] ?? "other") as NetworkSource,
      stage: card.pendingInitialization || card.status === "needs_follow_up" ? "explore" : card.status === "nurture" ? "keep" : card.status === "archived" ? "archived" : "advance",
      pending: card.pendingInitialization, next: card.nextActionPreview,
      href: `/app/contacts/${encodeURIComponent(card.id)}`,
    })),
    nextPath: page.hasMore && page.nextCursor ? `/api/contacts/page?${next}` : null,
  };
}
export function contactCardCounts(summary: ContactCardSummaryDTO): ContactCardRouteView["counts"] {
  const counts = { all: 0, event: 0, referral: 0, contact: 0, scan: 0, other: 0 };
  for (const [source, n] of Object.entries(summary.sources)) {
    const group = Object.entries(CARD_SOURCE_GROUPS).find(([, codes]) => codes.includes(source))?.[0] ?? "other";
    counts[group as NetworkSource] += n;
    counts.all += n;
  }
  return counts;
}
export class ContactCardAccessRevoked extends Error {}
export async function fetchContactCardView(path: string, params: string, signal: AbortSignal): Promise<ContactCardListView> {
  const response = await fetch(path, { signal, cache: "no-store", credentials: "same-origin" });
  if (response.status === 401 || response.status === 403) throw new ContactCardAccessRevoked("Contact access must be revalidated");
  const body = await response.json();
  if (!response.ok || body.success !== true) throw new Error("联系人页面暂时无法读取，请刷新重试。");
  const page = contactCardPageSchema.parse(body.data);
  return contactCardsToView({ ...page, nextCursor: page.nextCursor ?? null }, params);
}
