import { z } from "zod";
import type { TaskCategory, TaskItemContract, TaskStatus } from "../../../../shared/contract/tasks";

export interface TaskView {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  category: TaskCategory;
  plannedDate?: string;
  dueAt?: string;
  priority: "normal" | "high";
  updatedAt: string;
  href: string;
}

export interface TaskSuggestionView {
  id: string;
  title: string;
  reason: string;
}

export interface TaskActivityView {
  id: string;
  type: string;
  occurredAt: string;
}

export interface TaskReminderView {
  id: string;
  fireAt: string;
  status: string;
}

const nonempty = z.string().trim().min(1);
const instant = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const category = z.enum(["relationship", "meeting", "event", "work", "personal", "other"]);
const taskSchema = z.object({
  id: nonempty, title: nonempty, notes: z.string().optional(),
  status: z.enum(["open", "completed", "cancelled"]), category,
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dueAt: instant.optional(),
  priority: z.enum(["normal", "high"]), updatedAt: instant,
});
const suggestionSchema = z.object({ id: nonempty, title: nonempty, reason: nonempty });

export function taskToView(value: unknown): TaskView {
  const task = taskSchema.parse(value) as Pick<TaskItemContract,
    "id" | "title" | "notes" | "status" | "category" | "plannedDate" | "dueAt" | "priority" | "updatedAt">;
  return { ...task, notes: task.notes ?? "", href: `/app/tasks/${encodeURIComponent(task.id)}` };
}

export function tasksToView(value: unknown): TaskView[] {
  const { tasks } = z.object({ tasks: z.array(z.unknown()) }).parse(value);
  return tasks.map(taskToView).sort((a, b) => {
    if (a.status === "completed" && b.status === "completed") return b.updatedAt.localeCompare(a.updatedAt);
    return (a.dueAt ?? a.plannedDate ?? "9999").localeCompare(b.dueAt ?? b.plannedDate ?? "9999");
  });
}

export function suggestionsToView(value: unknown): TaskSuggestionView[] {
  const parsed = z.object({ suggestions: z.array(suggestionSchema) }).parse(value);
  return parsed.suggestions as TaskSuggestionView[];
}

export function activitiesToView(value: unknown): TaskActivityView[] {
  const parsed = z.object({ activities: z.array(z.object({
    id: nonempty, occurredAt: instant,
    type: z.enum(["created", "updated", "rescheduled", "completed", "reopened", "cancelled", "deleted"]),
  })) }).parse(value);
  return (parsed.activities as TaskActivityView[]).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function remindersToView(value: unknown): TaskReminderView[] {
  const parsed = z.object({ reminders: z.array(z.object({
    id: nonempty, fireAt: instant, status: z.enum(["scheduled", "delivered", "cancelled", "failed"]),
  })) }).parse(value);
  return (parsed.reminders as TaskReminderView[]).filter((item) => item.status === "scheduled");
}

export function todayTasksToView(value: unknown) {
  const parsed = z.object({ summary: z.object({
    openTaskCount: z.number().int().nonnegative(), suggestionCount: z.number().int().nonnegative(),
  }) }).parse(value);
  return {
    tasks: tasksToView(value), suggestions: suggestionsToView(value),
    count: parsed.summary.openTaskCount, suggestionCount: parsed.summary.suggestionCount,
  };
}

export function taskCategoryLabel(value: TaskCategory, english: boolean): string {
  const labels: Record<TaskCategory, [string, string]> = {
    relationship: ["人脉", "People"], meeting: ["会面", "Meeting"], event: ["活动", "Event"],
    work: ["工作", "Work"], personal: ["个人", "Personal"], other: ["其他", "Other"],
  };
  return labels[value][english ? 1 : 0];
}

export function taskTimeLabel(value: string | undefined, english: boolean): string {
  if (!value) return english ? "No date set" : "未安排日期";
  const dayOnly = value.length === 10;
  const date = new Date(dayOnly ? `${value}T12:00:00+09:00` : value);
  return new Intl.DateTimeFormat(english ? "en-GB" : "zh-CN", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Tokyo",
    ...(dayOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(date);
}

export function taskActivityLabel(value: string, english: boolean): string {
  const labels: Record<string, [string, string]> = {
    created: ["新增待办", "Created"], updated: ["修改待办", "Edited"], rescheduled: ["调整日期", "Rescheduled"],
    completed: ["已完成", "Completed"], reopened: ["恢复待办", "Reopened"], cancelled: ["已取消", "Cancelled"], deleted: ["已删除", "Deleted"],
  };
  return labels[value]?.[english ? 1 : 0] ?? value;
}
