import { useMemo } from "react";

import type { ContactSyncPayload } from "../api/contract/contact-local-directory";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { contactSyncPayloads } from "../view-models/contacts-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0116: the account's contacts from the device mirror (sync domain
 * "contacts"), shared by useLocalContacts (native: the mirror is always the
 * source) and useLocalContacts.web.ts (only when the browser mirror is active).
 * A page's primary consumer probes the server on open (0108 pattern), so a
 * lost connection turns into the 「截至」 notice.
 */
export interface LocalContactsState {
  /** The device mirror is this platform's source for contacts. */
  available: boolean;
  rows: readonly ContactSyncPayload[];
  freshness: MirrorFreshness;
  refresh(): void;
}

export function useLocalContactsSource(available: boolean, probe: boolean): LocalContactsState {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "contact" });
  const refresh = state.refresh;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const rows = useMemo(() => (available ? contactSyncPayloads(state.records) : []), [available, state.records]);
  return useMemo(() => ({ available, rows, freshness, refresh: () => { void refresh(); } }),
    [available, rows, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh]);
}

