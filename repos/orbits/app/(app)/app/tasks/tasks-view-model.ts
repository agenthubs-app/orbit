import { z } from "zod";
import type { TaskCategory, TaskItemContract, TaskStatus } from "../../../../shared/contract/tasks";
import type { OrbitLanguage } from "../orbit-language-core";

export interface TaskView {
  accountId?: string;
  ownerUserId?: string;
  location?: string;
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  category: TaskCategory;
  plannedDate?: string;
  dueAt?: string;
  relatedEventId?: string;
  sourceNoteId?: string;
  deferralCount?: number;
  priority: "normal" | "high";
  updatedAt: string;
  href: string;
}

export interface TaskSuggestionView {
  id: string;
  title: string;
  reason: string;
}

/** Display-only list row. It must never be used as a full task edit baseline. */
export type TaskRowView = Pick<TaskView, "id" | "title" | "status" | "category" | "plannedDate" | "dueAt" | "href"> & {
  relatedContact?: { id: string; namePreview: string; organizationPreview: string } | null;
  relationship?: boolean;
};

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
  accountId: nonempty.optional(), ownerUserId: nonempty.optional(), location: nonempty.optional(),
  status: z.enum(["open", "completed", "cancelled"]), category,
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), dueAt: instant.optional(),
  relatedEventId: nonempty.optional(),
  sourceNoteId: nonempty.optional(),
  deferralCount: z.number().int().nonnegative().safe().optional(),
  priority: z.enum(["normal", "high"]), updatedAt: instant,
});
const suggestionSchema = z.object({ id: nonempty, title: nonempty, reason: nonempty });

export function taskToView(value: unknown): TaskView {
  const task = taskSchema.parse(value) as Pick<TaskItemContract,
    "id" | "title" | "notes" | "location" | "accountId" | "ownerUserId" | "status" | "category" | "plannedDate" | "dueAt" | "relatedEventId" | "sourceNoteId" | "deferralCount" | "priority" | "updatedAt">;
  return { ...task, notes: task.notes ?? "", href: `/app/tasks/${encodeURIComponent(task.id)}` };
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

type LabelLanguage = OrbitLanguage | boolean;

/** Legacy callers pass a boolean (`true` = English, `false` = Chinese). */
function labelLanguage(value: LabelLanguage): OrbitLanguage {
  return typeof value === "boolean" ? (value ? "en" : "zh") : value;
}

const TASK_CATEGORY_LABELS: Record<TaskCategory, Record<OrbitLanguage, string>> = {
  relationship: { ja: "人脈", zh: "人脉", en: "People" },
  meeting: { ja: "面談", zh: "会面", en: "Meeting" },
  event: { ja: "イベント", zh: "活动", en: "Event" },
  work: { ja: "仕事", zh: "工作", en: "Work" },
  personal: { ja: "個人", zh: "个人", en: "Personal" },
  other: { ja: "その他", zh: "其他", en: "Other" },
};

export function taskCategoryLabel(value: TaskCategory, language: LabelLanguage): string {
  return TASK_CATEGORY_LABELS[value][labelLanguage(language)];
}

const NO_DATE_LABEL: Record<OrbitLanguage, string> = { ja: "日付未定", zh: "未安排日期", en: "No date set" };
const DATE_LOCALE: Record<OrbitLanguage, string> = { ja: "ja-JP", zh: "zh-CN", en: "en-GB" };

export function taskTimeLabel(value: string | undefined, language: LabelLanguage, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const lang = labelLanguage(language);
  if (!value) return NO_DATE_LABEL[lang];
  const dayOnly = value.length === 10;
  const date = new Date(dayOnly ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat(DATE_LOCALE[lang], {
    month: "short", day: "numeric", year: "numeric", timeZone: dayOnly ? "UTC" : timeZone,
    ...(dayOnly ? {} : { hour: "2-digit", minute: "2-digit" }),
  }).format(date);
}

const TASK_ACTIVITY_LABELS: Record<string, Record<OrbitLanguage, string>> = {
  created: { ja: "タスクを追加", zh: "新增待办", en: "Created" },
  updated: { ja: "タスクを編集", zh: "修改待办", en: "Edited" },
  rescheduled: { ja: "日付を変更", zh: "调整日期", en: "Rescheduled" },
  completed: { ja: "完了", zh: "已完成", en: "Completed" },
  reopened: { ja: "未完了に戻す", zh: "恢复待办", en: "Reopened" },
  cancelled: { ja: "取り消し", zh: "已取消", en: "Cancelled" },
  deleted: { ja: "削除", zh: "已删除", en: "Deleted" },
};

export function taskActivityLabel(value: string, language: LabelLanguage): string {
  return TASK_ACTIVITY_LABELS[value]?.[labelLanguage(language)] ?? value;
}
