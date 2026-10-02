import { z } from "zod";

/** W0051：每人洞察的解析（只加不减；App 解析时剥掉未知字段）。 */
const text = (limit: number) => z.string().trim().min(1).max(limit * 2).refine((value) => Array.from(value).length <= limit);
export const contactInsightTextSchema = z.object({ zh: text(120), en: text(120) });
export const contactInsightPreviewSchema = z.object({ zh: text(60), en: text(60) });
export const contactInsightEvidenceSchema = z.object({
  source: z.enum(["memo", "encounter", "note", "plan", "schedule", "followup_done", "capture", "plan_need"]),
  id: z.string().min(1).max(600),
});
export const contactInsightSchema = z.object({
  contactId: z.string().min(1).max(512),
  goalRelation: contactInsightTextSchema,
  evidence: z.array(contactInsightEvidenceSchema).max(8),
  nextStep: contactInsightTextSchema,
  relevance: z.number().int().min(0).max(100),
  sourceDataVersion: z.string().min(1).max(128),
  generatedAt: z.string().datetime({ offset: true }),
});
export const contactInsightStateSchema = z.enum(["ready", "pending", "no_goal", "failed", "none"]);
