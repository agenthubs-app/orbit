import { z } from "zod";

const key = z.string().min(1).max(2048);
export const noteTaskCardSchema = z.object({
  id: key, titlePreview: z.string().min(1).max(480), status: z.enum(["open", "completed", "cancelled"]),
  sourceNoteVersion: z.number().int().positive().safe(),
}).strict();
export const noteTaskPageSchema = z.object({
  actorId: key, noteId: key, items: z.array(noteTaskCardSchema).max(30), total: z.number().int().nonnegative().safe(),
  hasMore: z.boolean(), nextCursor: z.string().min(1).max(8000).nullable(),
  asOf: z.string().max(40).refine(value => Number.isFinite(Date.parse(value))),
}).strict().superRefine((page, ctx) => {
  if (page.hasMore !== (page.nextCursor !== null) || new Set(page.items.map(item => item.id)).size !== page.items.length
    || page.items.length > page.total || (page.hasMore && !page.items.length)) ctx.addIssue({ code: "custom", message: "Inconsistent note task page" });
}).transform(page => ({ ...page, nextCursor: page.nextCursor ?? null }));
