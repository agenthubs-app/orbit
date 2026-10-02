import { createContactCardService, readContactCardQuery, contactCardReadError, type ContactCardActor, type ContactCardService } from "../../../../features/contacts/card-service";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { readRelationshipTierLookup } from "../../../../features/relationship-strength/read-model";
import { CARD_SOURCE_GROUPS, contactCardsToView, contactCardCounts, type ContactCardRouteView, type ContactCardTierEntry } from "./contact-card-view-model";

/** 本页联系人的档位：一条只读语句（读模型投影），读失败返回空表（卡片显示「未评估」）。 */
export async function readContactCardTiers(actorId: string, contactIds: readonly string[]): Promise<ContactCardTierEntry[]> {
  return [...(await readRelationshipTierLookup({ actorId, contactIds })).values()];
}

export async function loadContactCardRoute(
  search: Record<string, string | string[] | undefined>, actor: ContactCardActor,
  options: { service?: ContactCardService; live?: boolean; readTiers?: (actorId: string, contactIds: readonly string[]) => Promise<readonly ContactCardTierEntry[]> } = {},
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
    params.set("limit", "30");
    const query = readContactCardQuery(params);
    const service = options.service ?? createContactCardService(actor);
    const [page, summary] = await Promise.all([service.page(query, actor.id), service.summary(query, actor.id)]);
    const tiers = page.items.length ? await (options.readTiers ?? readContactCardTiers)(actor.id, page.items.map((card) => card.id)) : [];
    return { state: "ready", view: { list: contactCardsToView(page, params.toString(), tiers), total: summary.total,
      counts: contactCardCounts(summary), query: query.query ?? "", source, params: params.toString() } };
  } catch (error) { return { state: "error", message: contactCardReadError(error).message }; }
}
