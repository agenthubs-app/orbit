import { z } from "zod";

const key = z.string().min(1).max(2048);
const instant = z.string().max(40).refine(value => Number.isFinite(Date.parse(value)));
export const taskCardSchema = z.object({
  id: key, titlePreview: z.string().max(480), locationPreview: z.string().max(240).nullable(),
  status: z.enum(["open", "completed"]),
  category: z.enum(["relationship", "meeting", "event", "work", "personal", "other"]),
  priority: z.enum(["normal", "high"]), plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dueAt: instant.nullable(), updatedAt: instant, completedAt: instant.nullable().optional(),
  relatedContact: z.object({ id: key, namePreview: z.string().max(240), organizationPreview: z.string().max(240) }).strict().nullable(),
}).strict();

export const taskPageSchema = z.object({
  actorId: key, status: z.enum(["open", "completed"]), scope: z.enum(["all", "relationship"]), query: z.string().max(240),
  items: z.array(taskCardSchema).max(50),
  counts: z.object({ open: z.number().int().nonnegative().safe(), completed: z.number().int().nonnegative().safe() }).strict(),
  total: z.number().int().nonnegative().safe(), hasMore: z.boolean(), nextCursor: z.string().min(1).max(8000).nullable(), asOf: instant,
}).strict().superRefine((page, ctx) => {
  if (page.hasMore !== (page.nextCursor !== null) || page.items.some(item => item.status !== page.status)
    || new Set(page.items.map(item => item.id)).size !== page.items.length || page.total !== page.counts[page.status]) {
    ctx.addIssue({ code: "custom", message: "Inconsistent task page" });
  }
}).transform(page => ({ ...page, nextCursor: page.nextCursor ?? null, items: page.items.map(item => ({ ...item,
  locationPreview: item.locationPreview ?? null, plannedDate: item.plannedDate ?? null, dueAt: item.dueAt ?? null, relatedContact: item.relatedContact ?? null,
})) }));
