import { createContactCardService, readContactCardQuery, contactCardReadError, type ContactCardActor, type ContactCardService } from "../../../../features/contacts/card-service";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { readRelationshipTierLookup } from "../../../../features/relationship-strength/read-model";
import { readContactInsightPreviewTexts } from "../../../../features/contacts/insights/read";
import { contactInsightPreview } from "../../../../features/contacts/insights/view";
import { readAnalysisThreshold } from "../../../../features/network-analysis/analysis-threshold-reader";
import type { AnalysisThreshold } from "../../../../features/network-analysis/analysis-threshold";
import type { ContactCardPageDTO } from "../../../../features/contacts/contract";
import { NETWORK_TIER_GROUPS, type NetworkTierGroup } from "./network-0918/network-model";
import { CARD_SOURCE_GROUPS, contactCardsToView, contactCardCounts, type ContactCardInsightPreviews, type ContactCardRouteView, type ContactCardTierEntry } from "./contact-card-view-model";

/** 本页联系人的档位：一条只读语句（读模型投影），读失败返回空表（卡片显示「未评估」）。 */
export async function readContactCardTiers(actorId: string, contactIds: readonly string[]): Promise<ContactCardTierEntry[]> {
  return [...(await readRelationshipTierLookup({ actorId, contactIds })).values()];
}

/**
 * W0051：本页联系人的洞察一句（「和你目标的关系」中英各截 60 字）。只读 contact_insights 一条主键语句，
 * 0 次模型调用；读失败或表未迁移返回空（列表显示「暂无洞察」）。
 */
export async function readContactCardInsightPreviews(actorId: string, contactIds: readonly string[]): Promise<ContactCardInsightPreviews> {
  const texts = await readContactInsightPreviewTexts(actorId, contactIds);
  const previews: ContactCardInsightPreviews = new Map();
  for (const [contactId, goalRelation] of texts) {
    const preview = contactInsightPreview({ goalRelation });
    if (preview) previews.set(contactId, preview);
  }
  return previews;
}

/**
 * W0054（W54-3）：门槛把关的洞察一句——先读门槛（与引导第 1 步同一计数语句），已确认联系人不足 3 位时不读、
 * 返回空表并标 `hidden`（列表把洞察列整列隐藏，不显示「暂无洞察」）；门槛读不到按未知照旧读。
 */
export async function readGatedInsightPreviews(
  actorId: string,
  contactIds: readonly string[],
  deps: {
    readThreshold?: (actorId: string) => Promise<AnalysisThreshold | null>;
    readPreviews?: (actorId: string, contactIds: readonly string[]) => Promise<ContactCardInsightPreviews>;
  } = {},
): Promise<{ hidden: boolean; previews: ContactCardInsightPreviews }> {
  if (!contactIds.length) return { hidden: false, previews: new Map() };
  const threshold = await (deps.readThreshold ?? readAnalysisThreshold)(actorId);
  if (threshold && !threshold.met) return { hidden: true, previews: new Map() };
  const previews = await (deps.readPreviews ?? readContactCardInsightPreviews)(actorId, contactIds).catch((): ContactCardInsightPreviews => new Map());
  return { hidden: false, previews };
}

/** 把洞察一句并进卡片（DTO 可选字段 `insightPreview`）。 */
export function withInsightPreviews(page: ContactCardPageDTO, previews: ContactCardInsightPreviews): ContactCardPageDTO {
  if (!previews.size) return page;
  return { ...page, items: page.items.map((card) => (previews.has(card.id) ? { ...card, insightPreview: previews.get(card.id)! } : card)) };
}

export async function loadContactCardRoute(
  search: Record<string, string | string[] | undefined>, actor: ContactCardActor,
  options: {
    service?: ContactCardService;
    live?: boolean;
    readTiers?: (actorId: string, contactIds: readonly string[]) => Promise<readonly ContactCardTierEntry[]>;
    readInsightPreviews?: (actorId: string, contactIds: readonly string[]) => Promise<ContactCardInsightPreviews>;
    /** W0054：门槛读数（缺省 = 一条计数语句）。 */
    readThreshold?: (actorId: string) => Promise<AnalysisThreshold | null>;
  } = {},
): Promise<{ state: "ready"; view: ContactCardRouteView } | { state: "error"; message: string } | null> {
  if (!(options.live ?? resolveModuleMode() === "live")) return null; // Preserve explicit local mock/dev surfaces.
  try {
    const params = new URLSearchParams();
    for (const key of ["query", "source", "status", "tag", "value", "cursor"]) {
      const value = search[key];
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
    }
    const source = typeof search.sourceGroup === "string" && Object.hasOwn(CARD_SOURCE_GROUPS, search.sourceGroup)
      ? search.sourceGroup as keyof typeof CARD_SOURCE_GROUPS : "all";
    if (source !== "all") {
      params.delete("source");
      for (const value of CARD_SOURCE_GROUPS[source]) params.append("source", value);
    }
    // W0051：关系档位筛选（服务端 SQL 过滤；总数、来源计数与游标都在筛选下计算）。
    const tier = typeof search.tier === "string" && (NETWORK_TIER_GROUPS as readonly string[]).includes(search.tier) ? search.tier as NetworkTierGroup : "all";
    params.delete("tier");
    if (tier !== "all") params.set("tier", tier);
    params.set("limit", "30");
    const query = readContactCardQuery(params);
    const service = options.service ?? createContactCardService(actor);
    const [page, summary] = await Promise.all([service.page(query, actor.id), service.summary(query, actor.id)]);
    const ids = page.items.map((card) => card.id);
    const [tiers, insight] = await Promise.all([
      ids.length ? (options.readTiers ?? readContactCardTiers)(actor.id, ids) : Promise.resolve([]),
      readGatedInsightPreviews(actor.id, ids, { readPreviews: options.readInsightPreviews, readThreshold: options.readThreshold }),
    ]);
    const list = contactCardsToView(withInsightPreviews(page, insight.previews), params.toString(), tiers);
    return { state: "ready", view: { list: insight.hidden ? { ...list, insightsHidden: true } : list, total: summary.total,
      counts: contactCardCounts(summary), query: query.query ?? "", source, tier, params: params.toString() } };
  } catch (error) { return { state: "error", message: contactCardReadError(error).message }; }
}
