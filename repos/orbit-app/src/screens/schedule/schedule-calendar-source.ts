import { useCallback, useMemo } from "react";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useMirrorProbe } from "../../hooks/useMirrorProbe";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { mirrorScheduleCalendar, type ScheduleCalendarSource } from "./schedule-calendar-source-mirror";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { useOfflineScheduleOutbox } from "../../data/sync/useOfflineScheduleOutbox";

export type { CalendarPart, ScheduleCalendarSource } from "./schedule-calendar-source-mirror";

/**
 * Native calendar source (sprint 0115): the lease-fed device mirror only —
 * registered events, open tasks and schedule items. The browser build resolves
 * schedule-calendar-source.web.ts (the mirror when available, the network otherwise).
 */
export function useScheduleCalendarSource(): ScheduleCalendarSource {
  const auth = useOrbitAuthSession();
  const ready = auth.ready && auth.signedIn;
  const tasks = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const outbox = useOfflineTaskOutbox(tasks);
  const schedule = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const scheduleOutbox = useOfflineScheduleOutbox(schedule, ready);
  const events = useSyncedCollection<Record<string, unknown>>({ kind: "registered_event" });
  const refreshTasks = tasks.refresh, refreshSchedule = schedule.refresh, refreshEvents = events.refresh;
  const refresh = useCallback(() => { void refreshTasks(); void refreshSchedule(); void refreshEvents(); }, [refreshTasks, refreshSchedule, refreshEvents]);
  useMirrorProbe(refresh, ready);
  const scheduleQueued = scheduleOutbox?.queuedMutations;
  return useMemo(() => mirrorScheduleCalendar({ tasks, schedule, events, ready, actorId: auth.actorId ?? "", queued: outbox.queuedMutations, ...(scheduleQueued ? { scheduleQueued } : {}), refresh }),
    [tasks.records, tasks.status, tasks.lastSyncedAt, tasks.error, outbox.queuedMutations, scheduleQueued, schedule.records, schedule.status, schedule.lastSyncedAt, schedule.error, events.records, events.status, events.lastSyncedAt, events.error, ready, auth.actorId, refresh]);
}
