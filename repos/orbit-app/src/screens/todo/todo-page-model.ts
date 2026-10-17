import type { TodoPageContract, TodoFollowupItem, TodoSectionKey, TodoSourceKey } from "../../api/contract/todo-page";
import type { TaskItemContract } from "../../api/contract/tasks";
import { isOpenFollowUpTask } from "../../api/compute/follow-up-task";
import { TODO_SECTION_SOURCES } from "../../api/schema/todo-page";
import type { LocalSyncQueuedMutation } from "../../data/sync/local-sync-repository";
import { localDayStart, localParts, shiftCalendarDate } from "../../time/date-time";
import { overlayQueuedTasks } from "../../view-models/tasks-mirror";

export function todoPageIsStale(page: Pick<TodoPageContract, "date" | "timeZone">, localDate: string, timeZone = page.timeZone): boolean {
  return page.date !== localDate || page.timeZone !== timeZone;
}

/** A stale snapshot is read-only; while offline only an owned, mirrored plain task can be queued. */
export function canWriteTodoFollowup(
  item: TodoFollowupItem,
  state: { offline: boolean; staleDay: boolean; locallyMirrored: boolean },
): boolean {
  if (state.staleDay) return false;
  return !state.offline || item.kind === "task" && state.locallyMirrored;
}

/** An unavailable or unimplemented source makes the reported total a lower bound, not an empty state. */
export function todoSectionCount(page: TodoPageContract, section: TodoSectionKey): {
  value: number; accuracy: "exact" | "at-least" | "unknown"; incompleteSources: TodoSourceKey[];
} {
  const incompleteSources = TODO_SECTION_SOURCES[section].filter(source => page.sources[source] !== "ok");
  const value = page.counts[section];
  const capped = section !== "followups" && page.countsCapped[section];
  return { value, accuracy: incompleteSources.length || capped ? value ? "at-least" : "unknown" : "exact", incompleteSources };
}

function dueAt(task: TaskItemContract, zone: string): string | undefined {
  if (task.dueAt) return task.dueAt;
  if (!task.plannedDate) return undefined;
  const nextDay = localDayStart(shiftCalendarDate(task.plannedDate, 1), zone);
  return nextDay === null ? undefined : new Date(nextDay - 1).toISOString();
}

function overdue(task: TaskItemContract | undefined, page: TodoPageContract): boolean {
  const due = task && dueAt(task, page.timeZone);
  return due ? localParts(due, page.timeZone).date < page.date : false;
}

/** Reconcile only queued plain task intentions; lifecycle rows remain server-owned. */
export function overlayTodoPage(
  page: TodoPageContract,
  canonical: readonly TaskItemContract[],
  queued: readonly LocalSyncQueuedMutation[],
  actorId: string,
): TodoPageContract | null {
  if (!queued.length) return page;
  const projected = overlayQueuedTasks(canonical, queued, actorId);
  if (!projected) return null;
  const before = new Map(canonical.map(task => [task.id, task]));
  const after = new Map(projected.map(task => [task.id, task]));
  const affected = new Set(queued.filter(item => item.domainId === "tasks" && item.kind === "task" && item.actorId === actorId).map(item => item.id));
  let followupDelta = 0, overdueDelta = 0;
  for (const id of affected) {
    const old = before.get(id), next = after.get(id);
    const oldOpen = old ? isOpenFollowUpTask(old) : false;
    const nextOpen = next ? isOpenFollowUpTask(next) : false;
    followupDelta += Number(nextOpen) - Number(oldOpen);
    overdueDelta += Number(nextOpen && overdue(next, page)) - Number(oldOpen && overdue(old, page));
  }
  const items = page.followups.items.flatMap((item): TodoFollowupItem[] => {
    if (item.kind !== "task" || !affected.has(item.taskId)) return [item];
    const task = after.get(item.taskId);
    if (!task || !isOpenFollowUpTask(task)) return [];
    const due = dueAt(task, page.timeZone);
    const { dueAt: _previousDueAt, ...withoutDueAt } = item;
    return [{ ...withoutDueAt, titlePreview: task.title, deferralCount: task.deferralCount ?? item.deferralCount ?? 0,
      overdue: overdue(task, page), ...(due ? { dueAt: due } : {}) }];
  }).sort((left, right) => Number(right.overdue) - Number(left.overdue) ||
    (left.dueAt ?? "9999-12-31T23:59:59.999Z").localeCompare(right.dueAt ?? "9999-12-31T23:59:59.999Z") ||
    left.key.localeCompare(right.key));
  return { ...page,
    counts: { ...page.counts, followups: Math.max(0, page.counts.followups + followupDelta), overdue: Math.max(0, page.counts.overdue + overdueDelta) },
    followups: { ...page.followups, items },
  };
}
