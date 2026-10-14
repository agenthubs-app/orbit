import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { MyEventsResponse } from "../contract/events-mine";

// R26 events-mine. Responses tolerant (unknown status skips the row: it decides what the row is), query strict.
const STATUSES = ["registered", "pending_review", "waitlisted", "planned", "attended", "rejected", "cancelled"] as const;

export const myEventItemObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  emoji: z.string().max(16),
  status: z.enum(STATUSES),
  meetCount: z.number().int().min(0).nullable().optional().catch(null),
  meetInitials: z.array(z.string().max(4)).max(4).optional().catch(undefined),
  assessmentId: z.string().min(1).nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional().catch(null),
  href: z.string().min(1),
  sample: z.literal(true).optional(),
});

export const myEventsResponseObject = z.object({
  range: tolerantEnum(["upcoming", "past"], "upcoming"),
  items: readableItems(myEventItemObject),
  upcomingCount: z.number().int().min(0),
});
export const myEventsResponseSchema = myEventsResponseObject as unknown as z.ZodType<MyEventsResponse>;

export const myEventsQueryObject = z.object({
  range: z.enum(["upcoming", "past"]).default("upcoming"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
