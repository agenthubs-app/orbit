import {
  useLocalRelationshipConversationsSource,
  useLocalRelationshipThreadSource,
  type LocalRelationshipConversationsState,
  type LocalRelationshipThreadState,
} from "./local-relationship-messages-source";

export type { LocalRelationshipConversationsState, LocalRelationshipThreadState } from "./local-relationship-messages-source";

/** Sprint 0119, native: the device mirror is always the source for relationship conversations. `probe`: ask the server on open. */
export function useLocalRelationshipConversations(probe = true): LocalRelationshipConversationsState {
  return useLocalRelationshipConversationsSource(true, probe);
}

/** Sprint 0119, native: one conversation and its whole history from the device mirror. */
export function useLocalRelationshipThread(conversationId: string, cursor: string | null = null): LocalRelationshipThreadState {
  return useLocalRelationshipThreadSource(true, conversationId, cursor);
}
