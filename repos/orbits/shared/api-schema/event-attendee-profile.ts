import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { EventAttendeeProfile } from "../contract/event-attendee-profile";

// 2026-11-20 参加者の詳細. Response tolerant: an unknown exchange state falls back to `none`, and a missing
// `canRequestExchange` reads as false (never offers a request by guess).
export const eventAttendeeProfileObject = z.object({
  attendeeId: z.string().min(1),
  participantId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  intro: z.string().nullable().optional(),
  answers: readableItems(z.object({ q: z.string(), a: z.string() })).catch([]),
  together: z.object({
    sharedRounds: readableItems(z.object({ round: z.number().int().min(1), table: z.string() })).catch([]),
    recommended: z.boolean().catch(false),
    why: z.string().nullable().optional(),
    whyDetail: z.string().nullable().optional(),
  }),
  exchange: tolerantEnum(["none", "requested", "incoming", "exchanged"], "none"),
  requestId: z.string().nullable().optional(),
  requestRevision: z.number().int().nullable().optional(),
  contactId: z.string().nullable().optional(),
  memo: z.string().nullable().optional(),
  canRequestExchange: z.boolean().catch(false),
  exchangeClosedReason: z.enum(["not_started", "ended"]).nullable().optional().catch(null),
  exchangeUntil: z.string().nullable().optional(),
});
export const eventAttendeeProfileSchema = eventAttendeeProfileObject as unknown as z.ZodType<EventAttendeeProfile>;
