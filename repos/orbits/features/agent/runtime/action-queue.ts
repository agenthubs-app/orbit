import { send } from "@vercel/queue";
import type { AgentActionWake } from "./background-dispatch";

export async function enqueueAgentAction(message: AgentActionWake): Promise<void> {
  // Only server-resolved identifiers travel through the queue. Operation
  // payloads and integration credentials remain in the actor-scoped store.
  // Do not deduplicate by action ID: an explicit retry after a terminal
  // failure needs a fresh wakeup even within the SDK's 24-hour dedupe window.
  await send("agent-action-execution", message, { retentionSeconds: 7 * 24 * 60 * 60 });
}
