import { z } from "zod";
import { knownValues, readableItems, tolerantEnum } from "./tolerant";
import type { EventDiscoverResponse } from "../contract/event-discover";

// R27 探す. Responses tolerant (unknown verdict / area → null, unknown badges skipped, unreadable rows skipped); query strict.
export const EVENT_DISCOVER_PERIODS = ["this_week", "this_month", "next_month", "custom"] as const;
export const EVENT_DISCOVER_AREAS = ["online", "tokyo", "osaka", "nagoya"] as const;
export const EVENT_DISCOVER_THEMES = ["funding", "saas", "manufacturing_dx", "hiring", "management", "networking", "ipo", "global"] as const;
export const EVENT_DISCOVER_FORMATS = ["speakers", "networking", "small"] as const;

const nullableEnum = <const T extends readonly [string, ...string[]]>(values: T) => z.string().nullable().transform((value) => (value && (values as readonly string[]).includes(value) ? (value as T[number]) : null)).optional();

export const eventDiscoverRowObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  area: nullableEnum(EVENT_DISCOVER_AREAS),
  priceYen: z.number().int().min(0).nullable().optional().catch(null),
  emoji: z.string().max(16),
  organizerId: z.string().nullable().optional(),
  organizerName: z.string().nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional().catch(null),
  verdict: nullableEnum(["recommend", "conditional", "skip"]),
  reason: z.string().nullable().optional(),
  reasonDetail: z.string().nullable().optional(),
  badges: knownValues(["members_only", "early_access", "last_time"]).optional().catch(undefined),
  communityReason: nullableEnum(["following", "attended"]),
  meetCandidates: readableItems(z.object({ emoji: z.string(), label: z.string() })).optional().catch(undefined),
  knownAttendees: z.array(z.string()).max(10).optional().catch(undefined),
  registrationCount: z.number().int().min(0).nullable().optional().catch(null),
  href: z.string().min(1),
  sample: z.literal(true).optional(),
});

export const eventDiscoverResponseObject = z.object({
  community: readableItems(eventDiscoverRowObject),
  planFit: readableItems(eventDiscoverRowObject),
  all: readableItems(eventDiscoverRowObject),
  total: z.number().int().min(0),
  planFitTotal: z.number().int().min(0),
  popularityFallback: z.boolean(),
  planGoal: z.string().nullable().optional(),
  widen: readableItems(z.object({ kind: z.enum(["period", "area", "theme"]), value: z.string(), extra: z.number().int().min(0) })).optional().catch(undefined),
  signedOut: z.boolean().optional(),
});
export const eventDiscoverResponseSchema = eventDiscoverResponseObject as unknown as z.ZodType<EventDiscoverResponse>;

const csv = <const T extends readonly [string, ...string[]]>(values: T) => z.string().optional().transform((value, ctx) => {
  if (!value) return [] as T[number][];
  const list = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of list) if (!(values as readonly string[]).includes(item)) { ctx.addIssue({ code: "custom", message: `unknown ${item}` }); return z.NEVER; }
  return [...new Set(list)] as T[number][];
});
const bool = z.enum(["1", "0", "true", "false"]).optional().transform((value) => value === "1" || value === "true");

export const eventDiscoverQueryObject = z.object({
  period: z.enum(EVENT_DISCOVER_PERIODS).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  areas: csv(EVENT_DISCOVER_AREAS),
  themes: csv(EVENT_DISCOVER_THEMES),
  formats: csv(EVENT_DISCOVER_FORMATS),
  freeOnly: bool,
  planFirst: z.enum(["1", "0", "true", "false"]).optional().transform((value) => value === undefined ? true : value === "1" || value === "true"),
  sort: z.enum(["recommended", "date"]).default("recommended"),
}).strict();
export type EventDiscoverParsedQuery = z.infer<typeof eventDiscoverQueryObject>;
