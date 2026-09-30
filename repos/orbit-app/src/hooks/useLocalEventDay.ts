import { useCallback, useMemo } from "react";

import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import type { LocalEventDayRecords } from "../view-models/event-day-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0115: the registered attendee's event day from the device mirror —
 * the three event domains (the lease grants them; the browser mirror lists
 * them too). The page shows the device copy at once and probes the server on
 * open (0108 pattern), so a lost connection turns into the 「截至」 notice.
 * Where no mirror exists (an online-only browser) the records stay empty and
 * the screens keep their network reads.
 */
export interface LocalEventDayState {
  records: LocalEventDayRecords;
  freshness: MirrorFreshness;
  refresh(): void;
}

export function useLocalEventDay(enabled: boolean): LocalEventDayState {
  const registrations = useSyncedCollection<Record<string, unknown>>({ kind: "event_registration" });
  const events = useSyncedCollection<Record<string, unknown>>({ kind: "registered_event" });
  const results = useSyncedCollection<Record<string, unknown>>({ kind: "event_published_result" });
  const refreshRegistrations = registrations.refresh, refreshEvents = events.refresh, refreshResults = results.refresh;
  // One flight serves all three; each collection subscribes so every snapshot updates.
  const refresh = useCallback(() => { void refreshRegistrations(); void refreshEvents(); void refreshResults(); }, [refreshRegistrations, refreshEvents, refreshResults]);
  useMirrorProbe(refresh, enabled);
  return useMemo(() => ({
    records: { registrations: registrations.records, events: events.records, results: results.records },
    // The registered-events domain carries the day; its sync state is the page's.
    freshness: mirrorFreshness(events, enabled),
    refresh,
  }), [registrations.records, events.records, events.status, events.lastSyncedAt, events.error, results.records, enabled, refresh]);
}
