import { z } from "zod";

const key = z.string().trim().min(1).max(160);
const instant = z.string().max(40).refine((value) => Number.isFinite(Date.parse(value)));
const codePointText = (max: number) => z.string().refine(
  (value) => Array.from(value).length <= max,
  `Text must be at most ${max} Unicode code points`,
);

export const aiSessionSummaryItemSchema = z.object({
  id: key,
  title: codePointText(120),
  firstUserText: codePointText(240),
  lastMessagePreview: codePointText(240),
  createdAt: instant,
  updatedAt: instant,
  messageRevision: z.number().int().nonnegative().safe(),
  organization: z.object({
    customTitle: z.string().max(120).nullable(),
    groupId: key.nullable(),
    pinned: z.boolean(),
    revision: z.number().int().nonnegative().safe(),
  }).strict(),
}).strict();

export const aiSessionSummaryPageSchema = z.object({
  items: z.array(aiSessionSummaryItemSchema).max(50),
  nextCursor: z.string().min(1).max(8000).nullable(),
  hasMore: z.boolean(),
  storage: z.object({
    configured: z.boolean(),
    persisted: z.boolean(),
    source: z.string().optional(),
  }).strict(),
}).strict().superRefine((page, context) => {
  if (page.hasMore !== (page.nextCursor !== null) || new Set(page.items.map((item) => item.id)).size !== page.items.length) {
    context.addIssue({ code: "custom", message: "Inconsistent AI session summary page" });
  }
});
