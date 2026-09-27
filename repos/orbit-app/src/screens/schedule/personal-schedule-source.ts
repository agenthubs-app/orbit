import { useMemo } from "react";

import { useSyncedCollection } from "../../hooks/useSyncedCollection";
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
  // Keyed on the snapshot fields, not the hook result (a new object every render).
  return useMemo(() => mirrorScheduleList(state, input), [state.records, state.status, state.lastSyncedAt, state.error, state.refresh, input.actorId, input.ready, input.timeZone]);
}

export function usePersonalScheduleItem(input: { actorId: string; ready: boolean; scopeKey: string; id: string }): PersonalScheduleItemSource {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  return useMemo(() => mirrorScheduleItem(state, input), [state.records, state.status, state.lastSyncedAt, state.error, state.refresh, input.actorId, input.ready, input.id]);
}

export function usePersonalScheduleWriteStatus(input: { actorId: string; ready: boolean }): PersonalScheduleWriteStatus {
  const state = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  return useMemo(() => mirrorScheduleWriteStatus(state, input.ready && Boolean(input.actorId)), [state.status, state.lastSyncedAt, state.error, state.invalidate, input.ready, input.actorId]);
}
