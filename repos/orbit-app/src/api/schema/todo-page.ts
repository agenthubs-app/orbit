import { z } from "zod";
import { knownValues, readableItems, tolerantEnum } from "./tolerant";
import type { TodoPageContract, TodoSourceKey } from "../contract/todo-page";

export const TODO_SOURCE_KEYS = ["task_suggestion", "agent_action", "plan_pending", "entity_draft", "contact_draft", "completion_question", "agent_signal", "plan_today_chance", "relationship_task", "task"] as const;
export const TODO_SECTION_SOURCES = {
  decisions: ["task_suggestion", "agent_action", "plan_pending", "entity_draft", "contact_draft", "completion_question"],
  nextMoves: ["agent_signal", "plan_today_chance"],
  followups: ["relationship_task", "task"],
} as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const timeZone = z.string().min(1).max(100).refine(value => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
});
const source = z.string().transform(value => knownValues(TODO_SOURCE_KEYS).parse([value])[0]).pipe(z.enum(TODO_SOURCE_KEYS));
const count = z.number().int().nonnegative().safe();
const timestamp = z.string().datetime({ offset: true });
const base = z.object({
  key: z.string().min(1).max(4096), source, sourceId: z.string().min(1).max(2048), titlePreview: z.string().max(480),
  contactId: z.string().min(1).optional(), contactNamePreview: z.string().max(240).optional(), eventId: z.string().min(1).optional(),
  createdAt: timestamp, sample: z.literal(true).optional(),
});
export const todoDecisionItemObject = base.extend({
  reasonPreview: z.string().max(640).optional(), actions: knownValues(["accept", "dismiss", "snooze", "open"]), conversationId: z.string().min(1).optional(),
});
export const todoNextMoveItemObject = base.extend({ reasonPreview: z.string().max(640).optional(), draftAvailable: z.boolean(), taskId: z.string().min(1).optional() });
export const todoFollowupItemObject = base.extend({
  // Display-only enums fall back; source identity above never guesses a source.
  kind: tolerantEnum(["task", "lifecycle"], "task"), taskId: z.string().min(1), status: tolerantEnum(["open", "scheduled"], "open"),
  dueAt: timestamp.optional(), overdue: z.boolean(), deferralCount: count.optional(),
});

function sourceMap<S extends z.ZodType>(value: S) {
  return z.record(z.string(), value).transform((values): Partial<Record<TodoSourceKey, z.output<S>>> => {
    const result: Partial<Record<TodoSourceKey, z.output<S>>> = {};
    for (const key of knownValues(TODO_SOURCE_KEYS).parse(Object.keys(values))) result[key] = values[key];
    return result;
  });
}
const section = <T>(item: z.ZodType<T>) => z.object({ items: readableItems(item), next: sourceMap(z.string().min(1).max(18000)) });
export const todoPageObject = z.object({
  date: day, timeZone, asOf: timestamp,
  counts: z.object({ decisions: count, nextMoves: count, followups: count, overdue: count }),
  countsCapped: z.object({ decisions: z.boolean(), nextMoves: z.boolean() }),
  decisions: section(todoDecisionItemObject), nextMoves: section(todoNextMoveItemObject), followups: section(todoFollowupItemObject),
  sources: sourceMap(tolerantEnum(["ok", "unavailable", "not_implemented"], "unavailable")),
});
export const todoPageSchema = todoPageObject as unknown as z.ZodType<TodoPageContract>;
export const todoPageQueryObject = z.object({
  date: day.optional(), timeZone: timeZone.optional(), section: z.enum(["decisions", "nextMoves", "followups"]).optional(),
  source: z.enum(TODO_SOURCE_KEYS).optional(), cursor: z.string().min(1).max(18000).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict().superRefine((query, context) => {
  const paging = [query.section, query.source, query.cursor].filter(value => value !== undefined).length;
  if (paging !== 0 && (paging !== 3 || !(TODO_SECTION_SOURCES[query.section!] as readonly string[]).includes(query.source!))) {
    context.addIssue({ code: "custom", message: "section, source and cursor must identify one matching source." });
  }
});
