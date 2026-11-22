import { useCallback, useEffect, useState } from "react";

import type { SyncChangeKind } from "../api/contract/sync";
import { CARD_PENDING_KINDS, pendingTargetsOf } from "./card-pending-targets";
import { useSyncedCollection } from "./useSyncedCollection";

export { pendingTargetsOf } from "./card-pending-targets";

/**
 * agent-design AG07 (设计稿 §7, PLANNER 易错边界 4): the records on this device with an edit not synced yet, by
 * record (not a count per kind), so a card that changes one of them cannot be confirmed ("先同步你的修改").
 * Re-read whenever the device copy changes (an enqueue, an acknowledgement, a completed sync); `syncedAt` moves
 * when a sync finished, so the screen asks the server to look at its waiting card again.
 * The browser build has no queue: see .web.ts.
 */
export function useCardLocalPendingEdits(enabled = true): { pendingTargets: readonly string[]; syncedAt: string | null } {
  const state = useSyncedCollection({ kind: "task", records: false });
  const [targets, setTargets] = useState<readonly string[]>([]);
  const refresh = useCallback(async () => {
    const session = enabled ? state.currentSession() : null;
    if (!session) { setTargets([]); return; }
    const mutations: { kind: string; id: string }[] = [];
    for (const kind of CARD_PENDING_KINDS as SyncChangeKind[]) {
      try {
        mutations.push(...((await session.readOutboxOverlay(kind))?.queuedMutations ?? []));
      } catch {
        // An outbox that cannot be read adds no target for that kind.
      }
    }
    const next = pendingTargetsOf(mutations);
    setTargets((previous) => (previous.join("\n") === next.join("\n") ? previous : next));
  }, [enabled, state.currentSession]);
  useEffect(() => { void refresh(); }, [refresh, state.lastSyncedAt, state.records, state.status]);
  return { pendingTargets: targets, syncedAt: state.lastSyncedAt ?? null };
}
