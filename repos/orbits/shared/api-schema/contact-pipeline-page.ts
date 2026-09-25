import { z } from "zod";

const key = z.string().min(1).max(2048);
const codePointPreview = (limit: number, utf16Limit = limit * 2) =>
  z.string().max(utf16Limit).refine(value => Array.from(value).length <= limit);
const instant = z.string().min(1).max(64).refine(value => Number.isFinite(Date.parse(value)));

export const contactPipelineStageSchema = z.enum(["to_contact", "in_progress", "nurture", "archived"]);
export const contactPipelineItemSchema = z.object({
  id: key,
  displayName: codePointPreview(128),
  organization: codePointPreview(128),
  role: codePointPreview(128),
}).strict();
export const contactPipelineActionSchema = z.object({
  taskId: key,
  contactId: key,
  contactName: codePointPreview(128),
  organization: codePointPreview(128),
  role: codePointPreview(128),
  title: codePointPreview(240),
  dueAt: instant,
}).strict();
export const contactPipelinePageSchema = z.object({
  asOf: instant,
  stage: contactPipelineStageSchema,
  stageCounts: z.object({
    to_contact: z.number().int().nonnegative().safe(),
    in_progress: z.number().int().nonnegative().safe(),
    nurture: z.number().int().nonnegative().safe(),
    archived: z.number().int().nonnegative().safe(),
  }).strict(),
  items: z.array(contactPipelineItemSchema).max(20),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(4096).nullable(),
  actions: z.array(contactPipelineActionSchema).max(3),
}).strict().superRefine((page, ctx) => {
  if (page.hasMore !== (page.nextCursor !== null) || new Set(page.items.map(item => item.id)).size !== page.items.length ||
    new Set(page.actions.map(item => item.taskId)).size !== page.actions.length) {
    ctx.addIssue({ code: "custom", message: "Inconsistent contact pipeline page" });
  }
}).transform(page => ({ ...page, nextCursor: page.nextCursor ?? null }));
