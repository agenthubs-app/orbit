import type { AgentActionWake } from "./background-dispatch";
import type { AgentRuntimeService } from "./service";

export class AgentActionExecutionPending extends Error {
  constructor(readonly afterSeconds: number) {
    super("Agent action execution remains pending.");
  }
}

export function isAgentActionWake(value: unknown): value is AgentActionWake {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return Object.keys(message).length === 4 && message.version === 1 &&
    ["actorId", "actionId", "runId"].every((key) =>
      typeof message[key] === "string" && message[key].trim() === message[key] &&
      message[key].length > 0 && message[key].length <= 512);
}

export async function processAgentActionQueueWake(
  message: AgentActionWake,
  runtime: Pick<AgentRuntimeService, "getRun" | "processOutbox">,
): Promise<void> {
  try {
    const before = await runtime.getRun(message.runId);
    if (!before?.actions.some((action) => action.actionId === message.actionId)) return;
    const result = await runtime.processOutbox({
      actionId: message.actionId, limit: 1, workerId: "vercel-agent-action-queue",
    });
    const after = await runtime.getRun(message.runId);
    if (!after) throw new Error("Authoritative action state unavailable.");
    const pending = after.outbox.some((event) => event.actionId === message.actionId &&
      ["pending", "processing", "retry_scheduled"].includes(event.status));
    // Idle can mean a future retry or the existing 15-minute database lease.
    // Do not acknowledge while another worker still holds unfinished work.
    console.info(JSON.stringify({ event: "agent_action_execution_tick", processed: result.processed, pending }));
    if (pending) throw new AgentActionExecutionPending(result.processed > 0 ? 1 : 60);
  } catch (error) {
    if (error instanceof AgentActionExecutionPending) throw error;
    throw new Error("Agent background execution unavailable.");
  }
}
