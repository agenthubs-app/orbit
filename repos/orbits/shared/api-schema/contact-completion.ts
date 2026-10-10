import { z } from "zod";
import type { ContactCompletionAnswerInput, ContactCompletionQuestion, ContactCompletionResult } from "../contract/contact-completion";

// R08 contract 3 (owner 甲 / R16).
export const contactCompletionQuestionSchema = z.object({
  id: z.string().min(1),
  contactId: z.string().min(1),
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(60)).min(2).max(6),
  askedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skipCount: z.number().int().min(0),
  sample: z.boolean().optional(),
}).strict() as z.ZodType<ContactCompletionQuestion>;

export const contactCompletionAnswerInputSchema = z.object({ answer: z.string().min(1).max(200), idempotencyKey: z.string().min(1).max(200) }).strict() as z.ZodType<ContactCompletionAnswerInput>;

export const contactCompletionResultSchema = z.object({
  questionId: z.string().min(1),
  status: z.enum(["answered", "skipped"]),
  next: contactCompletionQuestionSchema.nullable(),
}).strict() as z.ZodType<ContactCompletionResult>;
