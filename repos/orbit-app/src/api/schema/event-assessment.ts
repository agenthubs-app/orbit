import { z } from "zod";
import { knownValues, readableItems, tolerantEnum } from "./tolerant";
import type { EventAssessmentAddToPlanResult, EventAssessmentAvailability, EventAssessmentContract, EventAssessmentDeleteResult, EventAssessmentDismissResult, EventAssessmentScoreItem, EventAssessmentCreateInput, EventAssessmentPatchInput } from "../contract/event-assessment";

// R08 contract 8 (owner 甲 / R26); R24 rubric v2: five fixed criteria 45 / 15 / 20 / 10 / 10, adding up to total.
// Responses tolerant, request bodies strict (see home-layout.ts).
const factFields = {
  title: z.string().max(200).optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  venue: z.string().max(200).optional(),
  organizer: z.string().max(200).optional(),
  price: z.string().max(60).optional(),
  url: z.string().url().optional(),
  // R26 additions (events DESIGN §4.1).
  endsAt: z.string().datetime({ offset: true }).optional(),
  area: z.string().max(120).optional(),
  speakers: z.array(z.object({ name: z.string().min(1).max(120), org: z.string().max(160).optional(), role: z.string().max(160).optional() })).max(40).optional(),
  exhibitorCount: z.number().int().min(0).max(100000).optional(),
  expectedAttendees: z.number().int().min(0).max(1000000).optional(),
  format: z.object({ networking: z.boolean(), tableTalk: z.boolean().optional(), matching: z.boolean().optional() }).optional(),
  agenda: z.array(z.object({ at: z.string().min(1).max(40), title: z.string().min(1).max(200), minutes: z.number().int().min(0).max(1440).optional() })).max(40).optional(),
};
const FACT_KEYS = ["title", "startsAt", "venue", "organizer", "price", "url", "endsAt", "area", "speakers", "exhibitorCount", "expectedAttendees", "format", "agenda"] as const;
const FAILURE_REASONS = ["login_required", "not_event_page", "unreadable", "fetch_failed", "too_large", "blocked_host", "ai_unavailable", "quota_exceeded", "timeout"] as const;
const displayValue = z.object({ value: z.number().int().min(0).max(100), min: z.number().int().min(0).max(100).optional(), max: z.number().int().min(0).max(100).optional(), reason: z.string().max(200).optional() });
// Read tolerantly: an unknown basis drops that entry; an unknown failure reason reads as "unreadable".
const factBasis = z.record(z.string(), z.string()).transform((map) => Object.fromEntries(Object.entries(map).filter(([field, basis]) => (FACT_KEYS as readonly string[]).includes(field) && ["read", "guessed", "user", "rule"].includes(basis))));
const CRITERIA = ["fit", "confidence", "timeCost", "connections", "format"] as const;
const criterion = z.enum(CRITERIA);
const knownCriterion = new Set<string>(CRITERIA);
const key = z.string().min(1).max(200);

