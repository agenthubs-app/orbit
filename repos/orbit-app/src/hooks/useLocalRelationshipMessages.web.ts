import {
  useLocalRelationshipConversationsSource,
  useLocalRelationshipThreadSource,
  type LocalRelationshipConversationsState,
  type LocalRelationshipThreadState,
} from "./local-relationship-messages-source";
import { useWebMirrorStatus } from "./useWebMirrorStatus";

export type { LocalRelationshipConversationsState, LocalRelationshipThreadState } from "./local-relationship-messages-source";

/**
 * Browser build (sprint 0119): relationship messages are on the browser mirror
 * whitelist (threat model §2), so the mirror is the source whenever it is
 * active. Without it the inbox threads and the chat keep their network reads.
 */
export function useLocalRelationshipConversations(probe = true): LocalRelationshipConversationsState {
  return useLocalRelationshipConversationsSource(useWebMirrorStatus().mode === "local-mirror", probe);
}

export function useLocalRelationshipThread(conversationId: string, cursor: string | null = null): LocalRelationshipThreadState {
  return useLocalRelationshipThreadSource(useWebMirrorStatus().mode === "local-mirror", conversationId, cursor);
}
