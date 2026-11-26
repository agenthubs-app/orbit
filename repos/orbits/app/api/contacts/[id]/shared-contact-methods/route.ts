import { NextResponse } from "next/server";
import { configuredExchangedContactMethods } from "../../../../../features/contacts/exchanged-contact-methods";
import { success } from "../../../../../shared/api/envelope";
import { resolveFeatureMode } from "../../../../../shared/config/feature-mode";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
  const { id } = await context.params;
  const contactMethods = await configuredExchangedContactMethods(actor.id, id).catch(() => ({}));
  return NextResponse.json(success(contactMethods), { headers: { "cache-control": "private, no-store" } });
}
