import type { AgentActionRecord } from "./contract";
import type { AgentRuntimeService } from "./service";

export interface AgentActionWake {
  version: 1;
  actorId: string;
  actionId: string;
  runId: string;
}

export function withAgentBackgroundDispatch(
  runtime: AgentRuntimeService,
  actorId: string,
  publish: (message: AgentActionWake) => Promise<void>,
): AgentRuntimeService {
  if (!actorId.trim()) throw new Error("Background execution requires an authenticated actor.");
  async function dispatch(action: AgentActionRecord): Promise<AgentActionRecord> {
    if (action.status === "approved" || action.status === "executing") {
      try {
        await publish({ version: 1, actorId, actionId: action.actionId, runId: action.runId });
      } catch {
        // The durable action remains visible and can be confirmed again.
        // Never expose SDK credentials or claim dispatch succeeded on failure.
        throw new Error("Agent background dispatch unavailable. The saved action can be retried.");
      }
    }
    return action;
  }
  return {
    ...runtime,
    approveAction: async (input) => dispatch(await runtime.approveAction(input)),
    retryAction: async (actionId) => dispatch(await runtime.retryAction(actionId)),
    // agent-design AG02: an accepted confirm or retry on a card is handed to the queue the same way.
    ...(runtime.decideAction
      ? {
          decideAction: async (input) => {
            const result = await runtime.decideAction!(input);
            if (result?.accepted && !result.replayed && (input.decision === "confirm" || input.decision === "retry")) {
              const action = await runtime.getAction(input.actionId);
              if (action) await dispatch(action);
            }
            return result;
          },
        } satisfies Pick<AgentRuntimeService, "decideAction">
      : {}),
  };
}
