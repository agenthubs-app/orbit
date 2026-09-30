import { useMemo } from "react";

import type { InboxDeviceNotification } from "../api/compute/inbox-local";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { inboxDeviceRows } from "../view-models/inbox-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0118: the typed inbox from the device mirror (sync domain
 * "inbox-notifications"), shared by useLocalInbox (native: the mirror is always
 * the source) and useLocalInbox.web.ts (only when the browser mirror is active).
 * The page that shows the inbox probes the server on open (0108 pattern), so a
 * lost connection turns into the 「截至」 notice.
 */
export interface LocalInboxState {
  /** The device mirror is this platform's source for the inbox. */
  available: boolean;
  rows: readonly InboxDeviceNotification[];
  freshness: MirrorFreshness;
  refresh(): Promise<unknown>;
}

export function useLocalInboxSource(available: boolean, probe: boolean): LocalInboxState {
  const auth = useOrbitAuthSession();
  const actorId = auth.actorId ?? "";
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "inbox_notification" });
  const refresh = state.refresh;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const rows = useMemo(() => (available && actorId ? inboxDeviceRows(state.records, actorId) : []), [available, actorId, state.records]);
  return useMemo(() => ({ available, rows, freshness, refresh }),
    [available, rows, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh]);
}
