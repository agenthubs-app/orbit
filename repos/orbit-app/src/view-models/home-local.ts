import type { OrbitLanguage } from "../api/contract/language";
import type { SyncRecord } from "../api/contract/sync";
import { localRegisteredEvents } from "./event-day-local";
import { homeTasksToView } from "./home-dashboard";
import { homeTaskWindow } from "./home-task-page";
import { readTaskListItems } from "./task-list-scope";
import { overlayQueuedTasks } from "./tasks-mirror";
import type { LocalSyncQueuedMutation } from "../data/sync/local-sync-repository";

/**
 * Sprint 0131: the home page's cards from the device copy, so the page paints
 * at once and stays readable offline. Each helper reproduces what the server
 * answers for the online read it stands in for.
 */

const HOME_TASK_LIMIT = 5;
const C = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function livePayloads(records: readonly SyncRecord[]): unknown[] {
  return records.filter((record) => record.deletedAt === null && record.payload !== null).map((record) => record.payload);
}

/**
 * GET /api/tasks/page?status=open&limit=5&plannedThrough=<day>&dueBefore=<next day start>
 * (features/tasks/task-page.ts): open tasks planned on or before the day or due
 * before its end, ordered by coalesce(dueAt, plannedDate + "T23:59:59") in code
 * point order, then updatedAt descending, then id; the first five and the total.
 * Null when a mirrored task is not the owner's valid task (the page then waits
 * for the server rather than showing a partial list).
 */
export function localHomeTaskPage(records: readonly SyncRecord[], actorId: string, date: string, timeZone: string, now: Date, language: OrbitLanguage, queued: readonly LocalSyncQueuedMutation[] = []) {
  const canonical = readTaskListItems({ tasks: livePayloads(records) }, actorId);
  if (!canonical) return null;
  const tasks = overlayQueuedTasks(canonical, queued, actorId);
  if (!tasks) return null;
  const window = homeTaskWindow(date, timeZone);
  const dueBefore = Date.parse(window.dueBefore);
  const due = tasks.filter((task) => task.status === "open" && (
    (typeof task.plannedDate === "string" && C(task.plannedDate, window.plannedThrough) <= 0)
    || (typeof task.dueAt === "string" && Date.parse(task.dueAt) < dueBefore)));
  const key = (task: (typeof due)[number]) => task.dueAt ?? (task.plannedDate ? `${task.plannedDate}T23:59:59` : "9999");
  due.sort((left, right) => C(key(left), key(right)) || C(right.updatedAt, left.updatedAt) || C(left.id, right.id));
  const rows = due.slice(0, HOME_TASK_LIMIT).map((task) => homeTasksToView({ tasks: [{
    id: task.id, title: task.title, status: task.status, category: task.category, priority: task.priority,
    ...(task.location ? { location: task.location } : {}),
    ...(task.plannedDate ? { plannedDate: task.plannedDate } : {}),
    ...(task.dueAt ? { dueAt: new Date(task.dueAt).toISOString() } : {}),
  }] }, date, now, timeZone, language));
  if (rows.some((row) => row?.length !== 1)) return null;
  return { items: rows.flatMap((row) => row!), total: due.length };
}

/**
 * GET /api/schedule-items (the today schedule provider): the account's
 * personal schedule items, its registered events and its confirmed meetings.
 * The first two come from their sync domains; meetings have no domain, so the
 * ones in the last online answer (page copy "home-schedule") are kept.
 */
export function localHomeScheduleItems(input: {
  personal: readonly SyncRecord[];
  events: readonly SyncRecord[];
  lastAnswer: unknown;
}): { scheduleItems: Record<string, unknown>[] } {
  const items: Record<string, unknown>[] = [];
  const ids = new Set<string>();
  const add = (item: Record<string, unknown>) => {
    if (typeof item.id !== "string" || ids.has(item.id)) return;
    ids.add(item.id);
    items.push(item);
  };
  for (const payload of livePayloads(input.personal)) {
    if (!payload || typeof payload !== "object") continue;
    const { occurrenceExceptions: _exceptions, ...item } = payload as Record<string, unknown>;
    if (item.kind === "personal") add(item);
  }
  for (const event of localRegisteredEvents(input.events)) {
    if (!event.startsAt) continue;
    add({
      id: `event:${event.eventId}`, kind: "event", category: "event",
      state: event.lifecycleState === "cancelled" ? "cancelled" : "upcoming",
      title: event.title, startsAt: event.startsAt,
      ...(event.endsAt && Date.parse(event.endsAt) > Date.parse(event.startsAt) ? { endsAt: event.endsAt } : {}),
      ...(event.venue ? { location: event.venue } : {}),
      sourceId: event.eventId,
    });
  }
  const last = input.lastAnswer as { scheduleItems?: unknown } | null;
  if (last && Array.isArray(last.scheduleItems)) {
    for (const item of last.scheduleItems) {
      if (item && typeof item === "object" && (item as { kind?: unknown }).kind === "meeting") add(item as Record<string, unknown>);
    }
  }
  return { scheduleItems: items };
}