export const eventAssessmentObject = z.object({
  id: z.string().min(1),
  // Read tolerantly: unknown source → "url", unknown status → "failed" (the UI offers a retry),
  // unknown verdict → "conditional", unknown criteria and fields are skipped.
  sourceKind: tolerantEnum(["url", "poster", "orbit_event", "text", "manual"], "url"),
  status: tolerantEnum(["reading", "ready", "needs_input", "failed"], "failed"),
  facts: z.object(factFields),
  scoreBreakdown: z.array(z.object({ criterion: z.string(), score: z.number().int().min(0).max(45), max: z.number().int().min(1).max(45), reason: z.string().max(200), facts: z.array(z.string().max(200)).max(8).catch([]), estimated: z.boolean().catch(false) })).max(5)
    .transform((items) => items.filter((item) => knownCriterion.has(item.criterion)) as Array<Omit<EventAssessmentScoreItem, "facts"> & { facts: string[] }>),
  total: z.number().int().min(0).max(100),
  verdict: tolerantEnum(["recommend", "conditional", "skip"], "conditional"),
  missingFields: knownValues(FACT_KEYS),
  rubricVersion: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  sample: z.literal(true).optional(),
  // R26 additions — optional, read tolerantly.
  factBasis: factBasis.optional().catch(undefined),
  display: z.object({ goalFit: displayValue, people: displayValue, timeCost: displayValue }).optional().catch(undefined),
  scoreRange: z.object({ min: z.number().int().min(0).max(100), max: z.number().int().min(0).max(100) }).optional().catch(undefined),
  meetCandidates: readableItems(z.object({ emoji: z.string().max(16), label: z.string().max(120), count: z.number().int().min(0).optional(), basis: z.string().max(200), source: z.enum(["speakers", "exhibitors", "registrants", "known"]).optional().catch(undefined), names: z.array(z.string().max(60)).max(6).optional().catch(undefined) })).optional(),
  knownAttendees: readableItems(z.object({ contactId: z.string().min(1), name: z.string().max(120) })).optional(),
  cautions: readableItems(z.object({ kind: tolerantEnum(["fee", "off_target_session", "calendar", "travel", "other"], "other"), text: z.string().max(200), detail: z.string().max(200).optional() })).optional(),
  partialAttendanceHint: z.object({ window: z.string().max(60), timeCostAfter: z.number().int().min(0).max(100) }).optional().catch(undefined),
  failureReason: tolerantEnum(FAILURE_REASONS, "unreadable").optional(),
  pageCandidates: readableItems(z.object({ title: z.string().min(1).max(200), url: z.string().url().optional(), startsAt: z.string().optional(), venue: z.string().max(120).optional(), note: z.string().max(120).optional() })).optional(),
  userFilledFields: knownValues(FACT_KEYS).optional(),
  // R26 App 像素返工（只加）：原样采用了推测值的项（读不懂按缺省）。
  adoptedGuessFields: knownValues(FACT_KEYS).optional().catch(undefined),
  userDecision: z.enum(["added", "dismissed"]).optional().catch(undefined),
  eventId: z.string().min(1).optional(),
  assessedAt: z.string().datetime({ offset: true }).optional().catch(undefined),
  goalLabel: z.string().max(200).optional(),
  sourceLabel: z.string().max(200).optional(),
  readSeconds: z.number().int().min(0).max(3600).optional().catch(undefined),
  basisLines: z.array(z.string().max(300)).max(8).optional().catch(undefined),
  planItemId: z.string().min(1).optional(),
  recomputeOnAttendeeList: z.boolean().optional().catch(undefined),
  posterAssetIds: z.array(z.string().min(1)).max(3).optional().catch(undefined),
  readIssue: z.enum(["blurry"]).optional().catch(undefined),
});
export const eventAssessmentSchema = eventAssessmentObject.refine((value) => value.status !== "ready" || (value.scoreBreakdown.length === 5 && value.scoreBreakdown.reduce((sum, item) => sum + item.score, 0) === value.total), { message: "a ready assessment has the five criteria adding up to total" }) as unknown as z.ZodType<EventAssessmentContract>;

export const eventAssessmentCreateInputObject = z.discriminatedUnion("sourceKind", [
  z.object({ sourceKind: z.literal("url"), url: z.string().url(), idempotencyKey: key }).strict(),
  z.object({ sourceKind: z.literal("poster"), posterAssetId: z.string().min(1).max(200), posterAssetIds: z.array(z.string().min(1).max(200)).min(1).max(3).optional(), idempotencyKey: key }).strict(),
  z.object({ sourceKind: z.literal("orbit_event"), eventId: z.string().min(1).max(200), idempotencyKey: key }).strict(),
  z.object({ sourceKind: z.literal("text"), text: z.string().trim().min(20).max(20000), url: z.string().url().optional(), idempotencyKey: key }).strict(),
  z.object({ sourceKind: z.literal("manual"), facts: z.object(factFields).strict(), idempotencyKey: key }).strict(),
]);
export const eventAssessmentCreateInputSchema = eventAssessmentCreateInputObject as z.ZodType<EventAssessmentCreateInput>;

export const eventAssessmentPatchInputObject = z.object({ facts: z.object(factFields).strict(), unknownFields: z.array(z.enum(["startsAt", "venue", "price"])).max(3).optional() }).strict();
export const eventAssessmentPatchInputSchema = eventAssessmentPatchInputObject as z.ZodType<EventAssessmentPatchInput>;

export const eventAssessmentAddToPlanResultObject = z.object({ assessmentId: z.string().min(1), addedToPlan: z.literal(true), planId: z.string().min(1).nullable().optional(), planItemId: z.string().min(1).nullable().optional() });
export const eventAssessmentAddToPlanResultSchema = eventAssessmentAddToPlanResultObject as z.ZodType<EventAssessmentAddToPlanResult>;

// R26: 見送る and the entry availability.
export const eventAssessmentDismissResultObject = z.object({ assessmentId: z.string().min(1), userDecision: z.literal("dismissed") });
export const eventAssessmentDismissResultSchema = eventAssessmentDismissResultObject as z.ZodType<EventAssessmentDismissResult>;
export const eventAssessmentDeleteResultObject = z.object({ assessmentId: z.string().min(1), deleted: z.literal(true) });
export const eventAssessmentDeleteResultSchema = eventAssessmentDeleteResultObject as z.ZodType<EventAssessmentDeleteResult>;
const countOrNull = z.number().int().min(0).nullable().optional().catch(null);
export const eventAssessmentAvailabilityObject = z.object({ monthlyLeft: countOrNull, monthlyLimit: countOrNull, dailyLeft: countOrNull, aiReadAvailable: z.boolean() });
export const eventAssessmentAvailabilitySchema = eventAssessmentAvailabilityObject as z.ZodType<EventAssessmentAvailability>;
