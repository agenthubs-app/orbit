import { z } from "zod";
import { contactInsightPreviewSchema } from "./contact-insight";
import { tolerantEnum } from "./tolerant";

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
  valueTypes: z.array(z.enum(["strategic_fit", "commercial_opportunity", "knowledge_exchange", "referral_path", "community_context"])).max(5).default([]),
  updatedAt: z.string().datetime({ offset: true }),
  /** W0051：Web 列表的洞察一句（可选，App 与同步不带）。 */
  insightPreview: contactInsightPreviewSchema.optional(),
  /** R11a（全部可选、宽进）：浓度（不含计划）、出どころ、业界、地区、出会った場所、加入时间、最近往来、计划关联（只在 page）。 */
  density: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  sourceChip: tolerantEnum(["meishi", "linkedin", "phone", "manual", "self", "event"], "manual").optional(),
  primaryIndustryId: z.string().max(64).optional(),
  secondaryIndustryId: z.string().max(64).optional(),
  region: z.object({ countryCode: z.string().max(8), city: z.string().max(64).nullable().optional() }).optional(),
  metKind: tolerantEnum(["event", "referral", "visit", "other"], "other").optional(),
  addedAt: z.string().datetime({ offset: true }).optional(),
  lastInteractionAt: z.string().datetime({ offset: true }).optional(),
  goalRelated: z.boolean().optional(),
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
  densityCounts: z.object({ 1: count, 2: count, 3: count }).optional(),
  addedThisMonth: count.optional(),
  tabCounts: z.object({ goalRelated: count, needsFollowUp: count }).optional(),
  sourceChips: z.record(z.string(), count).optional(),
  industries: z.record(z.string(), count).optional(),
  regions: z.record(z.string(), count).optional(),
  metKinds: z.record(z.string(), count).optional(),
});
