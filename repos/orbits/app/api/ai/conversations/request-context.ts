import {
  resolveAgentRequestContext,
  type AgentRequestContext,
} from "../../_shared/agent-request-context";
import { resolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";
import type { ModuleMode } from "../../../../shared/services/module-mode";

/** Conversation writes and session reads must share the canonical account actor. */
export async function resolveOrbitAgentConversationRequestContext(
  mode: ModuleMode,
): Promise<AgentRequestContext | null> {
  if (mode !== "live") return resolveAgentRequestContext(mode);

  return resolveAgentRequestContext(mode, {
    authenticate: async () => {
      const actor = await resolveAuthenticatedApiActor();
      return actor ? { user: { id: actor.id } } : null;
    },
  });
}
