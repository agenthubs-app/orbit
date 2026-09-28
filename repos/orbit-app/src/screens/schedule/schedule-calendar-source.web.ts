import { useCallback, useMemo } from "react";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { taskPageSchema } from "../../api/schema/task-page";
import { validateApiResourceState } from "../../api/validated-resource-state";
import { useApiResource } from "../../hooks/useApiResource";
import { useMirrorProbe } from "../../hooks/useMirrorProbe";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useWebMirrorStatus } from "../../hooks/useWebMirrorStatus";
import { normalizeTaskPageContract } from "../../view-models/today-task-pages";
import { taskPageToScheduleTasks } from "../../view-models/schedule";
import { mirrorScheduleCalendar, type CalendarPart, type ScheduleCalendarSource } from "./schedule-calendar-source-mirror";

export type { CalendarPart, ScheduleCalendarSource } from "./schedule-calendar-source-mirror";

/**
 * Browser calendar source (sprint 0115), the tasks-page pattern of 0078:
 * the mirror when the browser mirror is active (registered events, tasks and
 * personal schedule are all on its whitelist), the previous network reads
 * otherwise (e.g. a LAN http address). All hooks run unconditionally in a
 * fixed order; the network reads are inert while the mirror is the source.
 */
type Resource = ReturnType<typeof useApiResource<unknown>>;

function networkPart(state: { kind: string; refresh(): void } & Partial<{ data: unknown; error: { message: string } }>, data: (value: unknown) => unknown): CalendarPart {
  if (state.kind === "success" || state.kind === "empty") return { kind: "ready", data: data(state.data), message: "" };
  if (state.kind === "offline" || state.kind === "failure") return { kind: state.kind, data: null, message: state.error?.message ?? "" };
  return { kind: "loading", data: null, message: "" };
}

export function useScheduleCalendarSource(): ScheduleCalendarSource {
  const auth = useOrbitAuthSession();
  const ready = auth.ready && auth.signedIn;
  const mirrorActive = useWebMirrorStatus().mode === "local-mirror";
  const tasks = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const schedule = useSyncedCollection<Record<string, unknown>>({ kind: "personal_schedule" });
  const events = useSyncedCollection<Record<string, unknown>>({ kind: "registered_event" });
  const refreshTasks = tasks.refresh, refreshSchedule = schedule.refresh, refreshEvents = events.refresh;
  const refreshMirror = useCallback(() => { void refreshTasks(); void refreshSchedule(); void refreshEvents(); }, [refreshTasks, refreshSchedule, refreshEvents]);
  useMirrorProbe(refreshMirror, mirrorActive && ready);
  const network = { enabled: !mirrorActive };
  const rawTasks = useApiResource<unknown>("/api/tasks/page?status=open&scope=all&limit=4",
    (data) => taskPageSchema.safeParse(data).success && taskPageSchema.parse(data).items.length === 0, network);
  const taskState = validateApiResourceState(rawTasks, taskPageSchema.refine((page) => page.status === "open" && page.scope === "all" && page.query === ""));
  const eventState: Resource = useApiResource<unknown>(ORBIT_API_ENDPOINTS.publicEvents, () => false, network);
  const itemState: Resource = useApiResource<unknown>(ORBIT_API_ENDPOINTS.scheduleItems, () => false, network);
  const mirror = useMemo(() => mirrorScheduleCalendar({ tasks, schedule, events, ready, refresh: refreshMirror }),
    [tasks.records, tasks.status, tasks.lastSyncedAt, tasks.error, schedule.records, schedule.status, schedule.lastSyncedAt, schedule.error, events.records, events.status, events.lastSyncedAt, events.error, ready, refreshMirror]);
  if (mirrorActive) return mirror;
  return {
    tasks: networkPart(taskState, (data) => taskPageToScheduleTasks(normalizeTaskPageContract(data as Parameters<typeof normalizeTaskPageContract>[0]))),
    events: networkPart(eventState, (data) => data),
    scheduleItems: networkPart(itemState, (data) => data),
    refreshing: taskState.refreshing || eventState.refreshing || itemState.refreshing,
    offline: null,
    refresh() { taskState.refresh(); eventState.refresh(); itemState.refresh(); },
  };
}
