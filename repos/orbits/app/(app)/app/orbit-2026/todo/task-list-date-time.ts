import { calendarDate, localParts, resolveLocalDateTime, validTimeZone } from "../../../../../features/tasks/local-date-time";
import type { TaskView } from "../../tasks/tasks-view-model";

export type TaskDateDraft = { date: string; time: string };
export type TaskDatePatch = { plannedDate?: string | null; dueAt?: string | null };
export type TaskDateChange = { kind: "invalid"; reason: "date" | "localTime" | "timeZone" } | { kind: "unchanged" } | { kind: "ready"; patch: TaskDatePatch };

export function taskDateDraft(task: TaskView, timeZone: string): TaskDateDraft {
  if (task.dueAt) {
    const due = localParts(task.dueAt, timeZone);
    return { date: due.date, time: due.time };
  }
  return { date: task.plannedDate ?? "", time: "" };
}

export function taskDateChange(task: TaskView, draft: TaskDateDraft, timeZone: string): TaskDateChange {
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
