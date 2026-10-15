import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { EventVenueMemoResult, EventVenueResponse } from "../contract/event-venue";

// R27 会場モード. Responses tolerant: an unknown `state` falls back to `not_registered` (never shows the venue by guess).
const person = z.object({
  attendeeId: z.string().min(1),
  participantId: z.string().min(1),
  name: z.string(),
  org: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  initial: z.string().max(4),
  table: z.string().nullable().optional(),
  exchange: tolerantEnum(["none", "requested", "incoming", "exchanged"], "none"),
  requestId: z.string().nullable().optional(),
  requestRevision: z.number().int().nullable().optional(),
  requestedAt: z.string().nullable().optional(),
  wanted: z.boolean(),
  relation: tolerantEnum(["exchanged", "known", "wanted", "other"], "other"),
  why: z.string().nullable().optional(),
  whyDetail: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  isOrbitUser: z.boolean().optional(),
  memo: z.string().nullable().optional(),
});
export const eventVenuePersonObject = person;
const mate = z.object({ attendeeId: z.string().min(1), name: z.string(), initial: z.string().max(4), org: z.string().nullable().optional(), role: z.string().nullable().optional() });

export const eventVenueResponseObject = z.object({
  state: tolerantEnum(["not_registered", "before_check_in", "checked_in", "ended"], "not_registered"),
  eventId: z.string().min(1),
  title: z.string(),
  now: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  checkIn: z.object({ displayName: z.string(), receptionNumber: z.string().nullable().optional(), qrPayload: z.string().nullable().optional(), available: z.boolean() }).nullable().optional().catch(null),
  round: z.object({ index: z.number().int().min(1), total: z.number().int().min(1), title: z.string(), startsAt: z.string(), endsAt: z.string(), theme: z.string().nullable().optional(), remainingMinutes: z.number().int().min(0) }).nullable().optional().catch(null),
  seats: readableItems(z.object({ round: z.number().int().min(1), table: z.string() })).optional().catch(undefined),
  mySeat: z.object({ table: z.string(), why: z.string().nullable().optional(), whyDetail: z.string().nullable().optional(), tablemates: readableItems(mate) }).nullable().optional().catch(null),
  me: z.object({ name: z.string(), initial: z.string().max(4), org: z.string().nullable().optional(), role: z.string().nullable().optional() }).nullable().optional().catch(null),
  nextRound: z.object({ at: z.string(), round: z.number().int().min(1), table: z.string(), names: z.string() }).nullable().optional().catch(null),
  openers: z.array(z.string()).max(10),
  stats: z.object({ exchanged: z.number().int().min(0), wantedMet: z.number().int().min(0), wantedTotal: z.number().int().min(0), incoming: z.number().int().min(0) }),
  recommendations: readableItems(person),
  nextOrder: readableItems(person),
  attendees: readableItems(person),
  attendeeTotal: z.number().int().min(0),
  groups: z.object({ round: z.number().int().min(1), others: readableItems(z.object({ table: z.string(), theme: z.string().nullable().optional(), count: z.number().int().min(0), initials: z.array(z.string().max(4)).max(8) })), myTheme: z.string().nullable().optional() }).nullable().optional().catch(null),
  mutualHint: z.object({ name: z.string(), via: z.string() }).nullable().optional().catch(null),
  agenda: readableItems(z.object({ at: z.string(), title: z.string(), detail: z.string().nullable().optional(), now: z.boolean().optional(), myTable: z.string().nullable().optional() })),
  agendaTip: z.object({ text: z.string(), detail: z.string().nullable().optional() }).nullable().optional().catch(null),
  meetingSlots: z.array(z.string()).max(3).optional().catch(undefined),
  sample: z.literal(true).optional(),
});
export const eventVenueResponseSchema = eventVenueResponseObject as unknown as z.ZodType<EventVenueResponse>;

export const eventVenueMemoInputObject = z.object({ attendeeId: z.string().min(1).max(200), text: z.string().trim().max(200) }).strict();
export const eventVenueMemoResultObject = z.object({ attendeeId: z.string().min(1), memo: z.string().nullable() });
export const eventVenueMemoResultSchema = eventVenueMemoResultObject as z.ZodType<EventVenueMemoResult>;
