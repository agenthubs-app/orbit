import type { TodoDecisionItem, TodoFollowupItem } from "../../api/contract/todo-page";
import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../time/date-time";
import { readTaskListItems } from "../../view-models/task-list-scope";

/** Do not treat a provider-local entity-draft conversation ID as a saved chat session. */
export function todoDecisionHref(item: TodoDecisionItem): string | null {
  // /agent/actions?entry= addresses ledger entries, not an agent_action actionId.
  if (item.source === "contact_draft") return "/contacts/new/drafts";
  if (item.source === "plan_pending") return "/task?seg=plan";
  return null;
}

export function todoFollowupHref(item: TodoFollowupItem): string | null {
  // The legacy relationship detail address takes a connectionId, not this taskId.
  return item.kind === "lifecycle" ? null : `/tasks/${encodeURIComponent(item.taskId)}`;
}

/** A 2xx alone is not enough to remove the row; require the owned, completed task in the reply. */
export function todoTaskCompletionReceipt(payload: unknown, actorId: string, taskId: string): boolean {
  const task = readTaskListItems({ tasks: [typeof payload === "object" && payload !== null && "task" in payload ? payload.task : null] }, actorId)?.[0];
  return task?.id === taskId && task.status === "completed";
}

/** Keep the task's existing date semantics; never turn an undated task into a "deferral". */
export function laterTaskDatePatch(
  task: { plannedDate?: string; dueAt?: string }, requestedDate: string, timeZone: string,
): { plannedDate?: string; dueAt?: string } | null {
  if (!calendarDate(requestedDate) || !validTimeZone(timeZone)) return null;
  const patch: { plannedDate?: string; dueAt?: string } = {};
  if (task.plannedDate) {
    if (!calendarDate(task.plannedDate) || requestedDate <= task.plannedDate) return null;
    patch.plannedDate = requestedDate;
  }
  if (task.dueAt) {
    const previous = new Date(task.dueAt);
    if (!Number.isFinite(previous.getTime())) return null;
    const parts = localParts(previous, timeZone);
    if (requestedDate <= parts.date) return null;
    const next = resolveLocalDateTime(requestedDate, parts.time, timeZone);
    if (!next || Date.parse(next) <= previous.getTime()) return null;
    patch.dueAt = next;
  }
  return Object.keys(patch).length ? patch : null;
}

export function todoInitialView(view: string | string[] | undefined): "home" | "tasks" {
  return (Array.isArray(view) ? view[0] : view) === "completed" ? "tasks" : "home";
}
