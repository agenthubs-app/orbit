import type { MessageKey } from "../../i18n/messages";
import type { SyncedCollectionSnapshot } from "./sync-coordinator";

/**
 * Sprint 0108: what a mirror-backed screen may say about its data, shared by
 * the notes and personal-schedule sources (the tasks list keeps its own
 * mapping from 0087 with the same rules).
 *
 * - `readable`: a sync has completed at least once, so the mirror (possibly
 *   empty) is a fact. Before that the screen shows loading, never "empty".
 * - `offline`: the last sync attempt failed after the mirror became readable.
 *   The screen keeps showing the mirror, says "as of lastSyncedAt", and turns
 *   off anything that writes (writes need the network until 0120).
 */
export interface MirrorFreshness {
  readable: boolean;
  loading: boolean;
  failure: string | null;
  refreshing: boolean;
  offline: boolean;
  lastSyncedAt: string | null;
  syncLabelKey: MessageKey;
}

type Snapshot = Pick<SyncedCollectionSnapshot<unknown>, "error" | "lastSyncedAt" | "status">;

export function mirrorFreshness(state: Snapshot, ready: boolean): MirrorFreshness {
  const readable = ready && (state.lastSyncedAt !== null || state.status === "fresh" || state.status === "local-ready" || state.status === "stale");
  const attemptFailed = state.status === "stale" || state.status === "failure";
  return {
    readable,
    loading: ready && !readable && state.status !== "failure",
    failure: ready && !readable && state.status === "failure" ? state.error ?? "sync.failure" : null,
    refreshing: state.status === "syncing",
    offline: readable && attemptFailed,
    lastSyncedAt: state.lastSyncedAt,
    syncLabelKey: `sync.${state.status === "local-ready" ? "localReady" : state.status === "unsynced" ? "syncing" : state.status}` as MessageKey,
  };
}
