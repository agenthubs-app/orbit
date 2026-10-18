import { calendarDate, localParts, validTimeZone } from "../../../../../features/tasks/local-date-time";
import type { TaskRowView } from "../../tasks/tasks-view-model";

export type TaskListFilter = "all" | "relationship" | "personal";
export type TaskListGroupKey = "overdue" | "today" | "upcoming" | "undated" | "completed";
export interface TaskListGroup { key: TaskListGroupKey; items: TaskRowView[] }

/** Groups one loaded page. Callers must not present its counts as global totals while more pages exist. */
export function groupTaskRows(rows: readonly TaskRowView[], date: string, timeZone: string, filter: TaskListFilter): TaskListGroup[] {
  if (!calendarDate(date) || !validTimeZone(timeZone)) throw Error("TASK_LIST_CONTEXT_INVALID");
  const keys: readonly TaskListGroupKey[] = ["overdue", "today", "upcoming", "undated", "completed"];
  const groups = new Map<TaskListGroupKey, TaskRowView[]>(keys.map(key => [key, []]));
  const dayOf = (item: TaskRowView) => item.dueAt ? localParts(item.dueAt, timeZone).date : item.plannedDate;
  for (const item of rows) {
    const linked = item.relationship ?? (item.category === "relationship" || Boolean(item.relatedContact));
    if (filter === "relationship" && !linked || filter === "personal" && linked) continue;
    const day = dayOf(item);
    const key = item.status === "completed" ? "completed" : !day ? "undated" : day < date ? "overdue" : day === date ? "today" : "upcoming";
    groups.get(key)!.push(item);
  }
  for (const group of groups.values()) group.sort((a, b) => {
    const first = dayOf(a) ?? "9999-12-31", second = dayOf(b) ?? "9999-12-31";
    return first.localeCompare(second) || a.id.localeCompare(b.id);
  });
  return keys.flatMap(key => groups.get(key)!.length ? [{ key, items: groups.get(key)! }] : []);
}
