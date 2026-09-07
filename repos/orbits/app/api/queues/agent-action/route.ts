import { handleCallback } from "@vercel/queue";
import { AgentActionExecutionPending, isAgentActionWake, processAgentActionQueueWake } from "../../../../features/agent/runtime/action-queue-worker";
import { createOrbitAgentRuntimeService } from "../../../../features/agent/runtime/service-factory";

export const maxDuration = 300;

// queue/v2beta restricts invocation to Vercel queue infrastructure.
const consume = handleCallback(async (message: unknown) => {
  if (!isAgentActionWake(message)) return;
  try {
    await processAgentActionQueueWake(message, createOrbitAgentRuntimeService("live", { actorId: message.actorId }));
  } catch (error) {
    if (error instanceof AgentActionExecutionPending) throw error;
    throw new Error("Agent background execution unavailable.");
  }
}, {
  visibilityTimeoutSeconds: 360,
  retry: (error) => ({ afterSeconds: error instanceof AgentActionExecutionPending ? error.afterSeconds : 60 }),
});

export async function POST(request: Request): Promise<Response> {
  return consume(request);
}
