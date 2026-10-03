import { useCallback, useEffect, useState } from "react";

import type { SyncChangeKind } from "../api/contract/sync";
import type { MessageKey } from "../i18n/messages";
import { useSyncedCollection } from "./useSyncedCollection";

export interface PendingWriteCounts {
  note: number;
  task: number;
  personal_schedule: number;
  relationship_message: number;
}

const KINDS: readonly (keyof PendingWriteCounts & SyncChangeKind)[] = ["note", "task", "personal_schedule", "relationship_message"];
export const NO_PENDING_WRITES: PendingWriteCounts = { note: 0, task: 0, personal_schedule: 0, relationship_message: 0 };

/**
 * Sprint 0136 (承接 0036 SC-03): how many of this account's writes are still only on the
 * device, per kind — notes, personal tasks, personal schedule, unsent messages. Counts
 * only (never content). It re-reads whenever the device copy changes (an enqueue, an
 * acknowledgement, a completed sync) and starts from zero for every signed-in scope, so
 * another account's counts never show.
 */
export function usePendingWriteCounts(enabled = true): PendingWriteCounts {
  const state = useSyncedCollection({ kind: "note", records: false });
  const [counts, setCounts] = useState<PendingWriteCounts>(NO_PENDING_WRITES);
  const refresh = useCallback(async () => {
    const session = enabled ? state.currentSession() : null;
    if (!session) { setCounts(NO_PENDING_WRITES); return; }
    const next = { ...NO_PENDING_WRITES };
    for (const kind of KINDS) {
      try {
        next[kind] = (await session.readOutboxOverlay(kind))?.queuedMutations.length ?? 0;
      } catch {
        next[kind] = 0;
      }
    }
    setCounts(previous => KINDS.every(kind => previous[kind] === next[kind]) ? previous : next);
  }, [enabled, state.currentSession]);
  useEffect(() => { void refresh(); }, [refresh, state.lastSyncedAt, state.records, state.status]);
  return counts;
}

/** The AI page's one gray line: 「有 2 项笔记修改、1 条待发送消息还没同步，AI 暂时看不到」; empty when nothing waits. */
export function pendingWriteItems(counts: PendingWriteCounts, t: (key: MessageKey, values?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  const add = (count: number, many: MessageKey, one: MessageKey) => {
    if (count > 0) parts.push(count === 1 ? t(one) : t(many, { count }));
  };
  add(counts.note, "aiConversation.pendingNotes", "aiConversation.pendingNotesOne");
  add(counts.task, "aiConversation.pendingTasks", "aiConversation.pendingTasksOne");
  add(counts.personal_schedule, "aiConversation.pendingSchedule", "aiConversation.pendingScheduleOne");
  add(counts.relationship_message, "aiConversation.pendingMessages", "aiConversation.pendingMessagesOne");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return parts.slice(0, -1).join(t("aiConversation.pendingSeparator")) + t("aiConversation.pendingLastSeparator") + parts.at(-1)!;
}
