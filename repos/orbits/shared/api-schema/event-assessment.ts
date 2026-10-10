import { z } from "zod";
import type { EventAssessmentAddToPlanResult, EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../contract/event-assessment";

// R08 contract 8 (owner 甲 / R26). Five fixed criteria, 0–20 each, adding up to total.
// Responses tolerant, request bodies strict (see home-layout.ts).
const factFields = {
  title: z.string().max(200).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  venue: z.string().max(200).optional(),
  organizer: z.string().max(200).optional(),
  price: z.string().max(60).optional(),
  url: z.string().url().optional(),
};
const criterion = z.enum(["goalFit", "people", "timing", "cost", "followUp"]);
const key = z.string().min(1).max(200);

export const eventAssessmentObject = z.object({
  id: z.string().min(1),
  sourceKind: z.enum(["url", "poster", "orbit_event"]),
  status: z.enum(["reading", "ready", "needs_input", "failed"]),
  facts: z.object(factFields),
  scoreBreakdown: z.array(z.object({ criterion, score: z.number().int().min(0).max(20), reason: z.string().max(200) })).max(5),
  total: z.number().int().min(0).max(100),
  verdict: z.enum(["recommend", "conditional", "skip"]),
  missingFields: z.array(z.enum(["title", "startsAt", "venue", "organizer", "price", "url"])),
  rubricVersion: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  sample: z.literal(true).optional(),
});
export const eventAssessmentSchema = eventAssessmentObject.refine((value) => value.status !== "ready" || (value.scoreBreakdown.length === 5 && value.scoreBreakdown.reduce((sum, item) => sum + item.score, 0) === value.total), { message: "a ready assessment has the five criteria adding up to total" }) as unknown as z.ZodType<EventAssessmentContract>;

export const eventAssessmentCreateInputObject = z.discriminatedUnion("sourceKind", [
  z.object({ sourceKind: z.literal("url"), url: z.string().url(), idempotencyKey: key }).strict(),
  z.object({ sourceKind: z.literal("poster"), posterAssetId: z.string().min(1).max(200), idempotencyKey: key }).strict(),
  z.object({ sourceKind: z.literal("orbit_event"), eventId: z.string().min(1).max(200), idempotencyKey: key }).strict(),
]);
export const eventAssessmentCreateInputSchema = eventAssessmentCreateInputObject as z.ZodType<EventAssessmentCreateInput>;

export const eventAssessmentPatchInputObject = z.object({ facts: z.object(factFields).strict() }).strict();
export const eventAssessmentPatchInputSchema = eventAssessmentPatchInputObject as z.ZodType<EventAssessmentPatchInput>;

export const eventAssessmentAddToPlanResultObject = z.object({ assessmentId: z.string().min(1), addedToPlan: z.literal(true) });
export const eventAssessmentAddToPlanResultSchema = eventAssessmentAddToPlanResultObject as z.ZodType<EventAssessmentAddToPlanResult>;
