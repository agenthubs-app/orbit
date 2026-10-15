import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { EventPrepChecklistPatch, EventPrepResponse } from "../contract/event-prep";

// R27 会う準備. Responses tolerant (unknown checklist keys skip the item: the key decides what the row is); PATCH body strict.
export const EVENT_PREP_CHECKLIST_KEYS = ["cards", "intro", "materials", "qr", "return"] as const;

export const eventPrepPersonObject = z.object({
  attendeeId: z.string().min(1),
  contactId: z.string().nullable().optional(),
  name: z.string(),
  org: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  relation: tolerantEnum(["working", "met", "none"], "none"),
  why: z.string(),
  opener: z.string(),
  history: z.string(),
  initial: z.string().max(4),
});
export const eventPrepChecklistItemObject = z.object({ key: z.enum(EVENT_PREP_CHECKLIST_KEYS), label: z.string().max(120).nullable().optional(), done: z.boolean() });

export const eventPrepResponseObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  access: z.string().nullable().optional(),
  mapUrl: z.string().nullable().optional(),
  now: z.string(),
  people: readableItems(eventPrepPersonObject),
  cardsRecommended: z.number().int().min(0),
  checklist: readableItems(eventPrepChecklistItemObject),
  selfIntro: z.object({ text: z.string(), source: tolerantEnum(["registration_draft", "profile"], "profile") }).nullable().optional().catch(null),
  followupSuggestion: z.object({ startsAt: z.string(), endsAt: z.string(), title: z.string() }).nullable().optional().catch(null),
  agenda: readableItems(z.object({ at: z.string(), title: z.string(), detail: z.string().nullable().optional() })).optional().catch(undefined),
  seatHint: z.string().nullable().optional(),
  sample: z.literal(true).optional(),
});
export const eventPrepResponseSchema = eventPrepResponseObject as unknown as z.ZodType<EventPrepResponse>;

export const eventPrepChecklistPatchObject = z.object({
  items: z.array(eventPrepChecklistItemObject.strict()).min(1).max(EVENT_PREP_CHECKLIST_KEYS.length),
}).strict();
export const eventPrepChecklistPatchSchema = eventPrepChecklistPatchObject as z.ZodType<EventPrepChecklistPatch>;
