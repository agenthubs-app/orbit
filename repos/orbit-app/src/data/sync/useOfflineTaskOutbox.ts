import { useCallback, useEffect, useState } from "react";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";
import type { OfflineTaskMutationInput } from "./sync-coordinator";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

type SyncedTaskCollection = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

export function useOfflineTaskOutbox(state: SyncedTaskCollection, enabled = true) {
  const [queuedMutations, setQueuedMutations] = useState<LocalSyncQueuedMutation[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const { t } = useOrbitLocale();
  const refreshQueued = useCallback(async () => {
    const session = state.currentSession();
    if (!session) { setQueuedMutations([]); return; }
    try {
      const overlay = await session.readOutboxOverlay("task");
      setQueuedMutations([...(overlay?.queuedMutations ?? [])]);
      setFailure(null);
    } catch {
      setFailure(t("tasks.outboxReadFailed"));
    }
  }, [state.currentSession, t]);
  useEffect(() => { if (enabled) void refreshQueued(); else { setQueuedMutations([]); setFailure(null); } }, [enabled, refreshQueued, state.lastSyncedAt, state.records, state.status]);
  const enqueueOfflineMutation = useCallback(async (mutation: OfflineTaskMutationInput) => {
    const session = state.currentSession();
    if (!session || !enabled) throw new Error(t("tasks.outboxNotReady"));
    await session.enqueueOfflineTaskMutation(mutation);
    await refreshQueued();
  }, [enabled, refreshQueued, state.currentSession, t]);
  return { queuedMutations, queueFailure: failure, refreshQueued, enqueueOfflineMutation };
}
