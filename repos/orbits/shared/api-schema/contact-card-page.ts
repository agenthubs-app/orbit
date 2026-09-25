import { z } from "zod";

const count = z.number().int().nonnegative().safe();
export const contactCardSchema = z.object({
  id: z.string().min(1).max(512),
  displayName: z.string().max(256),
  organization: z.string().max(256),
  role: z.string().max(256),
  sourceType: z.enum(["manual", "business_card_ocr", "qr_scan", "event_import", "external_contacts", "email_signal", "calendar_signal", "referral", "chat_summary", "agent_action", "system"]),
  status: z.enum(["active", "needs_follow_up", "nurture", "archived"]),
  pendingInitialization: z.boolean(),
  nextActionPreview: z.string().max(640).refine(value => Array.from(value).length <= 320),
  updatedAt: z.string().datetime({ offset: true }),
});
export const contactCardPageSchema = z.object({
  items: z.array(contactCardSchema).max(50),
  nextCursor: z.string().max(4096).nullable(),
  hasMore: z.boolean(),
  asOf: z.string().datetime({ offset: true }),
});
export const contactCardSummarySchema = z.object({
  total: count,
  sources: z.record(z.string(), count),
  statuses: z.record(z.string(), count),
  values: z.record(z.string(), count),
  tags: z.array(z.object({ value: z.string().max(32), count })).max(50),
  hasMoreTags: z.boolean(),
  asOf: z.string().datetime({ offset: true }),
});
