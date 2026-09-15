import type { TaskItemContract } from "../api/contract/tasks";
import { taskDetailToView } from "./today-tasks";
import { resolveLocalDateTime, validTimeZone } from "../time/date-time";

export type TaskDateDraft = { plannedDate: string; dueDate: string; dueTime: string; location?: string };
export type TaskDatePatch = { plannedDate?: string | null; dueAt?: string | null; location?: string | null };
type TaskDates = Pick<TaskItemContract, "plannedDate" | "dueAt" | "location">;
type TaskDateChange = { kind: "invalid"; message: string } | { kind: "unchanged" } | { kind: "ready"; patch: TaskDatePatch };

function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  // Match the task API's calendar validation, including unsupported years 00–99.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function taskDateDraftFromView(view: TaskDates | null, timeZone = "Asia/Tokyo"): TaskDateDraft {
  const draft = { plannedDate: view?.plannedDate ?? "", dueDate: "", dueTime: "", ...(view && "location" in view ? { location: view.location ?? "" } : {}) };
  if (!isDateTime(view?.dueAt)) return draft;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(view.dueAt));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return { ...draft, dueDate: `${part("year")}-${part("month")}-${part("day")}`, dueTime: `${part("hour")}:${part("minute")}` };
}

export function buildTaskDatePatch(baseline: TaskDates, draft: TaskDateDraft, timeZone = "Asia/Tokyo"): TaskDateChange {
  if (!validTimeZone(timeZone)) return { kind: "invalid", message: "无法读取设备时区，草稿已保留。请恢复时区后保存。" };
  const plannedDate = draft.plannedDate.trim();
  const dueDate = draft.dueDate.trim();
  const dueTime = draft.dueTime.trim();
  if (plannedDate && !isLocalDate(plannedDate)) return { kind: "invalid", message: "请输入有效的安排日期，格式为 YYYY-MM-DD。" };
  if (Boolean(dueDate) !== Boolean(dueTime)) return { kind: "invalid", message: "截止日期和时间需要一起填写。不确定时间时，可只填写安排日期。" };
  if (dueDate && !isLocalDate(dueDate)) return { kind: "invalid", message: "请输入有效的截止日期，格式为 YYYY-MM-DD。" };
  if (dueTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return { kind: "invalid", message: "截止时间请使用 24 小时制，格式为 HH:mm。" };
  const previous = taskDateDraftFromView(baseline, timeZone);
  const patch: TaskDatePatch = {};
  if (plannedDate !== previous.plannedDate) patch.plannedDate = plannedDate || null;
  if (baseline.dueAt && !dueDate && !dueTime) patch.dueAt = null;
  if (draft.location !== undefined && draft.location.trim() !== (baseline.location ?? "")) patch.location = draft.location.trim() || null;
  // Do not overwrite seconds/offset when the minute-resolution editor is unchanged.
  if (dueDate && (dueDate !== previous.dueDate || dueTime !== previous.dueTime)) {
    const dueAt = resolveLocalDateTime(dueDate, dueTime, timeZone);
    if (!dueAt) return { kind: "invalid", message: "此当地时间不存在或有两个可能的时刻，请选择明确的时间。草稿已保留。" };
    patch.dueAt = dueAt;
  }
  return Object.keys(patch).length ? { kind: "ready", patch } : { kind: "unchanged" };
}

export function taskDateReceiptMatches(data: unknown, taskId: string, actorId: string, patch: TaskDatePatch): boolean {
  if (!data || typeof data !== "object" || !("task" in data)) return false;
  const task = data.task;
  if (!task || typeof task !== "object" || Array.isArray(task)) return false;
  const raw = task as Record<string, unknown>;
  if (!actorId || raw.id !== taskId || raw.ownerUserId !== actorId || raw.accountId !== actorId || raw.status === "cancelled") return false;
  if (!isDateTime(raw.updatedAt) || !isDateTime(raw.createdAt)) return false;
  if (!["normal", "high"].includes(String(raw.priority)) || !["manual", "ai_confirmed", "contact", "event", "inbox"].includes(String(raw.source))) return false;
  if (raw.notes !== undefined && typeof raw.notes !== "string") return false;
  if (raw.plannedDate !== undefined && (typeof raw.plannedDate !== "string" || !isLocalDate(raw.plannedDate))) return false;
  if (raw.dueAt !== undefined && !isDateTime(raw.dueAt)) return false;
  if (patch.plannedDate !== undefined && raw.plannedDate !== (patch.plannedDate ?? undefined)) return false;
  if (patch.location !== undefined && raw.location !== (patch.location ?? undefined)) return false;
  if (raw.location !== undefined && (typeof raw.location !== "string" || !raw.location.trim())) return false;
  if (patch.dueAt === null && raw.dueAt !== undefined) return false;
  if (patch.dueAt !== undefined && patch.dueAt !== null && (!isDateTime(raw.dueAt) || Date.parse(raw.dueAt) !== Date.parse(patch.dueAt))) return false;
  return taskDetailToView(data) !== null;
}
