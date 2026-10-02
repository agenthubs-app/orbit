import type { ContactCardPageDTO, ContactCardSummaryDTO } from "../../../../features/contacts/contract";
import { contactCardPageSchema } from "../../../../shared/api-schema/contact-card-page";
import { z } from "zod";
import type { NetworkSource, NetworkTierGroup } from "./network-0918/network-model";

export const CARD_SOURCE_GROUPS: Record<NetworkSource, string[]> = {
  event: ["event_import"], referral: ["referral"], contact: ["external_contacts"],
  scan: ["business_card_ocr"], other: ["manual", "qr_scan", "email_signal", "calendar_signal"],
};
/**
 * W0047（review P1-2）：live「所有人脉」卡片的强弱点读关系档位缓存（只由关系时间线推出）；
 * 手动阶段与「待设置关系」不再显示。`tier` = 待唤醒优先的档位分组，没有缓存行为 null（显示「未评估」）。
 */
export interface ContactCardView {
  id: string; name: string; initial: string; org: string; title: string;
  source: NetworkSource; tier: NetworkTierGroup | null; next: string; href: string;
  /** W0051：洞察一句（「和你目标的关系」中英各截 60 字）；还没有洞察为 null。 */
  insight: { zh: string; en: string } | null;
}
/** W0051：联系人 id → 洞察一句。 */
export type ContactCardInsightPreviews = Map<string, { zh: string; en: string }>;
/** 一页联系人的档位（读模型投影）。 */
export interface ContactCardTierEntry { contactId: string; tier: "new" | "active" | "core"; dormant: boolean }
/** 翻页接口带 `tiers=1` 时 data 里附带的本页档位（Web 专用；App 不带这个参数，响应不变）。 */
export const contactCardTiersSchema = z.array(z.object({
  contactId: z.string().min(1).max(512),
  tier: z.enum(["new", "active", "core"]),
  dormant: z.boolean(),
})).max(50);
export const CONTACT_CARD_TIERS_PARAM = "tiers";
export interface ContactCardListView {
  items: ContactCardView[]; nextPath: string | null;
}
export interface ContactCardRouteView {
  list: ContactCardListView;
  total: number;
  counts: Record<NetworkSource | "all", number>;
  query: string;
  source: NetworkSource | "all";
  /** W0051：关系档位筛选（服务端 SQL）。 */
  tier: NetworkTierGroup | "all";
  params: string;
  /** W0054（W54-3）：已确认联系人不足 3 位时整列隐藏洞察一句（服务端也不读、不下发）。 */
  insightsHidden?: boolean;
}
export function contactCardsToView(page: ContactCardPageDTO, params: string, tiers: readonly ContactCardTierEntry[] = []): ContactCardListView {
  const next = new URLSearchParams(params);
  next.delete("cursor");
  if (page.nextCursor) next.set("cursor", page.nextCursor);
  // 下一页同样按本页联系人 id 合并档位（每页一条只读语句，不触发重算）。
  next.set(CONTACT_CARD_TIERS_PARAM, "1");
  const tierById = new Map(tiers.map((entry) => [entry.contactId, entry]));
  return {
    items: page.items.map(card => ({
      id: card.id, name: card.displayName, initial: Array.from(card.displayName)[0] ?? "",
      org: card.organization, title: card.role,
      source: (Object.entries(CARD_SOURCE_GROUPS).find(([, codes]) => codes.includes(card.sourceType))?.[0] ?? "other") as NetworkSource,
      tier: tierById.has(card.id) ? (tierById.get(card.id)!.dormant ? "dormant" : tierById.get(card.id)!.tier) : null,
      next: card.nextActionPreview,
      insight: card.insightPreview ?? null,
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
  const tiers = contactCardTiersSchema.safeParse(body.data?.relationshipTiers ?? []);
  return contactCardsToView({ ...page, nextCursor: page.nextCursor ?? null }, params, tiers.success ? tiers.data : []);
}
