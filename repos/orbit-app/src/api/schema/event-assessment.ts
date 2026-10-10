import { z } from "zod";
import type { EventAssessmentContract, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../contract/event-assessment";

// R08 contract 8 (owner 甲 / R26). Five fixed criteria, 0–20 each, adding up to total.
const facts = z.object({
  title: z.string().max(200).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  venue: z.string().max(200).optional(),
  organizer: z.string().max(200).optional(),
  price: z.string().max(60).optional(),
  url: z.string().url().optional(),
}).strict();
const criterion = z.enum(["goalFit", "people", "timing", "cost", "followUp"]);

export const eventAssessmentSchema = z.object({
  id: z.string().min(1),
  sourceKind: z.enum(["url", "poster", "orbit_event"]),
  status: z.enum(["reading", "ready", "needs_input", "failed"]),
  facts,
  scoreBreakdown: z.array(z.object({ criterion, score: z.number().int().min(0).max(20), reason: z.string().max(200) }).strict()).max(5),
  total: z.number().int().min(0).max(100),
  verdict: z.enum(["recommend", "conditional", "skip"]),
  missingFields: z.array(z.enum(["title", "startsAt", "venue", "organizer", "price", "url"])),
  rubricVersion: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  sample: z.boolean().optional(),
}).strict().refine((value) => value.status !== "ready" || (value.scoreBreakdown.length === 5 && value.scoreBreakdown.reduce((sum, item) => sum + item.score, 0) === value.total), { message: "a ready assessment has the five criteria adding up to total" }) as unknown as z.ZodType<EventAssessmentContract>;

export const eventAssessmentCreateInputSchema = z.object({
  sourceKind: z.enum(["url", "poster", "orbit_event"]),
  url: z.string().url().optional(),
  eventId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(200),
}).strict() as z.ZodType<EventAssessmentCreateInput>;

export const eventAssessmentPatchInputSchema = z.object({ facts }).strict() as z.ZodType<EventAssessmentPatchInput>;
