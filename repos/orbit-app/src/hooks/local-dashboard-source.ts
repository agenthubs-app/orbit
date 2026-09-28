import { useEffect, useMemo, useState } from "react";

import type { DashboardLocalSections } from "../api/compute/dashboard-local";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { mirrorFreshness, type MirrorFreshness } from "../data/sync/mirror-freshness";
import { dashboardGraphRows, localDashboardSections } from "../view-models/dashboard-local";
import { useMirrorProbe } from "./useMirrorProbe";
import { useSyncedCollection } from "./useSyncedCollection";

/**
 * Sprint 0117: the dashboard and contacts-analysis sections computed from the
 * device mirror (sync domain "dashboard-graph"), shared by useLocalDashboard
 * (native: the mirror is always the source) and useLocalDashboard.web.ts (only
 * when the browser mirror is active). Opening the page probes the server (0108
 * pattern), so a lost connection turns into the 「截至」 notice.
 */
export interface LocalDashboardState {
  /** The device mirror is this platform's source for the dashboard. */
  available: boolean;
  /** The computed sections, once the mirror is readable; null before. */
  sections: DashboardLocalSections | null;
  /** A computation error (never expected: the rows are validated). */
  error: string | null;
  freshness: MirrorFreshness;
  refresh(): void;
}

export function useLocalDashboardSource(available: boolean, probe: boolean): LocalDashboardState {
  const auth = useOrbitAuthSession();
  const actorId = auth.actorId ?? "";
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "dashboard_graph" });
  const refresh = state.refresh;
  useMirrorProbe(refresh, available && probe);
  const freshness = mirrorFreshness(state, available);
  const rows = useMemo(() => (available ? dashboardGraphRows(state.records) : []), [available, state.records]);
  const [computed, setComputed] = useState<{ actorId: string; sections: DashboardLocalSections | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!available || !freshness.readable || !actorId) return;
    let active = true;
    localDashboardSections(rows, { actorId, now: new Date().toISOString() }).then(
      (sections) => { if (active) setComputed({ actorId, sections, error: null }); },
      (error: unknown) => { if (active) setComputed({ actorId, sections: null, error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { active = false; };
  }, [actorId, available, freshness.readable, rows]);
  // While a new copy is computed the previous result stays on screen, but
  // never another account's.
  const current = available && freshness.readable && computed && computed.actorId === actorId ? computed : null;
  return useMemo(() => ({
    available,
    sections: current?.sections ?? null,
    error: current?.error ?? null,
    freshness,
    refresh: () => { void refresh(); },
  }), [available, current, freshness.readable, freshness.offline, freshness.loading, freshness.failure, freshness.lastSyncedAt, freshness.refreshing, refresh]);
}
