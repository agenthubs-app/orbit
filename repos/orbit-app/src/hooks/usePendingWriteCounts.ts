import { useCallback, useEffect, useState } from "react";

import type { SyncChangeKind } from "../api/contract/sync";
import { NO_PENDING_WRITES, type PendingWriteCounts } from "./pending-write-items";
import { useSyncedCollection } from "./useSyncedCollection";

export { NO_PENDING_WRITES, pendingWriteItems, type PendingWriteCounts } from "./pending-write-items";

const KINDS: readonly (keyof PendingWriteCounts & SyncChangeKind)[] = ["note", "task", "personal_schedule", "relationship_message"];

/**
 * Sprint 0136 (承接 0036 SC-03): how many of this account's writes are still only on the
 * device, per kind — notes, personal tasks, personal schedule, unsent messages. Counts
 * only (never content). It re-reads whenever the device copy changes (an enqueue, an
 * acknowledgement, a completed sync) and starts from zero for every signed-in scope, so
 * another account's counts never show. The browser build (D2) has no queue: see .web.ts.
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
