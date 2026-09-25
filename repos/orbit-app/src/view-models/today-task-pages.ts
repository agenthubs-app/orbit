import { z } from "zod";
import type {
  TodayTaskActionSummaryContract,
  TodayTaskCategoryContract,
  TodayTaskPageModeContract,
} from "../api/contract/today";
import type { TaskCardContract, TaskPageContract } from "../api/contract/task-page";
import { taskCardSchema, taskPageSchema } from "../api/schema/task-page";
import { todayTaskSummaryModeSchema } from "../api/schema/today";
import { localDayStart, shiftCalendarDate } from "../time/date-time";
import type { OrbitLanguage } from "../api/contract/language";
import { createTranslator, type MessageKey } from "../i18n/messages";
import { todayToView, type TodayHomeActionView, type HomeQuestion, type TodayHomeSummaryView, type TodayView } from "./today-tasks";

export const TODAY_TASK_PAGE_LIMIT = 20;

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const safeCountSchema = z.number().int().nonnegative().safe();

export const todayTaskPageEnvelopeSchema = z.object({
  taskMode: z.literal("page"),
  date: dateSchema,
  timeZone: z.string().min(1).max(100),
  completedCount: safeCountSchema,
  summary: z.object({
    openTaskCount: safeCountSchema,
    completedCount: safeCountSchema,
    suggestionCount: safeCountSchema,
    scheduleCount: safeCountSchema,
  }).strict(),
  suggestions: z.array(z.unknown()),
  schedule: z.array(z.unknown()),
  taskPage: taskPageSchema,
}).passthrough();
export type TodayTaskPageEnvelope = TodayTaskPageModeContract<TaskPageContract, unknown, unknown>;
export const todaySummarySchema = todayTaskSummaryModeSchema;
export type TodaySummaryDTO = z.infer<typeof todayTaskSummaryModeSchema>;

export interface TodayTaskCardRowView {
  id: string;
  titlePreview: string;
  locationPreview: string | null;
  categoryLabel: string;
  dueLabel: string;
  dueTone: "danger" | "muted" | "normal";
  priority: "normal" | "high";
}

