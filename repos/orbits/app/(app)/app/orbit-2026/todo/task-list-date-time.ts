import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";
import type { TaskView } from "../../tasks/tasks-view-model";

export type TaskDateDraft = { date: string; time: string };
export type TaskDatePatch = { plannedDate?: string | null; dueAt?: string | null };
export type TaskDateChange = { kind: "invalid"; reason: "date" | "localTime" | "timeZone" } | { kind: "unchanged" } | { kind: "ready"; patch: TaskDatePatch };
type TaskDateSource = Pick<TaskView, "plannedDate" | "dueAt">;

export function taskDateDraft(task: TaskDateSource, timeZone: string): TaskDateDraft {
  if (task.dueAt) {
    const due = localParts(task.dueAt, timeZone);
    return { date: due.date, time: due.time };
  }
  return { date: task.plannedDate ?? "", time: "" };
}

export function taskDateChange(task: TaskDateSource, draft: TaskDateDraft, timeZone: string): TaskDateChange {
  if (!validTimeZone(timeZone)) return { kind: "invalid", reason: "timeZone" };
  const date = draft.date.trim();
  const time = draft.time.trim();
  if (date && !calendarDate(date) || time && !date) return { kind: "invalid", reason: "date" };
  if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return { kind: "invalid", reason: "localTime" };
  const previous = taskDateDraft(task, timeZone);
  const dateChanged = date !== previous.date;
  const timeChanged = time !== previous.time;
  if (!dateChanged && !timeChanged) return { kind: "unchanged" };
  const patch: TaskDatePatch = {};
  if ((!time && task.dueAt && date !== (task.plannedDate ?? "")) ||
    (dateChanged && (!task.dueAt || task.plannedDate === previous.date))) patch.plannedDate = date || null;
  if (time && (dateChanged || timeChanged)) {
    const dueAt = resolveLocalDateTime(date, time, timeZone);
    if (!dueAt) return { kind: "invalid", reason: "localTime" };
    patch.dueAt = dueAt;
  } else if (!time && task.dueAt) patch.dueAt = null;
  return { kind: "ready", patch };
}

export function taskDatePatchMovesLater(task: TaskView, patch: TaskDatePatch): boolean {
  return typeof patch.plannedDate === "string" && typeof task.plannedDate === "string" && patch.plannedDate > task.plannedDate ||
    typeof patch.dueAt === "string" && typeof task.dueAt === "string" && Date.parse(patch.dueAt) > Date.parse(task.dueAt);
}

/** Keep the existing local time; never move a future or undated task through the quick action. */
export function taskTomorrowPatch(task: TaskDateSource, today: string, timeZone: string): TaskDatePatch | null {
  if (!calendarDate(today) || !validTimeZone(timeZone)) return null;
  const current = taskDateDraft(task, timeZone);
  if (!current.date || current.date > today) return null;
  const tomorrow = calendarDate(today)!;
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const change = taskDateChange(task, { date: tomorrow.toISOString().slice(0, 10), time: current.time }, timeZone);
  return change.kind === "ready" ? change.patch : null;
}
