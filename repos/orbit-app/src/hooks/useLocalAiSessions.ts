import { useLocalAiConversationSource, useLocalAiSessionsSource, type LocalAiConversationState, type LocalAiSessionsState } from "./local-ai-sessions-source";

export type { LocalAiConversationState, LocalAiSessionsState } from "./local-ai-sessions-source";

/** Sprint 0118, native: the device mirror is always the source for the AI session list and opened sessions. */
export function useLocalAiSessions(probe = true): LocalAiSessionsState {
  return useLocalAiSessionsSource(true, probe);
}

export function useLocalAiConversation(sessionId: string | null): LocalAiConversationState {
  return useLocalAiConversationSource(true, sessionId);
}
