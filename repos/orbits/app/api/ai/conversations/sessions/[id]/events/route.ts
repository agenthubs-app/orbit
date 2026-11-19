import { resolveFeatureMode } from "../../../../../../../shared/config/feature-mode";
import { handleAgentV1Events } from "../../../../../../../features/agent-v1/entry/http";
import {
  authenticatedApiActorRequiredResponse,
  resolveAuthenticatedApiActor,
} from "../../../../../_shared/authenticated-actor";

// agent-design AG01 (GET conversation/events): the optional real-time channel of a session.
// Another reading of the result documents; it is closed (404) while ORBIT_AGENT_V1_MODE is off.
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const mode = resolveFeatureMode();
  const actor = await resolveAuthenticatedApiActor();
  if (!actor) return authenticatedApiActorRequiredResponse(mode);
  const { id } = await context.params;
  return handleAgentV1Events(request, { actorId: actor.id, mode, sessionId: id });
}
