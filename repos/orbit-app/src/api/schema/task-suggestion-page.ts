import { z } from "zod";

export const taskSuggestionCardSchema = z.object({
  id: z.string().min(1).max(2048),
  titlePreview: z.string().min(1).max(480).refine(value => Array.from(value).length <= 240),
  reasonPreview: z.string().min(1).max(640).refine(value => Array.from(value).length <= 320),
  category: z.enum(["relationship", "meeting", "event", "work", "personal", "other"]),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();

export const taskSuggestionPageSchema = z.object({
  actorId: z.string().min(1),
  scope: z.enum(["all", "relationship"]),
  items: z.array(taskSuggestionCardSchema).max(30),
  total: z.number().int().nonnegative().safe(),
  nextCursor: z.string().min(1).max(8000).nullable(),
  hasMore: z.boolean(),
  asOf: z.string().datetime({ offset: true }),
}).strict().refine(page => page.hasMore === Boolean(page.nextCursor) && page.total >= page.items.length &&
  new Set(page.items.map(item => item.id)).size === page.items.length)
  .transform(page => ({ ...page, nextCursor: page.nextCursor ?? null }));
