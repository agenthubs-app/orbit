import { z } from "zod";
import { knownValues, readableItems } from "./tolerant";
import type { EventSearchResponse } from "../contract/event-search";

// R27 event search (also the R30 「イベント」 group). Responses tolerant; query strict.
const myStatus = z.string().nullable().transform((value) => (value === "registered" || value === "pending_review" || value === "attended" || value === "planned" ? value : null)).optional();

export const eventSearchEventHitObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  startsAt: z.string(),
  venue: z.string().nullable().optional(),
  emoji: z.string().max(16),
  priceYen: z.number().int().min(0).nullable().optional().catch(null),
  myStatus,
  badges: knownValues(["members_only", "early_access"]).optional().catch(undefined),
  score: z.number().int().min(0).max(100).nullable().optional().catch(null),
  href: z.string().min(1),
});
export const eventSearchOrganizerHitObject = z.object({ organizerId: z.string().min(1), name: z.string(), emoji: z.string().max(16), eventCount: z.number().int().min(0), following: z.boolean() });
export const eventSearchPersonHitObject = z.object({ contactId: z.string().min(1), name: z.string(), org: z.string().nullable().optional(), role: z.string().nullable().optional(), eventCount: z.number().int().min(0), initial: z.string().max(4) });

export const eventSearchResponseObject = z.object({
  query: z.string(),
  events: readableItems(eventSearchEventHitObject),
  eventsTotal: z.number().int().min(0),
  organizers: readableItems(eventSearchOrganizerHitObject),
  people: readableItems(eventSearchPersonHitObject),
  sample: z.literal(true).optional(),
});
export const eventSearchResponseSchema = eventSearchResponseObject as unknown as z.ZodType<EventSearchResponse>;

export const eventSearchQueryObject = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(5),
}).strict();
