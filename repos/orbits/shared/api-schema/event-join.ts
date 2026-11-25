import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import { hostEventContactObject } from "./host-events";
import type { EventJoinAnswer, EventJoinCancelResult, EventJoinCurrent, EventJoinProfile, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "../contract/event-join";

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
  prefill: z.array(z.string()).max(12).optional().catch(undefined),
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
  items: readableItems(z.object({ key: z.enum(ITEM_KEYS), done: z.boolean(), fromProfile: z.boolean().optional().catch(undefined) })),
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
  hostContact: hostEventContactObject.nullable().optional().catch(null),
});
export const eventJoinResultSchema = eventJoinResultObject as unknown as z.ZodType<EventJoinResult>;
export const eventJoinTentativeResultObject = z.object({ eventId: z.string().min(1), scheduleItemId: z.string().min(1), title: z.string() });
export const eventJoinTentativeResultSchema = eventJoinTentativeResultObject as z.ZodType<EventJoinTentativeResult>;
export const eventJoinCancelResultObject = z.object({ eventId: z.string().min(1), status: z.literal("cancelled") });
export const eventJoinCancelResultSchema = eventJoinCancelResultObject as z.ZodType<EventJoinCancelResult>;

export const eventJoinAnswerObject = z.object({ field: z.string().min(1).max(40), prompt: z.string().max(240), answer: z.string().trim().min(1).max(1000), questionToken: z.string().min(1).max(4000) }).strict();
export const eventJoinAnswerSchema = eventJoinAnswerObject as z.ZodType<EventJoinAnswer>;
// 5 问；满 5 问仍缺项时确认页「追加」针对缺项追问，最多再 4 问（join.ts JOIN_ANSWER_MAX）。
const answers = z.array(eventJoinAnswerObject).max(9);
/** `focus`: ask this one item (the profile would fill it, the person wants to answer it). `more`: ask one more question although the interview judged it had enough (review 「追加」 / 「質問に戻る」). */
export const eventJoinNextInputObject = z.object({ answers, focus: z.enum(ITEM_KEYS).optional(), more: z.boolean().default(false) }).strict();
/** `edit`: changing an existing registration (items the profile fills count from the start; no new draft is written). */
export const eventJoinProfileInputObject = z.object({ answers, draft: z.boolean().default(false), edit: z.boolean().default(false) }).strict();
export const eventJoinCurrentObject = z.object({
  status: tolerantEnum(["none", "registered", "pending_review", "waitlisted", "rejected", "cancelled"], "none"),
  blocked: z.enum(["JOIN_CLOSED", "JOIN_LOCKED", "JOIN_REJECTED"]).nullable().catch(null),
  answers: readableItems(eventJoinAnswerObject.extend({ item: z.enum(ITEM_KEYS).nullable().catch(null), question: eventJoinQuestionObject }).strip()),
  ask: readableItems(eventJoinQuestionObject.extend({ item: z.enum(ITEM_KEYS).nullable().catch(null) })),
  selfIntro: z.string().nullable().catch(null),
});
export const eventJoinCurrentSchema = eventJoinCurrentObject as unknown as z.ZodType<EventJoinCurrent>;
/** `selfIntro`: the self-introduction as edited on the review step (kept with this registration). */
/** `edit`: changing an existing registration — a cancelled or rejected one is refused instead of being registered again. */
export const eventJoinSubmitInputObject = z.object({ answers: answers.min(1), edit: z.boolean().default(false), idempotencyKey: z.string().min(1).max(200), selfIntro: z.string().trim().min(1).max(400).optional() }).strict();
export const eventJoinTentativeInputObject = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();
export const eventJoinCancelInputObject = z.object({ idempotencyKey: z.string().min(1).max(200) }).strict();
