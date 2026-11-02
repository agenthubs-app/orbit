import { useMemo } from "react";
import { Platform } from "react-native";

import { useMirrorProbe } from "../../hooks/useMirrorProbe";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOfflineScheduleOutbox } from "../../data/sync/useOfflineScheduleOutbox";
import { useLocalAlias } from "../../data/sync/useLocalAlias";
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
  // Sprint 0145: on the local: id of a schedule created offline, wait (loading, not 找不到) for its formal id once uploaded.
  const alias = useLocalAlias(state, "personal_schedule", input.id, outbox?.queuedMutations);
  const source = useMemo(() => mirrorScheduleItem(state, input, Date.now(), outbox), [state.records, state.status, state.lastSyncedAt, state.error, state.refresh, input.actorId, input.ready, input.id, outbox]);
  return useMemo(() => alias.pending || alias.canonicalId
    ? { ...source, loading: true, errorKey: null, errorText: "", canonicalId: alias.canonicalId }
    : source, [source, alias.pending, alias.canonicalId]);
}

export function usePersonalScheduleWriteStatus(input: { actorId: string; ready: boolean }): PersonalScheduleWriteStatus {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const outbox = useOfflineScheduleOutbox(state, Platform.OS !== "web" && input.ready && Boolean(input.actorId));
  useMirrorProbe(state.refresh, input.ready && Boolean(input.actorId));
  return useMemo(() => mirrorScheduleWriteStatus(state, input.ready && Boolean(input.actorId), outbox), [state.status, state.lastSyncedAt, state.error, state.invalidate, input.ready, input.actorId, outbox]);
}
