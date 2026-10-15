import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { EventJoinAnswer, EventJoinCancelResult, EventJoinProfile, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../contract/event-join";

// R27 参加登録 facade. Responses tolerant (unknown item keys skip the item); request bodies strict.
const ITEM_KEYS = ["company", "purpose", "topics", "target", "offer"] as const;

export const eventJoinQuestionObject = z.object({
  field: z.string().min(1),
  prompt: z.string(),
  help: z.string().nullable().optional(),
  options: z.array(z.string()).max(12),
  multi: z.boolean(),
  max: z.number().int().min(1).nullable().optional(),
  allowCustom: z.boolean(),
  questionToken: z.string().min(1),
});
export const eventJoinStepObject = z.object({
  index: z.number().int().min(0),
  total: z.number().int().min(1),
  remainingMinutes: z.number().int().min(0),
  done: z.boolean(),
  question: eventJoinQuestionObject.nullable().optional(),
});
export const eventJoinStepSchema = eventJoinStepObject as unknown as z.ZodType<EventJoinStep>;

export const eventJoinProfileObject = z.object({
  coverage: z.number().int().min(0).max(100),
  items: readableItems(z.object({ key: z.enum(ITEM_KEYS), done: z.boolean() })),
  topics: z.array(z.string()).max(12),
  selfIntro: z.object({ text: z.string(), source: tolerantEnum(["ai_draft", "profile"], "profile") }).nullable().optional().catch(null),
  selfIntroBasis: z.string().nullable().optional(),
  editableUntil: z.string().nullable().optional(),
  reviewUntil: z.string().nullable().optional(),
  review: z.boolean(),
});
export const eventJoinProfileSchema = eventJoinProfileObject as unknown as z.ZodType<EventJoinProfile>;

export const eventJoinResultObject = z.object({
  eventId: z.string().min(1),
  status: tolerantEnum(["registered", "pending_review"], "pending_review"),
  submittedAt: z.string(),
  reviewUntil: z.string().nullable().optional(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  tentative: z.object({ startsAt: z.string(), endsAt: z.string(), title: z.string() }).nullable().optional().catch(null),
});
export const eventJoinResultSchema = eventJoinResultObject as unknown as z.ZodType<EventJoinResult>;
export const eventJoinTentativeResultObject = z.object({ eventId: z.string().min(1), scheduleItemId: z.string().min(1), title: z.string() });
export const eventJoinTentativeResultSchema = eventJoinTentativeResultObject as z.ZodType<EventJoinTentativeResult>;
export const eventJoinCancelResultObject = z.object({ eventId: z.string().min(1), status: z.literal("cancelled") });
export const eventJoinCancelResultSchema = eventJoinCancelResultObject as z.ZodType<EventJoinCancelResult>;

export const eventJoinAnswerObject = z.object({ field: z.string().min(1).max(40), prompt: z.string().max(240), answer: z.string().trim().min(1).max(1000), questionToken: z.string().min(1).max(4000) }).strict();
export const eventJoinAnswerSchema = eventJoinAnswerObject as z.ZodType<EventJoinAnswer>;
const answers = z.array(eventJoinAnswerObject).max(5);
/** `more`: ask one more question although the interview judged it had enough (review 「追加」 / 「質問に戻る」). */
export const eventJoinNextInputObject = z.object({ answers, more: z.boolean().default(false) }).strict();
export const eventJoinProfileInputObject = z.object({ answers, draft: z.boolean().default(false) }).strict();
/** `selfIntro`: the self-introduction as edited on the review step (kept with this registration). */
export const eventJoinSubmitInputObject = z.object({ answers: answers.min(1), idempotencyKey: z.string().min(1).max(200), selfIntro: z.string().trim().min(1).max(400).optional() }).strict();
export const eventJoinTentativeInputObject = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();
export const eventJoinCancelInputObject = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();
