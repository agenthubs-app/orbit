import { z } from "zod";
import { knownValues, readableItems, tolerantEnum } from "./tolerant";
import type { GlobalSearchResponse } from "../contract/global-search";

// R30 global search (search/DESIGN.md §3.1). Responses tolerant (README rule 10); the query strict.
export const GLOBAL_SEARCH_TYPES = ["people", "events", "conversations"] as const;

const highlightObject = z.object({ field: tolerantEnum(["title", "subtitle"], "title"), start: z.number().int().min(0), end: z.number().int().min(0) });
const highlights = readableItems(highlightObject);

export const globalSearchPersonHitObject = z.object({
  contactId: z.string().min(1),
  name: z.string(),
  initial: z.string().max(4),
  org: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  status: z.string().nullable().transform((value) => (value === "in_progress" || value === "acquaintance" ? value : null)).optional(),
  reason: z.string().nullable().optional(),
  related: z.boolean().catch(false).optional(),
  highlights,
  href: z.string().min(1),
});
export const globalSearchEventHitObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  emoji: z.string().max(16),
  startsAt: z.string(),
  note: z.string(),
  via: z.string().nullable().transform((value) => (value === "attendees" ? value : null)).optional(),
  highlights,
  href: z.string().min(1),
});
export const globalSearchConversationHitObject = z.object({
  id: z.string().min(1),
  kind: z.enum(["iorbit", "inbox"]),
  title: z.string(),
  subtitle: z.string(),
  highlights,
  href: z.string().min(1),
});

const groupTotal = z.number().int().min(0);
const groupOrder = z.literal("relevance").optional().catch(undefined);
const peopleGroupObject = z.object({ total: groupTotal, items: readableItems(globalSearchPersonHitObject), order: groupOrder });
const eventsGroupObject = z.object({ total: groupTotal, items: readableItems(globalSearchEventHitObject), order: groupOrder });
const conversationsGroupObject = z.object({ total: groupTotal, items: readableItems(globalSearchConversationHitObject), order: groupOrder });

export const globalSearchSuggestionObject = z.object({ kind: z.literal("industry"), emoji: z.string().max(16), label: z.string(), count: z.number().int().min(0), href: z.string().min(1) });
export const globalSearchAlternativeObject = z.object({ kind: z.enum(["ask_iorbit", "events"]), emoji: z.string().max(16), label: z.string(), detail: z.string(), href: z.string().min(1) });
export const globalSearchSemanticObject = z.object({ available: z.boolean(), enabled: z.boolean(), matched: z.number().int().min(0).optional(), related: z.number().int().min(0).optional() });

export const globalSearchResponseObject = z.object({
  query: z.string(),
  types: knownValues(GLOBAL_SEARCH_TYPES),
  people: peopleGroupObject,
  events: eventsGroupObject,
  conversations: conversationsGroupObject.optional(),
  semantic: globalSearchSemanticObject,
  searchedPeople: z.number().int().min(0),
  examples: readableItems(z.string()),
  suggestions: readableItems(globalSearchSuggestionObject),
  alternatives: readableItems(globalSearchAlternativeObject),
  sample: z.literal(true).optional(),
});
export const globalSearchResponseSchema = globalSearchResponseObject as unknown as z.ZodType<GlobalSearchResponse>;

/** `q` 0–100 chars (empty = capability query); `types` a comma list; `limit` 1–20 (default 6 — the board shows 6 people under すべて). */
export const globalSearchQueryObject = z.object({
  q: z.string().trim().max(100).default(""),
  types: z.string().optional().transform((value) => (value === undefined || value === "" ? undefined : value.split(",").map((item) => item.trim()).filter((item): item is (typeof GLOBAL_SEARCH_TYPES)[number] => (GLOBAL_SEARCH_TYPES as readonly string[]).includes(item)))),
  limit: z.coerce.number().int().min(1).max(20).default(6),
  semantic: z.string().optional().transform((value) => value === "1" || value === "true"),
}).strict();