export interface TodayTaskPageView extends Omit<TodayView, "tasks"> {
  tasks: readonly TodayTaskCardRowView[];
  totalTaskCount: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ParsedTodayTaskPage {
  envelope: TodayTaskPageEnvelope;
  page: TaskPageContract;
}

export type TodaySummaryHomeView = TodayHomeSummaryView;

const categoryLabelKeys: Record<TodayTaskCategoryContract, MessageKey> = {
  relationship: "workflow.categoryRelationship",
  meeting: "workflow.categoryMeeting",
  event: "workflow.categoryEvent",
  work: "workflow.categoryWork",
  personal: "workflow.categoryPersonal",
  other: "workflow.categoryOther",
};

function taskWindow(date: string, timeZone: string) {
  const end = localDayStart(shiftCalendarDate(date, 1), timeZone);
  if (end === null) throw new Error("Invalid Today task day");
  return { plannedThrough: date, dueBefore: new Date(end).toISOString() };
}

export function todayTaskWindow(date: string, timeZone: string) {
  return taskWindow(date, timeZone);
}

export function todayTaskPagePath(timeZone: string) {
  return "/api/today?" + new URLSearchParams({
    timeZone,
    taskMode: "page",
    limit: String(TODAY_TASK_PAGE_LIMIT),
  });
}

export function normalizeTaskPageContract(page: z.infer<typeof taskPageSchema>): TaskPageContract {
  return {
    actorId: page.actorId,
    status: page.status,
    scope: page.scope,
    query: page.query,
    ...(page.dueWindow ? { dueWindow: { plannedThrough: page.dueWindow.plannedThrough, dueBefore: page.dueWindow.dueBefore } } : {}),
    items: page.items.map(card => ({
      id: card.id,
      titlePreview: card.titlePreview,
      locationPreview: card.locationPreview,
      status: card.status,
      category: card.category,
      priority: card.priority,
      plannedDate: card.plannedDate,
      dueAt: card.dueAt,
      updatedAt: card.updatedAt,
      ...(card.completedAt !== undefined ? { completedAt: card.completedAt } : {}),
      relatedContact: card.relatedContact,
    })),
    counts: { open: page.counts.open, completed: page.counts.completed },
    total: page.total,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    asOf: page.asOf,
  };
}

export function todaySummaryPath(timeZone: string) {
  return "/api/today?" + new URLSearchParams({ timeZone, taskMode: "summary" });
}

export function todayTaskNextPagePath(window: { plannedThrough: string; dueBefore: string }, cursor: string) {
  return "/api/tasks/page?" + new URLSearchParams({
    status: "open",
    scope: "all",
    query: "",
    limit: String(TODAY_TASK_PAGE_LIMIT),
    plannedThrough: window.plannedThrough,
    dueBefore: window.dueBefore,
    cursor,
  });
}

export function parseTodayTaskPageResponse(payload: unknown, actorId: string, date: string, timeZone: string): ParsedTodayTaskPage | null {
  const parsed = todayTaskPageEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return null;
  const envelope = parsed.data;
  const page = envelope.taskPage;
  const expectedWindow = taskWindow(date, timeZone);
  if (envelope.date !== date || envelope.timeZone !== timeZone || page.actorId !== actorId ||
    page.status !== "open" || page.scope !== "all" || page.query !== "" ||
    !isSameWindow(page.dueWindow, expectedWindow) || page.total !== envelope.summary.openTaskCount ||
    envelope.completedCount !== envelope.summary.completedCount ||
    page.items.length > TODAY_TASK_PAGE_LIMIT) return null;
  const normalizedPage = normalizeTaskPageContract(page);
  return { envelope: { ...envelope, taskPage: normalizedPage }, page: normalizedPage };
}

function isSameWindow(value: unknown, expected: { plannedThrough: string; dueBefore: string } | undefined) {
  if (!expected || typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = value as Record<string, unknown>;
  return actual.plannedThrough === expected.plannedThrough && actual.dueBefore === expected.dueBefore;
}

function categoryLabel(category: TodayTaskCategoryContract, language: OrbitLanguage) {
  return createTranslator(language)(categoryLabelKeys[category]);
}

function localizedTime(value: string, timeZone: string, language: OrbitLanguage) {
  const locale = language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }).format(new Date(value));
}

function dueForTask(task: Pick<TaskCardContract, "dueAt" | "plannedDate">, now: Date, timeZone: string, language: OrbitLanguage) {
  const t = createTranslator(language);
  if (task.dueAt) {
    if (Date.parse(task.dueAt) < now.getTime()) return { dueLabel: t("todayVm.overdue"), dueTone: "danger" as const };
    return { dueLabel: localizedTime(task.dueAt, timeZone, language), dueTone: "normal" as const };
  }
  if (task.plannedDate) return { dueLabel: t("todayVm.today"), dueTone: "muted" as const };
  return { dueLabel: "", dueTone: "muted" as const };
}

function todayTaskCardRow(card: TaskCardContract, now: Date, timeZone: string, language: OrbitLanguage): TodayTaskCardRowView {
  return {
    id: card.id,
    titlePreview: card.titlePreview,
    locationPreview: card.locationPreview,
    categoryLabel: categoryLabel(card.category, language),
    ...dueForTask(card, now, timeZone, language),
    priority: card.priority,
  };
}

