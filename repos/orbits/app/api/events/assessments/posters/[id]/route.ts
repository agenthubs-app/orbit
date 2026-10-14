// R26: a poster / screenshot I uploaded (result-page thumbnail; owner only, private cache).
import { resolveAuthenticatedApiActor } from "../../../../_shared/authenticated-actor";
import { getConfiguredEventAssessmentRuntime } from "../../../../../../features/events/assessment/configured";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return new Response(null, { status: 401 });
  const runtimeEntry = getConfiguredEventAssessmentRuntime();
  if (!runtimeEntry) return new Response(null, { status: 404 });
  const { id } = await context.params;
  const poster = await runtimeEntry.service.poster(actor.id, id);
  if (!poster) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(poster.bytes), { headers: { "cache-control": "private, max-age=3600", "content-type": poster.mimeType }, status: 200 });
}
