import { NextResponse } from "next/server";
import { createContactCardService, readContactCardQuery, contactCardReadError, type ContactCardService } from "../../../../features/contacts/card-service";
import { success, failure } from "../../../../shared/api/envelope";
import { getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import { contactCardPageSchema, contactCardSummarySchema } from "../../../../shared/api-schema/contact-card-page";

export function createContactCardGetHandler(options: {
  summary?: boolean;
  resolveActor?: ResolveAuthenticatedApiActor;
  service?: (actor: NonNullable<Awaited<ReturnType<ResolveAuthenticatedApiActor>>>) => ContactCardService;
} = {}) {
  return async function GET(request: Request): Promise<Response> {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const query = readContactCardQuery(new URL(request.url).searchParams);
      const service = (options.service ?? createContactCardService)(actor);
      const data = options.summary
        ? contactCardSummarySchema.parse(await service.summary(query, actor.id))
        : contactCardPageSchema.parse(await service.page(query, actor.id));
      return NextResponse.json(success(data), { headers });
    } catch (error) {
      const safe = contactCardReadError(error);
      return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