export function todayTaskPageToView(
  payload: unknown,
  actorId: string,
  date: string,
  now = new Date(),
  timeZone = "Asia/Tokyo",
  language: OrbitLanguage = "zh",
  loadedCards?: readonly TaskCardContract[],
  pageProgress?: Pick<TaskPageContract, "hasMore" | "nextCursor" | "total" | "counts">,
): TodayTaskPageView | null {
  const parsed = parseTodayTaskPageResponse(payload, actorId, date, timeZone);
  if (!parsed) return null;
  const { envelope, page } = parsed;
  const cards = loadedCards ?? page.items;
  if (cards.length < page.items.length ||
    cards.some((card, index) => !taskCardSchema.safeParse(card).success ||
      (index < page.items.length && card.id !== page.items[index]?.id)) ||
    new Set(cards.map(card => card.id)).size !== cards.length) return null;

  const base = todayToView(envelope, now, timeZone, language);
  const t = createTranslator(language);
  const total = pageProgress?.total ?? page.total;
  return {
    ...base,
    tasks: cards.map(card => todayTaskCardRow(card, now, timeZone, language)),
    summary: t("todayVm.summary", { tasks: total, schedule: base.schedule.length }),
    totalTaskCount: total,
    hasMore: pageProgress ? pageProgress.hasMore : page.hasMore,
    nextCursor: pageProgress ? pageProgress.nextCursor : page.nextCursor,
  };
}

function taskSummaryAction(task: TodayTaskActionSummaryContract, now: Date, timeZone: string, language: OrbitLanguage, index: number): TodayHomeActionView {
  const due = dueForTask(task, now, timeZone, language).dueLabel;
  return {
    context: [categoryLabel(task.category, language), due].filter(Boolean).join(" · "),
    href: `/tasks/${encodeURIComponent(task.id)}`,
    id: task.id,
    kind: "task",
    title: task.titlePreview,
    index,
  };
}

function scheduleSummaryAction(schedule: Extract<TodaySummaryDTO["items"][number], { kind: "schedule" }>["schedule"], timeZone: string, language: OrbitLanguage, index: number): TodayHomeActionView {
  const t = createTranslator(language);
  const stateLabel = schedule.state === "ended" ? t("todayVm.ended")
    : schedule.state === "ongoing" ? t("todayVm.ongoing")
      : schedule.state === "cancelled" ? t("todayVm.cancelled")
        : localizedTime(schedule.startsAt, timeZone, language);
  return {
    context: [stateLabel, schedule.locationPreview || categoryLabel(schedule.category, language)].filter(Boolean).join(" · "),
    href: "/schedule",
    id: schedule.id,
    kind: "schedule",
    title: schedule.titlePreview,
    index,
  };
}

export function todaySummaryToHomeView(
  payload: unknown,
  date: string,
  timeZone: string,
  now = new Date(),
  language: OrbitLanguage = "zh",
): TodaySummaryHomeView | null {
  const parsed = todaySummarySchema.safeParse(payload);
  if (!parsed.success || parsed.data.date !== date || parsed.data.timeZone !== timeZone) return null;
  return {
    items: parsed.data.items.map((item, index) => item.kind === "task"
      ? taskSummaryAction(item.task, now, timeZone, language, index + 1)
      : scheduleSummaryAction(item.schedule, timeZone, language, index + 1)),
    openTaskCount: parsed.data.summary.openTaskCount,
    suggestionCount: parsed.data.summary.suggestionCount,
  };
}

const defaultQuestions = (language: OrbitLanguage): readonly HomeQuestion[] => [
  { kind: "tasks", label: createTranslator(language)("todayVm.questionTasks") },
  { kind: "discovery", label: createTranslator(language)("todayVm.questionDiscovery") },
];

export function todaySummaryQuestions(payload: unknown, language: OrbitLanguage = "zh"): readonly HomeQuestion[] {
  const parsed = todaySummarySchema.safeParse(payload);
  if (!parsed.success) return defaultQuestions(language);
  const signals = parsed.data.questionSignals;
  const t = createTranslator(language);
  const primary: HomeQuestion = signals.urgentTask
    ? { kind: "tasks", label: t("todayVm.questionTasks") }
    : signals.preparation
      ? { kind: "preparation", label: t("todayVm.questionPreparation") }
      : signals.relationshipTask
        ? { kind: "followup", label: t("todayVm.questionFollowup") }
        : { kind: "tasks", label: t("todayVm.questionTasks") };
  return [primary, { kind: "discovery", label: t("todayVm.questionDiscovery") }];
}
