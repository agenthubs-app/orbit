import type { PersonalScheduleContract } from "../../api/contract/tasks";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import type { MessageKey } from "../../i18n/messages";
import { localDayStart, localParts, shiftCalendarDate } from "../../time/date-time";
import { personalScheduleById, personalScheduleSeriesFromMirror, personalScheduleWindow } from "../../view-models/personal-schedule-occurrences";

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
  loading: boolean;
  failed: boolean;
  refresh(): void;
}

export interface PersonalScheduleItemSource extends PersonalScheduleStatus {
  item: PersonalScheduleContract | null;
  loading: boolean;
  /** Something to translate, or a message to show as is; both empty when there is no error. */
  errorKey: MessageKey | null;
  errorText: string;
  refresh(): void;
}

export interface PersonalScheduleWriteStatus extends PersonalScheduleStatus {
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

export function mirrorScheduleList(state: SyncedSchedule, input: { actorId: string; ready: boolean; timeZone: string }, now = Date.now()): PersonalScheduleListSource {
  const freshness = mirrorFreshness(state, input.ready);
  const series = freshness.readable ? personalScheduleSeriesFromMirror(state.records, input.actorId) : null;
  const window = personalScheduleListWindow(input.timeZone, now);
  let items: PersonalScheduleContract[] | null = null;
  try { items = series && window ? personalScheduleWindow(series, window, now) : null; } catch { items = null; }
  return {
    items,
    loading: freshness.loading,
    failed: Boolean(freshness.failure) || (freshness.readable && items === null),
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    refresh: state.refresh,
  };
}

export function mirrorScheduleItem(state: SyncedSchedule, input: { actorId: string; ready: boolean; id: string }, now = Date.now()): PersonalScheduleItemSource {
  const freshness = mirrorFreshness(state, input.ready && Boolean(input.id));
  const series = freshness.readable ? personalScheduleSeriesFromMirror(state.records, input.actorId) : null;
  let item: PersonalScheduleContract | null = null;
  try { item = series ? personalScheduleById(series, input.id, now) : null; } catch { item = null; }
  return {
    item,
    loading: freshness.loading,
    errorKey: freshness.failure === "sync.failure" ? "sync.failure" : !freshness.failure && freshness.readable && !item ? "schedule.readUnconfirmed" : null,
    errorText: freshness.failure && freshness.failure !== "sync.failure" ? freshness.failure : "",
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    refresh: state.refresh,
  };
}

export function mirrorScheduleWriteStatus(state: SyncedSchedule, ready: boolean): PersonalScheduleWriteStatus {
  const freshness = mirrorFreshness(state, ready);
  return {
    offline: freshness.offline,
    lastSyncedAt: freshness.lastSyncedAt,
    syncLabelKey: freshness.syncLabelKey,
    async confirmSaved() { return (await state.invalidate())?.status === "fresh"; },
  };
}

