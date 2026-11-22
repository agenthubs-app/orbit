import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";
import type { OfflineScheduleMutationInput } from "./sync-coordinator";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";

type SyncedSchedule = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

/** Sprint 0134: what the schedule screens need from the native outbox (the browser build has none). */
export interface ScheduleOutbox {
  queuedMutations: readonly LocalSyncQueuedMutation[];
  queueFailure: string | null;
  enqueue(mutation: OfflineScheduleMutationInput): Promise<void>;
  resolveConflict(input: { mutationId: string; resolution: "server" | "replace"; replacement?: OfflineScheduleMutationInput }): Promise<void>;
  refresh(): Promise<void>;
  /** Sprint 0136: put a refused write back in the queue / give it up (「未能保存 · 重试 / 放弃」). */
  retry(mutationId: string): Promise<void>;
  discard(mutationId: string): Promise<void>;
}

export function useOfflineScheduleOutbox(state: SyncedSchedule, enabled = true): ScheduleOutbox | null {
  const [queuedMutations, setQueuedMutations] = useState<LocalSyncQueuedMutation[]>([]);
  const [queueFailure, setQueueFailure] = useState<string | null>(null);
  const { t } = useOrbitLocale();
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
      setQueueFailure(t("schedule.outboxReadFailed"));
    }
  }, [state.currentSession, t]);
  useEffect(() => { if (enabled) void refresh(); else { setQueuedMutations(previous => previous.length ? [] : previous); setQueueFailure(null); } }, [enabled, refresh, state.lastSyncedAt, state.records, state.status]);
  const enqueue = useCallback(async (mutation: OfflineScheduleMutationInput) => {
    const session = state.currentSession();
    if (!session || !enabled) throw new Error(t("schedule.outboxNotReady"));
    await session.enqueueOfflineScheduleMutation(mutation);
    await refresh();
  }, [enabled, refresh, state.currentSession, t]);
  const resolveConflict = useCallback(async (input: Parameters<ScheduleOutbox["resolveConflict"]>[0]) => {
    const session = state.currentSession();
    if (!session?.resolveScheduleConflict || !enabled) throw new Error(t("schedule.outboxNotReady"));
    await session.resolveScheduleConflict(input);
    await refresh();
  }, [enabled, refresh, state.currentSession, t]);
  const retry = useCallback(async (mutationId: string) => {
    const session = state.currentSession();
    if (!session?.retryOfflineWrite || !enabled) throw new Error(t("schedule.outboxNotReady"));
    await session.retryOfflineWrite("personal_schedule", mutationId);
    await refresh();
  }, [enabled, refresh, state.currentSession, t]);
  const discard = useCallback(async (mutationId: string) => {
    const session = state.currentSession();
    if (!session?.discardOfflineWrite || !enabled) throw new Error(t("schedule.outboxNotReady"));
    await session.discardOfflineWrite("personal_schedule", mutationId);
    await refresh();
  }, [enabled, refresh, state.currentSession, t]);
  return useMemo(() => enabled ? { queuedMutations, queueFailure, enqueue, resolveConflict, refresh, retry, discard } : null,
    [enabled, queuedMutations, queueFailure, enqueue, resolveConflict, refresh, retry, discard]);
}
