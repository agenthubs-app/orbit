import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { AppState } from "react-native";

import type { OrbitApiClient } from "../../api/client";
import { projectHomeWidgetCards } from "../../widgets/project-home";
import { readHomeWidgetSources } from "../../widgets/read-home-sources";
import { widgetSnapshotRuntime } from "../../widgets/native-runtime";
import { pageCopyFreshness } from "../../data/sync/page-copy-freshness";

/** LF1: a published snapshot is kept this long; Home focus and foreground no longer re-read seven endpoints each time. */
export const WIDGET_REFRESH_INTERVAL_MS = 15 * 60_000;
const lastPublished = new Map<string, { at: string; layoutRevision: number; refreshRevision: number }>();
/** Tests only. */
export function resetWidgetSnapshotThrottle(): void { lastPublished.clear(); }

/** Refresh only from online R10 reads while the authenticated Home is in focus. */
export function useHomeWidgetSnapshot(input: {
  actorId: string; baseUrl: string; client: OrbitApiClient; timeZone: string;
  layoutRevision: number; layoutReady: boolean; offline: boolean; refreshRevision: number;
}) {
  const { actorId, baseUrl, client, timeZone, layoutRevision, layoutReady, offline, refreshRevision } = input;
  useFocusEffect(useCallback(() => {
    if (!layoutReady || offline) return;
    let active = true;
    let reading = false;
    const scope = `${baseUrl}\u0000${actorId}`;
    const refresh = async () => {
      if (reading || !active) return;
      const prior = lastPublished.get(scope);
      // Same layout, no user-triggered refresh, no write since the last publish, and within the interval: keep it.
      if (prior && prior.layoutRevision === layoutRevision && prior.refreshRevision === refreshRevision
        && pageCopyFreshness.isFresh(prior.at, WIDGET_REFRESH_INTERVAL_MS)) return;
      reading = true;
      try {
        if (!await widgetSnapshotRuntime.activate(baseUrl, actorId) || !active) return;
        const now = new Date();
        const sources = await readHomeWidgetSources(client, actorId, timeZone, now);
        if (!active) return;
        const widgets = projectHomeWidgetCards(sources);
        if (Object.values(widgets).every(widget => widget.status === "unavailable")) return;
        await widgetSnapshotRuntime.publish({ baseUrl, actorId, now, timeZone, layoutRevision, widgets });
        lastPublished.set(scope, { at: now.toISOString(), layoutRevision, refreshRevision });
      } catch (error) {
        console.warn("WIDGET_HOME_REFRESH_FAILED", error);
      } finally { reading = false; }
    };
    void refresh();
    const listener = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { active = false; listener.remove(); };
  }, [actorId, baseUrl, client, timeZone, layoutRevision, layoutReady, offline, refreshRevision]));
}
