import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";
import type { OfflineScheduleMutationInput } from "./sync-coordinator";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";

type SyncedSchedule = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

/** Sprint 0134: what the schedule screens need from the native outbox (the browser build has none). */
export interface ScheduleOutbox {
  queuedMutations: readonly LocalSyncQueuedMutation[];
  queueFailure: string | null;
  enqueue(mutation: OfflineScheduleMutationInput): Promise<void>;
  resolveConflict(input: { mutationId: string; resolution: "server" | "replace"; replacement?: OfflineScheduleMutationInput }): Promise<void>;
  refresh(): Promise<void>;
}

export function useOfflineScheduleOutbox(state: SyncedSchedule, enabled = true): ScheduleOutbox | null {
  const [queuedMutations, setQueuedMutations] = useState<LocalSyncQueuedMutation[]>([]);
  const [queueFailure, setQueueFailure] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    const session = state.currentSession();
    if (!session) { setQueuedMutations(previous => previous.length ? [] : previous); return; }
    try {
      const overlay = await session.readOutboxOverlay("personal_schedule");
      const next = [...(overlay?.queuedMutations ?? [])];
      // Keep the same array while nothing changed, so a mirror refresh does not re-render every reader.
      setQueuedMutations(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
      setQueueFailure(null);
    } catch {
      setQueueFailure("本机待同步日程暂时无法读取。");
    }
  }, [state.currentSession]);
  useEffect(() => { if (enabled) void refresh(); else { setQueuedMutations(previous => previous.length ? [] : previous); setQueueFailure(null); } }, [enabled, refresh, state.lastSyncedAt, state.records, state.status]);
  const enqueue = useCallback(async (mutation: OfflineScheduleMutationInput) => {
    const session = state.currentSession();
    if (!session || !enabled) throw new Error("本机日程同步范围尚未就绪。");
    await session.enqueueOfflineScheduleMutation(mutation);
    await refresh();
  }, [enabled, refresh, state.currentSession]);
  const resolveConflict = useCallback(async (input: Parameters<ScheduleOutbox["resolveConflict"]>[0]) => {
    const session = state.currentSession();
    if (!session?.resolveScheduleConflict || !enabled) throw new Error("本机日程同步范围尚未就绪。");
    await session.resolveScheduleConflict(input);
    await refresh();
  }, [enabled, refresh, state.currentSession]);
  return useMemo(() => enabled ? { queuedMutations, queueFailure, enqueue, resolveConflict, refresh } : null,
    [enabled, queuedMutations, queueFailure, enqueue, resolveConflict, refresh]);
}
