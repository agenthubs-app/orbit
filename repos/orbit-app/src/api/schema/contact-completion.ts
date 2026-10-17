import { z } from "zod";
import { tolerantEnum } from "./tolerant";
import type { ContactCompletionAnswerInput, ContactCompletionQuestion, ContactCompletionResult } from "../contract/contact-completion";

// R08 contract 3 (owner 甲 / R16). Responses tolerant, request bodies strict (see home-layout.ts).
export const contactCompletionQuestionObject = z.object({
  id: z.string().min(1),
  contactId: z.string().min(1),
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(60)).min(2).max(6),
  askedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skipCount: z.number().int().min(0),
  sample: z.literal(true).optional(),
  // R16 (append-only, all optional): unknown chip → manual, unknown kind → met_where.
  contactName: z.string().min(1).max(120).optional(),
  contactSubtitle: z.string().max(300).optional(),
  sourceChip: tolerantEnum(["meishi", "linkedin", "phone", "manual", "self", "event"], "manual").optional(),
  kind: tolerantEnum(["met_where", "organization"], "met_where").optional(),
  densityIfAnswered: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
export const contactCompletionQuestionSchema = contactCompletionQuestionObject as z.ZodType<ContactCompletionQuestion>;

export const contactCompletionAnswerInputObject = z.object({ answer: z.string().trim().min(1).max(200), idempotencyKey: z.string().min(1).max(200) }).strict();
export const contactCompletionAnswerInputSchema = contactCompletionAnswerInputObject as z.ZodType<ContactCompletionAnswerInput>;

export const contactCompletionResultObject = z.object({
  questionId: z.string().min(1),
  status: tolerantEnum(["answered", "skipped"], "answered"),
  next: contactCompletionQuestionObject.nullable(),
  // R16: D-10 density after the answer.
  densityAfter: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});
export const contactCompletionResultSchema = contactCompletionResultObject as z.ZodType<ContactCompletionResult>;
