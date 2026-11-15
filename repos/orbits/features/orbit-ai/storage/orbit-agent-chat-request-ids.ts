import { createHash } from "node:crypto";

/**
 * Where a send's request record lives. Shared by the protocol-2 reliable send
 * (orbit-agent-chat-request-store.ts) and the protocol-3 entry (agent-v1/entry/store.ts,
 * agent-design AG01) so one requestId can never name two different requests.
 */
export const ORBIT_AGENT_CHAT_REQUEST_COLLECTION = "orbit_agent_chat_requests";

export function orbitAgentChatRequestRecordId(actorId: string, requestId: string): string {
  return createHash("sha256")
    .update(JSON.stringify([actorId, requestId]))
    .digest("hex");
}
