import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { EventOverviewResponse } from "../contract/event-overview";

// R27 イベント詳細. Responses tolerant (unknown registration status → none, unreadable attendees skipped).
const STATUSES = ["none", "registered", "pending_review", "waitlisted", "rejected", "cancelled", "attended"] as const;

export const eventOverviewAttendeeObject = z.object({
  attendeeId: z.string().min(1),
  name: z.string(),
  org: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  initial: z.string().max(4),
  planFit: z.boolean(),
  known: z.boolean(),
  wanted: z.boolean(),
});

export const eventOverviewResponseObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  emoji: z.string().max(16),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  priceYen: z.number().int().min(0).nullable().optional().catch(null),
  capacity: z.number().int().min(0).nullable().optional().catch(null),
  remaining: z.number().int().min(0).nullable().optional().catch(null),
  review: z.boolean(),
  deadlineSoon: z.boolean(),
  description: z.string().nullable().optional(),
  agenda: readableItems(z.object({ at: z.string(), title: z.string(), detail: z.string().nullable().optional() })),
  organizer: z.object({
    organizerId: z.string().nullable().optional(),
    name: z.string(),
    emoji: z.string().nullable().optional(),
    since: z.string().nullable().optional(),
    monthly: z.boolean().optional(),
    editions: z.number().int().min(0).nullable().optional().catch(null),
    averageAttendance: z.number().int().min(0).nullable().optional().catch(null),
    typeShare: z.object({ label: z.string(), percent: z.number().int().min(0).max(100) }).nullable().optional().catch(null),
    myAttendance: z.number().int().min(0).nullable().optional().catch(null),
    following: z.boolean().optional(),
  }),
  assessment: z.object({
    score: z.number().int().min(0).max(100),
    verdict: tolerantEnum(["recommend", "conditional", "skip"], "conditional"),
    display: z.object({ goalFit: z.number().int().min(0).max(100), people: z.number().int().min(0).max(100), timeCost: z.number().int().min(0).max(100) }),
    basis: z.string(),
    assessmentId: z.string().nullable().optional(),
  }).nullable().optional().catch(null),
  attendeeCounts: z.object({ all: z.number().int().min(0), planFit: z.number().int().min(0), known: z.number().int().min(0) }),
  attendees: readableItems(eventOverviewAttendeeObject),
  knownAttendees: readableItems(z.object({ name: z.string(), initial: z.string().max(4), speaker: z.boolean().optional() })),
  registration: z.object({ status: tolerantEnum(STATUSES, "none"), href: z.string().min(1) }),
  signedOut: z.boolean().optional(),
  sample: z.literal(true).optional(),
});
export const eventOverviewResponseSchema = eventOverviewResponseObject as unknown as z.ZodType<EventOverviewResponse>;
