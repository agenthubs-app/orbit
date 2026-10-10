import { z } from "zod";
import type { PlanV2SummaryResponse } from "../contract/plan-v2";

// R08 contract 12 — @draft until R22 (owner 甲): top level only.
export const planV2SummaryResponseSchema = z.object({
  summary: z.object({
    goal: z.string().min(1),
    goalKind: z.string().min(1),
    steps: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), personTypeKey: z.string().min(1) }).strict()),
    personTypes: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), target: z.number().int().min(0), met: z.number().int().min(0) }).strict()),
    sample: z.boolean().optional(),
  }).strict(),
  score: z.object({
    total: z.number().min(0).max(100),
    byType: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), score: z.number().min(0).max(100) }).strict()),
    todayDelta: z.number(),
  }).strict(),
}).strict() as z.ZodType<PlanV2SummaryResponse>;
