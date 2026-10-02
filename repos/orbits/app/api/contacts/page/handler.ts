import { NextResponse } from "next/server";
import { createContactCardService, readContactCardQuery, contactCardReadError, type ContactCardService } from "../../../../features/contacts/card-service";
import { success, failure } from "../../../../shared/api/envelope";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { contactCardPageSchema, contactCardSummarySchema } from "../../../../shared/api-schema/contact-card-page";

/** W0047：Web 卡片翻页带 `tiers=1` 时附带本页档位（一条只读语句）；App 不带此参数，响应逐字段不变。 */
async function defaultReadTiers(actorId: string, contactIds: readonly string[]) {
  const { readRelationshipTierLookup } = await import("../../../../features/relationship-strength/read-model");
  return [...(await readRelationshipTierLookup({ actorId, contactIds })).values()];
}

/** W0051：同一 Web 请求（`tiers=1`）另附本页洞察一句（一条只读语句，0 次模型调用）；App 不带此参数，响应不变。 */
async function defaultReadInsightPreviews(actorId: string, contactIds: readonly string[]) {
  const { readContactCardInsightPreviews } = await import("../../../(app)/app/contacts/contact-card-route-service");
  return readContactCardInsightPreviews(actorId, contactIds);
}

export function createContactCardGetHandler(options: {
  summary?: boolean;
  readInsightPreviews?: (actorId: string, contactIds: readonly string[]) => Promise<Map<string, { zh: string; en: string }>>;
  readTiers?: (actorId: string, contactIds: readonly string[]) => Promise<readonly { contactId: string; tier: string; dormant: boolean }[]>;
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: (actor: NonNullable<Awaited<ReturnType<ResolveAuthenticatedApiActor>>>) => ContactCardService;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const searchParams = new URL(request.url).searchParams;
      const query = readContactCardQuery(searchParams);
      const service = (options.service ?? createContactCardService)(actor);
      if (options.summary) return NextResponse.json(success(contactCardSummarySchema.parse(await service.summary(query, actor.id))), { headers });
      const page = contactCardPageSchema.parse(await service.page(query, actor.id));
      if (searchParams.get("tiers") !== "1" || page.items.length === 0) return NextResponse.json(success(page), { headers });
      const ids = page.items.map((card) => card.id);
      const [relationshipTiers, previews] = await Promise.all([
        (options.readTiers ?? defaultReadTiers)(actor.id, ids),
        (options.readInsightPreviews ?? defaultReadInsightPreviews)(actor.id, ids).catch(() => new Map<string, { zh: string; en: string }>()),
      ]);
      const items = previews.size ? page.items.map((card) => (previews.has(card.id) ? { ...card, insightPreview: previews.get(card.id)! } : card)) : page.items;
      return NextResponse.json(success({ ...page, items, relationshipTiers }), { headers });
    } catch (error) {
      const safe = contactCardReadError(error);
      return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
