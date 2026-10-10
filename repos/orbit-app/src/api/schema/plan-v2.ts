import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type {
  PlanAwardRequest,
  PlanAwardResult,
  PlanCommandResult,
  PlanSkipRequest,
  PlanStepRequest,
  PlanUndoRequest,
  PlanV2Detail,
  PlanV2SummaryResponse,
} from "../contract/plan-v2";

// R22 plan v2.2 (owner 甲). Responses are read tolerantly (README rule 10): unknown keys
// dropped, an unknown goal kind reads as "unknown" (the UI then shows only the goal text),
// list items that cannot be read are skipped. Request bodies stay strict.
// The *Object exports are the uncast schemas for the TS ⇔ zod parity check.
const GOAL_KINDS = ["launch", "fundraising", "sales", "hiring", "partnership", "career", "unknown"] as const;
const goalKind = tolerantEnum(GOAL_KINDS, "unknown");
const count = z.number().int().min(0);

const segment = z.object({
  key: z.string().min(1),
  shortLabel: z.string(),
  emoji: z.string(),
  allocation: count.max(100),
  earned: count,
  overflow: count,
  skipped: z.boolean(),
});

export const planScoreViewObject = z.object({
  total: count,
  talked: count,
  skipped: count,
  overflow: count,
  remainingToFull: count.max(100),
  todayDelta: z.number().int(),
  segments: readableItems(segment),
});

const homeSummary = z.object({
  planId: z.string().min(1),
  goal: z.string().min(1),
  goalKind,
  score: planScoreViewObject,
  todayChance: z.object({ label: z.string().min(1), points: count, href: z.string().min(1) }).nullable().optional(),
  sample: z.literal(true).optional(),
});

const goalItem = z.object({
  planId: z.string().min(1),
  goal: z.string().min(1),
  goalKind,
  status: tolerantEnum(["active", "achieved"], "active"),
  total: count,
  talkedPeople: count,
  lastOpenedAt: z.string().nullable().optional(),
  sample: z.literal(true).optional(),
});

export const planV2SummaryResponseObject = z.object({
  current: homeSummary.nullable(),
  goals: readableItems(goalItem),
});
export const planV2SummaryResponseSchema = planV2SummaryResponseObject as z.ZodType<PlanV2SummaryResponse>;

const basis = z.object({ kind: tolerantEnum(["premise", "landscape", "record", "template"], "template"), ref: z.string(), label: z.string() });
const step = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  doneCriteria: z.string(),
  why: z.string().nullable(),
  personTypeKeys: z.array(z.string()),
  completedAt: z.string().nullable().optional(),
});
const personType = z.object({
  itemId: z.string().min(1),
  key: z.string().min(1),
  slot: z.string().min(1),
  shortLabelId: z.string().min(1),
  shortLabel: z.string().min(1),
  emoji: z.string(),
  roleSituation: z.string(),
  allocation: count.max(100),
  targetCount: z.number().int().min(1).max(5),
  why: z.string(),
  questions: z.array(z.string()),
  countRule: z.string(),
  recognizeHints: z.array(z.string()),
  persona: z.string().nullable().optional(),
  opener: z.string().nullable().optional(),
  introRoutes: readableItems(z.object({ viaContactId: z.string().min(1), why: z.string() })),
  skipped: z.boolean(),
});
export const planV2ContentObject = z.object({
  diagnosis: z.string(),
  conclusion: z.string(),
  flow: z.array(z.object({ emoji: z.string(), label: z.string(), note: z.string() })).optional(),
  steps: readableItems(step),
  personTypes: readableItems(personType),
  event: z.object({ allocation: count.max(100), targetCount: z.number().int().min(1).max(10) }),
  citations: readableItems(z.object({ id: z.string().min(1), version: z.number().int().min(1) })),
  allocationReasons: z.array(z.string()),
  basis: readableItems(basis),
  sample: z.literal(true).optional(),
});

const premiseRow = z.object({
  key: z.string().min(1),
  label: z.string(),
  value: z.string(),
  source: tolerantEnum(["background", "q1", "q2", "q3", "q4", "q5", "record"], "background"),
  guessed: z.boolean(),
});

export const planV2DetailObject = z.object({
  planId: z.string().min(1),
  revision: z.number().int().min(1),
  goal: z.string().min(1),
  goalKind,
  purposeText: z.string().nullable(),
  startsOn: z.string().min(1),
  premise: readableItems(premiseRow),
  content: planV2ContentObject,
  score: planScoreViewObject,
  quota: z.object({
    reviewLeftThisMonth: count,
    reviewMonthlyLimit: count,
    manualEditAvailable: z.boolean(),
    activeGoals: count,
    activeGoalLimit: count,
  }),
  achievedAt: z.string().nullable(),
  sample: z.literal(true).optional(),
});
export const planV2DetailSchema = planV2DetailObject as z.ZodType<PlanV2Detail>;

const idempotencyKey = z.string().min(1).max(200);

export const planAwardRequestObject = z.object({
  contactId: z.string().min(1).max(200).optional(),
  anonymous: z.literal(true).optional(),
  at: z.string().datetime({ offset: true }).optional(),
  basis: z.enum(["talked", "self_report"]),
  idempotencyKey,
}).strict().refine((body) => (body.contactId ? !body.anonymous : body.anonymous === true), { message: "either a contact or anonymous" });
export const planAwardRequestSchema = planAwardRequestObject as unknown as z.ZodType<PlanAwardRequest>;

export const planAwardResultObject = z.object({
  awardLogId: z.string().nullable(),
  points: count,
  part: tolerantEnum(["base", "overflow", "none"], "none"),
  reason: tolerantEnum(["skipped", "anonymous_over_target", "already_counted"], "already_counted").optional(),
  score: planScoreViewObject,
  replayed: z.boolean(),
});
export const planAwardResultSchema = planAwardResultObject as z.ZodType<PlanAwardResult>;

export const planUndoRequestObject = z.object({ idempotencyKey }).strict();
export const planUndoRequestSchema = planUndoRequestObject as z.ZodType<PlanUndoRequest>;
export const planSkipRequestObject = z.object({ idempotencyKey }).strict();
export const planSkipRequestSchema = planSkipRequestObject as z.ZodType<PlanSkipRequest>;
export const planStepRequestObject = z.object({ idempotencyKey }).strict();
export const planStepRequestSchema = planStepRequestObject as z.ZodType<PlanStepRequest>;

export const planCommandResultObject = z.object({
  score: planScoreViewObject,
  replayed: z.boolean(),
  completedAt: z.string().nullable().optional(),
});
export const planCommandResultSchema = planCommandResultObject as z.ZodType<PlanCommandResult>;
