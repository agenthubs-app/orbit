import { useEffect, useMemo, useState } from "react";
import type { LocalSyncQueuedMutation } from "./local-sync-repository";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";

type SyncedCollection = Pick<ReturnType<typeof useSyncedCollection<Record<string, unknown>>>, "currentSession" | "records" | "lastSyncedAt" | "status">;

/**
 * Sprint 0145 (design step 9): a detail page opened on a `local:` id, like notes do, follows its create
 * to the formal id once the upload is acknowledged (the alias table from 0124). `pending` is true from
 * the moment the queued create is gone until the alias has been looked up, so the page shows loading,
 * not 找不到, in between; `canonicalId` is the formal id to move to.
 */
export function useLocalAlias(
  state: SyncedCollection,
  kind: "task" | "personal_schedule",
  id: string,
  queuedMutations: readonly LocalSyncQueuedMutation[] | undefined,
): { canonicalId: string | null; pending: boolean } {
  const local = id.startsWith("local:");
  const createQueued = local && (queuedMutations ?? []).some(row => row.id === id && row.operation === "create");
  // A new token whenever the device copy or the queue moved: each move is a reason to look again.
  const token = useMemo(() => ({}), [id, state.records, state.lastSyncedAt, state.status, queuedMutations]);
  const [checked, setChecked] = useState<{ id: string; token: object; canonicalId: string | null } | null>(null);
  useEffect(() => {
    if (!local || createQueued) return;
    let current = true;
    const session = state.currentSession();
    if (!session) { setChecked({ id, token, canonicalId: null }); return; }
    void session.resolveLocalAlias(kind, id).then(
      canonicalId => { if (current) setChecked(previous => ({ id, token, canonicalId: canonicalId ?? (previous?.id === id ? previous.canonicalId : null) })); },
      () => { if (current) setChecked({ id, token, canonicalId: null }); },
    );
    return () => { current = false; };
  }, [token, local, createQueued, kind, state.currentSession]);
  const canonicalId = local && checked?.id === id ? checked.canonicalId : null;
  return { canonicalId, pending: local && !createQueued && !canonicalId && checked?.token !== token };
}
