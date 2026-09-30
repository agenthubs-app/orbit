import type { SyncRecord } from "../../api/contract/sync";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import type { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { localScheduleEvents } from "../../view-models/event-day-local";

/**
 * Sprint 0115 (coordinator item from 0130): the calendar page reads the device
 * mirror — the events the account registered for (registered-events), its open
 * tasks (tasks, 0087) and its schedule items (personal-schedule, 0108) — so it
 * keeps working offline with the 「截至」 notice. Shared by native and the
 * browser build when its mirror is active.
 */
export type CalendarPartKind = "loading" | "ready" | "offline" | "failure";

export interface CalendarPart {
  kind: CalendarPartKind;
  /** The calendar view-model input for this part (scheduleToCalendarView), or null. */
  data: unknown;
  message: string;
}

export interface ScheduleCalendarSource {
  tasks: CalendarPart;
  events: CalendarPart;
  scheduleItems: CalendarPart;
  refreshing: boolean;
  /** Set when the mirror is shown because the last sync attempt failed. */
  offline: { lastSyncedAt: string | null } | null;
  refresh(): void;
}

type Synced = ReturnType<typeof useSyncedCollection<Record<string, unknown>>>;

/** The page read at most four open tasks (the previous /api/tasks/page?status=open&scope=all&limit=4). */
const CALENDAR_TASK_LIMIT = 4;

export function localScheduleTasks(records: readonly SyncRecord[]): { tasks: Record<string, unknown>[] } {
  const open = records
    .filter((record) => record.deletedAt === null && record.payload && typeof record.payload === "object")
    .map((record) => record.payload as Record<string, unknown>)
    .filter((task) => task.status === "open" && typeof task.id === "string" && typeof task.title === "string");
  const due = (task: Record<string, unknown>) => {
    const value = typeof task.dueAt === "string" ? Date.parse(task.dueAt) : typeof task.plannedDate === "string" ? Date.parse(`${task.plannedDate}T00:00:00Z`) : Number.NaN;
    return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
  };
  return {
    tasks: open.sort((left, right) => due(left) - due(right) || String(left.id).localeCompare(String(right.id))).slice(0, CALENDAR_TASK_LIMIT).map((task) => ({
      id: task.id, taskId: task.id, title: task.title, status: task.status, category: task.category, priority: task.priority,
      plannedDate: task.plannedDate ?? undefined, dueAt: task.dueAt ?? undefined, updatedAt: task.updatedAt,
      location: task.location ?? undefined, relatedContactId: task.relatedContactId ?? undefined,
    })),
  };
}

export function localScheduleItems(records: readonly SyncRecord[]): { scheduleItems: Record<string, unknown>[] } {
  return {
    scheduleItems: records
      .filter((record) => record.deletedAt === null && record.payload && typeof record.payload === "object")
      .map((record) => record.payload as Record<string, unknown>),
  };
}

function part(state: Synced, ready: boolean, data: (records: readonly SyncRecord[]) => unknown): CalendarPart {
  const freshness = mirrorFreshness(state, ready);
  if (freshness.readable) return { kind: "ready", data: data(state.records), message: "" };
  if (freshness.failure) return { kind: freshness.failure === "sync.failure" ? "failure" : "offline", data: null, message: freshness.failure };
  return { kind: "loading", data: null, message: "" };
}

export function mirrorScheduleCalendar(input: { tasks: Synced; schedule: Synced; events: Synced; ready: boolean; refresh(): void }): ScheduleCalendarSource {
  const states = [input.tasks, input.schedule, input.events];
  const freshness = states.map((state) => mirrorFreshness(state, input.ready));
  const offline = freshness.some((entry) => entry.offline);
  const synced = freshness.map((entry) => entry.lastSyncedAt).filter((value): value is string => value !== null).sort();
  return {
    tasks: part(input.tasks, input.ready, localScheduleTasks),
    scheduleItems: part(input.schedule, input.ready, localScheduleItems),
    events: part(input.events, input.ready, localScheduleEvents),
    refreshing: freshness.some((entry) => entry.refreshing),
    // The oldest copy decides what "as of" can honestly say.
    offline: offline ? { lastSyncedAt: synced[0] ?? null } : null,
    refresh: input.refresh,
  };
}
