import { useLocalAiConversationSource, useLocalAiSessionsSource, type LocalAiConversationState, type LocalAiSessionsState } from "./local-ai-sessions-source";
import { useWebMirrorStatus } from "./useWebMirrorStatus";

export type { LocalAiConversationState, LocalAiSessionsState } from "./local-ai-sessions-source";

/**
 * Browser build (sprint 0118): the AI sessions are on the browser mirror
 * whitelist (threat model §2), so the mirror is the source whenever it is
 * active; without it the screens keep their network reads.
 */
export function useLocalAiSessions(probe = true): LocalAiSessionsState {
  return useLocalAiSessionsSource(useWebMirrorStatus().mode === "local-mirror", probe);
}

export function useLocalAiConversation(sessionId: string | null): LocalAiConversationState {
  return useLocalAiConversationSource(useWebMirrorStatus().mode === "local-mirror", sessionId);
}
