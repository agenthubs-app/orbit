import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import type { RelationshipDeviceConversation, RelationshipDeviceMessage } from "../api/compute/relationship-local";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { relationshipDeviceConversations, relationshipDeviceMessages, relationshipMessagePageSeqs } from "../view-models/relationship-local";
import { relationshipMessageRowId } from "../api/compute/relationship-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncCoordinatorSession, useSyncedCollection } from "./useSyncedCollection";
import type { SyncCoordinatorSession } from "../data/sync/sync-coordinator";

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
  /**
   * Sprint 0135: the sync session that holds the device queue of messages written offline. Native only (the
   * browser keeps writes online, design D2); absent where offline sending is not open.
   */
  outboxSession?: (() => SyncCoordinatorSession | null) | undefined;
}

export function useLocalRelationshipConversationsSource(available: boolean, probe: boolean): LocalRelationshipConversationsState {
  const auth = useOrbitAuthSession();
  const actorId = auth.actorId ?? "";
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "relationship_conversation" });
  const refresh = state.refresh;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const conversations = useMemo(() => (available && actorId ? relationshipDeviceConversations(state.records, actorId) : []), [available, actorId, state.records]);
  const outboxSession = available && Platform.OS !== "web" ? state.currentSession : undefined;
  return useMemo(() => ({ available, conversations, freshness, refresh, outboxSession }),
    [available, conversations, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh, outboxSession]);
}

export interface LocalRelationshipThreadState extends LocalRelationshipConversationsState {
  /**
   * The messages of this conversation's page for `cursor` (the newest without one), read from the device by
   * row id — one window plus one more to know an older page exists (sprint 0131; the whole history stays on
   * the device, the page never loads it all).
   */
  messages: readonly RelationshipDeviceMessage[];
}

export function useLocalRelationshipThreadSource(available: boolean, conversationId: string, cursor: string | null = null): LocalRelationshipThreadState {
  const list = useLocalRelationshipConversationsSource(available, false);
  // The message domain's sync state only; the page's rows are read by id below.
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "relationship_message", records: false });
  const session = useSyncCoordinatorSession(available);
  const conversation = list.conversations.find((row) => row.conversationId === conversationId) ?? null;
  const seqs = useMemo(() => (conversation ? relationshipMessagePageSeqs(conversation, cursor) : []), [conversation?.lastMessageSeq, cursor]);
  const [page, setPage] = useState<{ key: string; records: readonly Record<string, unknown>[] }>({ key: "", records: [] });
  const pageKey = JSON.stringify([conversationId, seqs[0] ?? null, seqs.at(-1) ?? null, state.lastSyncedAt, state.status]);
  useEffect(() => {
    if (!available || !session || !conversationId || seqs.length === 0) return;
    let live = true;
    void session.readRecordsById<Record<string, unknown>>("relationship_message", seqs.map((seq) => relationshipMessageRowId(conversationId, seq)))
      .then((rows) => { if (live) setPage({ key: pageKey, records: (rows ?? []) as never }); })
      .catch(() => { if (live) setPage({ key: pageKey, records: [] }); });
    return () => { live = false; };
  }, [available, conversationId, pageKey, session]);
  const messageFreshness = mirrorFreshness(state, available);
  const listRefresh = list.refresh;
  const messagesRefresh = state.refresh;
  const refresh = useCallback(() => Promise.all([listRefresh(), messagesRefresh()]), [listRefresh, messagesRefresh]);
  useMirrorProbe(refresh, available);
  const messages = useMemo(() => (available && conversationId && page.key === pageKey ? relationshipDeviceMessages(page.records as never, conversationId) : []), [available, conversationId, page, pageKey]);
  const freshness: MirrorFreshness = {
    ...list.freshness,
    readable: list.freshness.readable && messageFreshness.readable,
    loading: list.freshness.loading || messageFreshness.loading,
    failure: list.freshness.failure ?? messageFreshness.failure,
    refreshing: list.freshness.refreshing || messageFreshness.refreshing,
    offline: (list.freshness.readable && messageFreshness.readable) && (list.freshness.offline || messageFreshness.offline),
  };
  return useMemo(() => ({ available, conversations: list.conversations, messages, freshness, refresh, outboxSession: list.outboxSession }),
    [available, list.conversations, messages, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh, list.outboxSession]);
}
