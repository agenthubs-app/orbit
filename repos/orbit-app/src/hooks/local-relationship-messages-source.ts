import { useCallback, useMemo } from "react";

import type { RelationshipDeviceConversation, RelationshipDeviceMessage } from "../api/compute/relationship-local";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { relationshipDeviceConversations, relationshipDeviceMessages } from "../view-models/relationship-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0119 (offline 3b = message plan M3): the relationship conversations
 * and a conversation's full history from the device mirror (sync domains
 * "relationship-conversations" and "relationship-messages"), shared by the
 * native hooks (the mirror is always the source) and the browser hooks (only
 * while the browser mirror is active). A page that shows them probes the
 * server on open (0108 pattern), so a lost connection becomes the 「截至」
 * notice and the write entries (send, draft, mark read) say they need the
 * network.
 */
export interface LocalRelationshipConversationsState {
  /** The device mirror is this platform's source for relationship messages. */
  available: boolean;
  conversations: readonly RelationshipDeviceConversation[];
  freshness: MirrorFreshness;
  refresh(): Promise<unknown>;
}

export function useLocalRelationshipConversationsSource(available: boolean, probe: boolean): LocalRelationshipConversationsState {
  const auth = useOrbitAuthSession();
  const actorId = auth.actorId ?? "";
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "relationship_conversation" });
  const refresh = state.refresh;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const conversations = useMemo(() => (available && actorId ? relationshipDeviceConversations(state.records, actorId) : []), [available, actorId, state.records]);
  return useMemo(() => ({ available, conversations, freshness, refresh }),
    [available, conversations, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh]);
}

export interface LocalRelationshipThreadState extends LocalRelationshipConversationsState {
  /** This conversation's messages on the device (its whole history once the first sync finished). */
  messages: readonly RelationshipDeviceMessage[];
}

export function useLocalRelationshipThreadSource(available: boolean, conversationId: string): LocalRelationshipThreadState {
  const list = useLocalRelationshipConversationsSource(available, false);
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "relationship_message" });
  const messageFreshness = mirrorFreshness(state, available);
  const listRefresh = list.refresh;
  const messagesRefresh = state.refresh;
  const refresh = useCallback(() => Promise.all([listRefresh(), messagesRefresh()]), [listRefresh, messagesRefresh]);
  useMirrorProbe(refresh, available);
  const messages = useMemo(() => (available && conversationId ? relationshipDeviceMessages(state.records, conversationId) : []), [available, conversationId, state.records]);
  const freshness: MirrorFreshness = {
    ...list.freshness,
    readable: list.freshness.readable && messageFreshness.readable,
    loading: list.freshness.loading || messageFreshness.loading,
    failure: list.freshness.failure ?? messageFreshness.failure,
    refreshing: list.freshness.refreshing || messageFreshness.refreshing,
    offline: (list.freshness.readable && messageFreshness.readable) && (list.freshness.offline || messageFreshness.offline),
  };
  return useMemo(() => ({ available, conversations: list.conversations, messages, freshness, refresh }),
    [available, list.conversations, messages, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh]);
}
