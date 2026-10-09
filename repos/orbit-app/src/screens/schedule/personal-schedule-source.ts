import { useMemo } from "react";
import { Platform } from "react-native";

import { useMirrorProbe } from "../../hooks/useMirrorProbe";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOfflineScheduleOutbox } from "../../data/sync/useOfflineScheduleOutbox";
import {
  mirrorScheduleItem,
  mirrorScheduleList,
  mirrorScheduleWriteStatus,
  type PersonalScheduleItemSource,
  type PersonalScheduleListSource,
  type PersonalScheduleWriteStatus,
} from "./personal-schedule-source-mirror";

export type { PersonalScheduleItemSource, PersonalScheduleListSource, PersonalScheduleWriteStatus } from "./personal-schedule-source-mirror";

/**
 * Native personal-schedule source (sprint 0108): the lease-fed device mirror.
 * The list and the detail are derived locally (occurrences, per-occurrence
 * edits, state); the coordinator only pulls changes. The browser build
 * resolves personal-schedule-source.web.ts (mirror-first when the browser
 * mirror is available, the network otherwise).
 */
export function usePersonalScheduleList(input: { actorId: string; ready: boolean; scopeKey: string; timeZone: string }): PersonalScheduleListSource {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const outbox = useOfflineScheduleOutbox(state, Platform.OS !== "web" && input.ready);
  useMirrorProbe(state.refresh, input.ready);
  // Keyed on the snapshot fields, not the hook result (a new object every render).
  return useMemo(() => mirrorScheduleList(state, input, Date.now(), outbox), [state.records, state.status, state.lastSyncedAt, state.error, state.refresh, input.actorId, input.ready, input.timeZone, outbox]);
}

export function usePersonalScheduleItem(input: { actorId: string; ready: boolean; scopeKey: string; id: string }): PersonalScheduleItemSource {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const outbox = useOfflineScheduleOutbox(state, Platform.OS !== "web" && input.ready);
  useMirrorProbe(state.refresh, input.ready && Boolean(input.id));
  return useMemo(() => mirrorScheduleItem(state, input, Date.now(), outbox), [state.records, state.status, state.lastSyncedAt, state.error, state.refresh, input.actorId, input.ready, input.id, outbox]);
}

export function usePersonalScheduleWriteStatus(input: { actorId: string; ready: boolean }): PersonalScheduleWriteStatus {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const outbox = useOfflineScheduleOutbox(state, Platform.OS !== "web" && input.ready && Boolean(input.actorId));
  useMirrorProbe(state.refresh, input.ready && Boolean(input.actorId));
  return useMemo(() => mirrorScheduleWriteStatus(state, input.ready && Boolean(input.actorId), outbox), [state.status, state.lastSyncedAt, state.error, state.invalidate, input.ready, input.actorId, outbox]);
}
