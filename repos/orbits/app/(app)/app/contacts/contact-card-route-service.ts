import { createContactCardService, readContactCardQuery, contactCardReadError, type ContactCardActor, type ContactCardService } from "../../../../features/contacts/card-service";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { CARD_SOURCE_GROUPS, contactCardsToView, contactCardCounts, type ContactCardRouteView } from "./contact-card-view-model";

export async function loadContactCardRoute(
  search: Record<string, string | string[] | undefined>, actor: ContactCardActor,
  options: { service?: ContactCardService; live?: boolean } = {},
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
    return { state: "ready", view: { list: contactCardsToView(page, params.toString()), total: summary.total,
      counts: contactCardCounts(summary), query: query.query ?? "", source, params: params.toString() } };
  } catch (error) { return { state: "error", message: contactCardReadError(error).message }; }
}
