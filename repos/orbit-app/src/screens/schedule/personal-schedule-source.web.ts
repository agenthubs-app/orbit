import { useCallback, useEffect, useMemo, useState } from "react";

import { personalScheduleList, personalScheduleListPath, personalSchedulePath, readPersonalSchedule } from "../../api/personal-schedule";
import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";
import {
  mirrorScheduleItem,
  mirrorScheduleList,
  mirrorScheduleWriteStatus,
  personalScheduleListWindow,
  type PersonalScheduleItemSource,
  type PersonalScheduleListSource,
  type PersonalScheduleWriteStatus,
} from "./personal-schedule-source-mirror";

/**
 * Browser personal-schedule source, the tasks-page pattern of sprint 0078:
 * mirror-first when the browser mirror is available (personal-schedule is on
 * its whitelist, PLANNER 0077), the network read otherwise. All hooks run
 * unconditionally in a fixed order; the network read is off while the mirror
 * is the source.
 */
const ONLINE = { offline: false, lastSyncedAt: null, syncLabelKey: null } as const;
const VERSION_HEADER = { "x-orbit-personal-schedule-version": "3" };

export function usePersonalScheduleList(input: { actorId: string; ready: boolean; scopeKey: string; timeZone: string }): PersonalScheduleListSource {
  const mirror = useWebMirrorStatus();
  const mirrorActive = mirror.mode === "local-mirror";
  const synced = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const client = useOrbitApiClient({ scopeKey: input.scopeKey });
  const network = !mirrorActive && input.ready;
  const [snapshot, setSnapshot] = useState<{ scopeKey: string; items: PersonalScheduleContract[] | null; loading: boolean; failed: boolean }>({ scopeKey: input.scopeKey, items: null, loading: true, failed: false });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); setSnapshot({ scopeKey: input.scopeKey, items: null, loading: network, failed: false });
    if (!network) return () => controller.abort();
    const window = personalScheduleListWindow(input.timeZone);
    if (!window) { setSnapshot({ scopeKey: input.scopeKey, items: null, loading: false, failed: true }); return () => controller.abort(); }
    const path = `${personalScheduleListPath}&${new URLSearchParams(window)}`;
    void client.get<unknown>(path, { headers: VERSION_HEADER, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const items = result.success ? personalScheduleList(result.data, input.actorId) : null;
      setSnapshot({ scopeKey: input.scopeKey, items, loading: false, failed: items === null });
    }).catch(() => { if (!controller.signal.aborted) setSnapshot({ scopeKey: input.scopeKey, items: null, loading: false, failed: true }); });
    return () => controller.abort();
  }, [network, input.actorId, input.scopeKey, client, revision, input.timeZone]);
  const fromMirror = useMemo(() => mirrorScheduleList(synced, input), [synced.records, synced.status, synced.lastSyncedAt, synced.error, synced.refresh, input.actorId, input.ready, input.timeZone]);
  if (mirrorActive) return fromMirror;
  const state = snapshot.scopeKey === input.scopeKey ? snapshot : { items: null, loading: input.ready, failed: false };
  return { ...state, ...ONLINE, refresh };
}

export function usePersonalScheduleItem(input: { actorId: string; ready: boolean; scopeKey: string; id: string }): PersonalScheduleItemSource {
  const mirror = useWebMirrorStatus();
  const mirrorActive = mirror.mode === "local-mirror";
  const synced = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const client = useOrbitApiClient({ scopeKey: input.scopeKey });
  const network = !mirrorActive && input.ready && Boolean(input.id);
  const [state, setState] = useState<{ item: PersonalScheduleContract | null; loading: boolean; errorKey: "schedule.readUnconfirmed" | "schedule.readFailed" | null; errorText: string }>({ item: null, loading: network, errorKey: null, errorText: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (!network) { setState({ item: null, loading: false, errorKey: null, errorText: "" }); return () => controller.abort(); }
    setState({ item: null, loading: true, errorKey: null, errorText: "" });
    void client.get<unknown>(personalSchedulePath(input.id), { headers: VERSION_HEADER, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      const item = result.success ? readPersonalSchedule(result.data) : null;
      const owned = item && item.id === input.id && item.accountId === input.actorId && item.ownerUserId === input.actorId ? item : null;
      setState({ item: owned, loading: false, errorKey: owned || !result.success ? null : "schedule.readUnconfirmed", errorText: !owned && !result.success ? result.error.message : "" });
    }).catch(() => { if (!controller.signal.aborted) setState({ item: null, loading: false, errorKey: "schedule.readFailed", errorText: "" }); });
    return () => controller.abort();
  }, [network, input.actorId, input.id, client, revision]);
  const fromMirror = useMemo(() => mirrorScheduleItem(synced, input), [synced.records, synced.status, synced.lastSyncedAt, synced.error, synced.refresh, input.actorId, input.ready, input.id]);
  if (mirrorActive) return fromMirror;
  return { ...state, ...ONLINE, refresh: () => setRevision(value => value + 1) };
}

export function usePersonalScheduleWriteStatus(input: { actorId: string; ready: boolean }): PersonalScheduleWriteStatus {
  const mirror = useWebMirrorStatus();
  const synced = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const mirrorActive = mirror.mode === "local-mirror";
  return useMemo(() => mirrorActive ? mirrorScheduleWriteStatus(synced, input.ready && Boolean(input.actorId)) : { ...ONLINE, async confirmSaved() { return true; } },
    [mirrorActive, synced.status, synced.lastSyncedAt, synced.error, synced.invalidate, input.ready, input.actorId]);
}
