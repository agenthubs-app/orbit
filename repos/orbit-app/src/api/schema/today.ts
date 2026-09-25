import { z } from "zod";

export const todayTaskModeQuerySchema = z.object({
  taskMode: z.enum(["page", "summary"]).optional(),
  limit: z.string().regex(/^[1-9][0-9]*$/).optional(),
}).strict().superRefine((query, ctx) => {
  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit > 50) {
      ctx.addIssue({ code: "custom", path: ["limit"], message: "Today page limit is out of range." });
    }
  }
  if (query.taskMode === "summary" && query.limit !== undefined) {
    ctx.addIssue({ code: "custom", path: ["limit"], message: "Summary mode does not accept a page limit." });
  }
});

const category = z.enum(["relationship", "meeting", "event", "work", "personal", "other"]);
const summaryItem = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task"),
    task: z.object({
      id: z.string().min(1).max(2048),
      titlePreview: z.string().max(480),
      category,
      priority: z.enum(["normal", "high"]),
      plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      dueAt: z.string().max(40).refine(value => Number.isFinite(Date.parse(value))).nullable(),
    }).strict(),
  }).strict(),
  z.object({
    kind: z.literal("schedule"),
    schedule: z.object({
      id: z.string().min(1).max(2048),
      titlePreview: z.string().max(480),
      category,
      kind: z.enum(["meeting", "event", "personal"]),
      state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]),
      startsAt: z.string().max(40).refine(value => Number.isFinite(Date.parse(value))),
      locationPreview: z.string().max(240).nullable(),
    }).strict(),
  }).strict(),
]);

export const todayTaskSummaryModeSchema = z.object({
  taskMode: z.literal("summary"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(100),
  summary: z.object({
    openTaskCount: z.number().int().nonnegative().safe(),
    suggestionCount: z.number().int().nonnegative().safe(),
  }).strict(),
  items: z.array(summaryItem).max(3),
  questionSignals: z.object({
    urgentTask: z.boolean(),
    relationshipTask: z.boolean(),
    preparation: z.boolean(),
  }).strict(),
}).strict().transform(value => ({
  taskMode: value.taskMode,
  date: value.date,
  timeZone: value.timeZone,
  summary: {
    openTaskCount: value.summary.openTaskCount,
    suggestionCount: value.summary.suggestionCount,
  },
  items: value.items.map(item => item.kind === "task"
    ? { kind: "task" as const, task: {
      id: item.task.id,
      titlePreview: item.task.titlePreview,
      category: item.task.category,
      priority: item.task.priority,
      plannedDate: item.task.plannedDate,
      dueAt: item.task.dueAt,
    } }
    : { kind: "schedule" as const, schedule: {
      id: item.schedule.id,
      titlePreview: item.schedule.titlePreview,
      category: item.schedule.category,
      kind: item.schedule.kind,
      state: item.schedule.state,
      startsAt: item.schedule.startsAt,
      locationPreview: item.schedule.locationPreview,
    } }),
  questionSignals: {
    urgentTask: value.questionSignals.urgentTask,
    relationshipTask: value.questionSignals.relationshipTask,
    preparation: value.questionSignals.preparation,
  },
}));
