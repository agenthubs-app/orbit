import { z } from "zod";
import { knownValues, tolerantEnum } from "./tolerant";
import type { EventAssessmentAddToPlanResult, EventAssessmentContract, EventAssessmentScoreItem, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../contract/event-assessment";

// R08 contract 8 (owner 甲 / R26); R24 rubric v2: five fixed criteria 45 / 15 / 20 / 10 / 10, adding up to total.
// Responses tolerant, request bodies strict (see home-layout.ts).
const factFields = {
  title: z.string().max(200).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  venue: z.string().max(200).optional(),
  organizer: z.string().max(200).optional(),
  price: z.string().max(60).optional(),
  url: z.string().url().optional(),
};
const CRITERIA = ["fit", "confidence", "timeCost", "connections", "format"] as const;
const criterion = z.enum(CRITERIA);
const knownCriterion = new Set<string>(CRITERIA);
const key = z.string().min(1).max(200);

export const eventAssessmentObject = z.object({
  id: z.string().min(1),
  // Read tolerantly: unknown source → "url", unknown status → "failed" (the UI offers a retry),
  // unknown verdict → "conditional", unknown criteria and fields are skipped.
  sourceKind: tolerantEnum(["url", "poster", "orbit_event"], "url"),
  status: tolerantEnum(["reading", "ready", "needs_input", "failed"], "failed"),
  facts: z.object(factFields),
  scoreBreakdown: z.array(z.object({ criterion: z.string(), score: z.number().int().min(0).max(45), max: z.number().int().min(1).max(45), reason: z.string().max(200), facts: z.array(z.string().max(200)).max(8).catch([]), estimated: z.boolean().catch(false) })).max(5)
    .transform((items) => items.filter((item) => knownCriterion.has(item.criterion)) as Array<Omit<EventAssessmentScoreItem, "facts"> & { facts: string[] }>),
  total: z.number().int().min(0).max(100),
  verdict: tolerantEnum(["recommend", "conditional", "skip"], "conditional"),
  missingFields: knownValues(["title", "startsAt", "venue", "organizer", "price", "url"]),
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
