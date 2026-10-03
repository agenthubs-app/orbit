import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { localDayStart, localParts, shiftCalendarDate } from "../../time/date-time";
import { personalScheduleById, personalScheduleSeriesFromMirror, personalScheduleWindow, type MirrorScheduleSeries } from "../../view-models/personal-schedule-occurrences";
import { overlayQueuedScheduleSeries, type ScheduleMutationState } from "../../view-models/personal-schedule-overlay";
import type { ScheduleOutbox } from "../../data/sync/useOfflineScheduleOutbox";
import type { LocalSyncQueuedMutation } from "../../data/sync/local-sync-repository";

/**
 * Mirror-backed personal-schedule list, detail and write status (sprint 0108),
 * shared by native and (when the browser mirror is active) the browser build.
 */
export interface PersonalScheduleStatus {
  offline: boolean;
  lastSyncedAt: string | null;
  syncLabelKey: MessageKey | null;
}

export interface PersonalScheduleListSource extends PersonalScheduleStatus {
  items: PersonalScheduleContract[] | null;
  /** Sprint 0134: rows changed on this device and not yet confirmed by the server (native only). */
  localStates?: Record<string, ScheduleMutationState>;
  /** Sprint 0134: present where schedule writes can be queued offline (native). */
  outbox?: ScheduleOutbox | null;
  loading: boolean;
  failed: boolean;
  refresh(): void;
}

export interface PersonalScheduleItemSource extends PersonalScheduleStatus {
  item: PersonalScheduleContract | null;
  /** Sprint 0134 (native): this item's own queued change, its conflict or failure, and its mirror revision. */
  localMutationState?: ScheduleMutationState | null;
  conflict?: LocalSyncQueuedMutation | null;
  failure?: LocalSyncQueuedMutation | null;
  /** True while this item has any queued change (its next write must queue behind it). */
  queued?: boolean;
  baseRevision?: string | null;
  outbox?: ScheduleOutbox | null;
  loading: boolean;
  /** Something to translate, or a message to show as is; both empty when there is no error. */
  errorKey: MessageKey | null;
  errorText: string;
  refresh(): void;
}

export interface PersonalScheduleWriteStatus extends PersonalScheduleStatus {
  /** Sprint 0134: present where schedule writes can be queued offline (native). */
  outbox?: ScheduleOutbox | null;
  /** After a confirmed write: pull it into the mirror; false when the pull did not complete. */
  confirmSaved(): Promise<boolean>;
}

export type SyncedSchedule = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

/** The list window the page always used: the local today plus 90 days. */
export function personalScheduleListWindow(timeZone: string, now = Date.now()): { from: string; to: string } | null {
  const date = localParts(new Date(now), timeZone).date;
  const from = localDayStart(date, timeZone), to = localDayStart(shiftCalendarDate(date, 90), timeZone);
  return from === null || to === null ? null : { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

function overlaid(series: MirrorScheduleSeries[] | null, outbox: ScheduleOutbox | null, actorId: string) {
  if (!series || !outbox?.queuedMutations.length) return { series, states: {} as Record<string, ScheduleMutationState> };
  return overlayQueuedScheduleSeries(series, outbox.queuedMutations, actorId);
}

export function mirrorScheduleList(state: SyncedSchedule, input: { actorId: string; ready: boolean; timeZone: string }, now = Date.now(), outbox: ScheduleOutbox | null = null): PersonalScheduleListSource {
  const freshness = mirrorFreshness(state, input.ready);
  const { series, states } = overlaid(freshness.readable ? personalScheduleSeriesFromMirror(state.records, input.actorId) : null, outbox, input.actorId);
  const window = personalScheduleListWindow(input.timeZone, now);
  let items: PersonalScheduleContract[] | null = null;
  try { items = series && window ? personalScheduleWindow(series, window, now) : null; } catch { items = null; }
  return {
    items,
    loading: freshness.loading,
    failed: Boolean(freshness.failure) || (freshness.readable && items === null),
    localStates: states,
    outbox,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    refresh: state.refresh,
  };
}

export function mirrorScheduleItem(state: SyncedSchedule, input: { actorId: string; ready: boolean; id: string }, now = Date.now(), outbox: ScheduleOutbox | null = null): PersonalScheduleItemSource {
  const freshness = mirrorFreshness(state, input.ready && Boolean(input.id));
  // Only this item's own queued changes are overlaid (0133 lesson: other rows' queue must not leak into a detail).
  const own = outbox ? { ...outbox, queuedMutations: outbox.queuedMutations.filter(row => row.id === input.id) } : null;
  const { series, states } = overlaid(freshness.readable ? personalScheduleSeriesFromMirror(state.records, input.actorId) : null, own, input.actorId);
  const latest = (wanted: LocalSyncQueuedMutation["state"]) => own?.queuedMutations.filter(row => row.state === wanted).at(-1) ?? null;
  let item: PersonalScheduleContract | null = null;
  try { item = series ? personalScheduleById(series, input.id, now) : null; } catch { item = null; }
  return {
    item,
    loading: freshness.loading,
    errorKey: freshness.failure === "sync.failure" ? "sync.failure" : !freshness.failure && freshness.readable && !item ? "schedule.readUnconfirmed" : null,
    errorText: freshness.failure && freshness.failure !== "sync.failure" ? freshness.failure : "",
    localMutationState: states[input.id] ?? null,
    conflict: latest("conflict"),
    failure: latest("failed"),
    queued: Boolean(own?.queuedMutations.length),
    baseRevision: state.records.find(record => record.id === input.id && record.deletedAt === null)?.revision ?? null,
    outbox,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    refresh: state.refresh,
  };
}

export function mirrorScheduleWriteStatus(state: SyncedSchedule, ready: boolean, outbox: ScheduleOutbox | null = null): PersonalScheduleWriteStatus {
  const freshness = mirrorFreshness(state, ready);
  return {
    outbox,
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    async confirmSaved() { return (await state.invalidate())?.status === "fresh"; },
  };
}

