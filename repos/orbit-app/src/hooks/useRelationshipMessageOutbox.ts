import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useState } from "react";

import { buildOfflineMessageMutation } from "../data/sync/message-outbox-mutation";
import { outboxRelationshipMessages, type OutboxRelationshipMessage } from "../view-models/relationship-outbox";
import type { LocalRelationshipConversationsState } from "./local-relationship-messages-source";

export interface RelationshipMessageOutbox {
  /** Offline sending is open here (native, device mirror in use; the browser stays online-only, design D2). */
  enabled: boolean;
  messages: readonly OutboxRelationshipMessage[];
  failure: string | null;
  enqueue(input: { conversationId: string; body: string; qualificationVersion: string; retireDraftThrough: string | null }): Promise<void>;
  retry(mutationId: string): Promise<void>;
  discard(mutationIds: readonly string[]): Promise<void>;
  refresh(): Promise<void>;
}

function sameMessages(left: readonly OutboxRelationshipMessage[], right: readonly OutboxRelationshipMessage[]): boolean {
  return left.length === right.length && left.every((message, index) => {
    const other = right[index]!;
    return message.mutationId === other.mutationId && message.status === other.status && message.body === other.body && message.conversationId === other.conversationId;
  });
}

/**
 * Sprint 0135 (message plan M4): the device queue of relationship messages
 * written offline, read through the sync session of the device message source
 * (useLocalRelationshipConversations / useLocalRelationshipThread). Each queued
 * message has a fresh request id (the mutation id); it is sent once the device
 * is online again (offline-write design step 8).
 */
export function useRelationshipMessageOutbox(source: Pick<LocalRelationshipConversationsState, "outboxSession" | "freshness">): RelationshipMessageOutbox {
  const currentSession = source.outboxSession;
  const enabled = Boolean(currentSession);
  const [messages, setMessages] = useState<readonly OutboxRelationshipMessage[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const session = useCallback(() => currentSession?.() ?? null, [currentSession]);
  const refresh = useCallback(async () => {
    const current = session();
    if (!current) { setMessages(previous => previous.length === 0 ? previous : []); return; }
    try {
      const overlay = await current.readOutboxOverlay("relationship_message");
      const next = outboxRelationshipMessages(overlay?.queuedMutations ?? []);
      setMessages(previous => sameMessages(previous, next) ? previous : next);
      setFailure(previous => previous === null ? previous : null);
    } catch {
      setFailure(previous => previous ?? "本机待发送消息暂时无法读取。");
    }
  }, [session]);
  useEffect(() => { void refresh(); }, [refresh, source.freshness.lastSyncedAt, source.freshness.refreshing, source.freshness.offline]);
  const required = useCallback(() => {
    const current = session();
    if (!current) throw new Error("本机消息同步范围尚未就绪。");
    return current;
  }, [session]);
  const enqueue = useCallback(async (input: { conversationId: string; body: string; qualificationVersion: string; retireDraftThrough: string | null }) => {
    await required().enqueueOfflineMessageMutation(buildOfflineMessageMutation({ ...input, requestId: randomUUID(), createdAt: new Date().toISOString() }));
    await refresh();
  }, [required, refresh]);
  const retry = useCallback(async (mutationId: string) => {
    await required().retryOfflineMessage(mutationId);
    await refresh();
  }, [required, refresh]);
  const discard = useCallback(async (mutationIds: readonly string[]) => {
    await required().discardOfflineMessages(mutationIds);
    await refresh();
  }, [required, refresh]);
  return useMemo(() => ({ enabled, messages, failure, enqueue, retry, discard, refresh }), [enabled, messages, failure, enqueue, retry, discard, refresh]);
}
