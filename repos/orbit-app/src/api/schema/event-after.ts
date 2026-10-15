import { z } from "zod";
import { readableItems } from "./tolerant";
import type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterResponse } from "../contract/event-after";

// R27 会後のふりかえり. Responses tolerant; the confirm body is strict.
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const eventAfterNextStepObject = z.object({
  attendeeId: z.string().min(1),
  contactId: z.string().nullable().optional(),
  name: z.string(),
  org: z.string().nullable().optional(),
  initial: z.string().max(4),
  followupDate: date,
  planType: z.object({ key: z.string().min(1), label: z.string() }).nullable().optional().catch(null),
  thanksDraft: z.object({ subject: z.string(), body: z.string() }).nullable().optional().catch(null),
  alreadyCounted: z.boolean().optional(),
});
export const eventAfterScoreSlotObject = z.object({ key: z.string().min(1), allocation: z.number().int().min(0), targetCount: z.number().int().min(0), earnedCount: z.number().int().min(0), earnedPoints: z.number().int().min(0), skipped: z.boolean() });

export const eventAfterResponseObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  date,
  met: z.object({ count: z.number().int().min(0), initials: z.array(z.string().max(4)).max(10), exchanged: z.number().int().min(0), wantedMet: z.number().int().min(0), wantedTotal: z.number().int().min(0), meetings: z.number().int().min(0) }),
  highlights: readableItems(z.object({ emoji: z.string().max(16), title: z.string(), detail: z.string(), evidence: z.string() })).optional().catch(undefined),
  summary: z.string().nullable().optional(),
  aiDraft: z.boolean(),
  nextSteps: readableItems(eventAfterNextStepObject),
  score: z.object({ goal: z.string(), before: z.number().int().min(0).max(100), after: z.number().int().min(0).max(100), detail: z.string() }).nullable().optional().catch(null),
  scoreSlots: readableItems(eventAfterScoreSlotObject).optional().catch(undefined),
  confirmedAt: z.string().nullable().optional(),
  sample: z.literal(true).optional(),
});
export const eventAfterResponseSchema = eventAfterResponseObject as unknown as z.ZodType<EventAfterResponse>;

export const eventAfterConfirmInputObject = z.object({
  items: z.array(z.object({ attendeeId: z.string().min(1).max(200), followupDate: date, planTypeKey: z.string().min(1).max(80).nullable().optional() }).strict()).min(1).max(50),
  idempotencyKey: z.string().min(1).max(200),
}).strict();
export const eventAfterConfirmInputSchema = eventAfterConfirmInputObject as z.ZodType<EventAfterConfirmInput>;
export const eventAfterConfirmResultObject = z.object({ eventId: z.string().min(1), confirmed: z.number().int().min(0), tasksCreated: z.number().int().min(0), contactsLinked: z.number().int().min(0), scoreAfter: z.number().int().min(0).max(100).nullable().optional(), confirmedAt: z.string() });
export const eventAfterConfirmResultSchema = eventAfterConfirmResultObject as z.ZodType<EventAfterConfirmResult>;
