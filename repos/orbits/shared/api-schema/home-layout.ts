import { z } from "zod";
import { tolerantEnum } from "./tolerant";
import type { HomeLayoutContract, HomeLayoutUpdateInput, HomeWidgetSlot } from "../contract/home-layout";

// R08 contract 1 (owner 乙 / R10). Each widget at most once per surface.
// Responses are read tolerantly (unknown keys are dropped, so an older client keeps
// working after a later Sprint adds an optional field); request bodies stay strict.
// The *Object exports are the uncast schemas for the TS ⇔ zod parity check.
const KEYS = ["today", "planScore", "nextEvent", "network", "secretary", "pending", "week", "eventPick", "memo", "deadline"] as const;
const key = z.enum(KEYS);
const slot = z.object({ key, size: z.enum(["s", "m"]) });
// Read: a widget this client does not know is skipped, an unknown size reads as "s".
const knownKey = new Set<string>(KEYS);
const slots = z.array(z.object({ key: z.string(), size: tolerantEnum(["s", "m"], "s") }))
  .transform((items) => items.filter((item): item is HomeWidgetSlot => knownKey.has(item.key)))
  .refine((items) => new Set(items.map((item) => item.key)).size === items.length, { message: "a widget appears once" });

export const homeLayoutObject = z.object({
  revision: z.number().int().min(0),
  app: slots,
  web: slots,
  hintDismissedAt: z.string().datetime({ offset: true }).optional(),
});
export const homeLayoutSchema = homeLayoutObject as z.ZodType<HomeLayoutContract>;

export const homeLayoutUpdateInputObject = z.object({
  expectedRevision: z.number().int().min(0),
  mutationId: z.string().min(1).max(200),
  app: z.array(slot.strict()).max(10).refine((items) => new Set(items.map((item) => item.key)).size === items.length, { message: "a widget appears once" }),
  web: z.array(slot.strict()).max(10).refine((items) => new Set(items.map((item) => item.key)).size === items.length, { message: "a widget appears once" }),
  hintDismissedAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export const homeLayoutUpdateInputSchema = homeLayoutUpdateInputObject as z.ZodType<HomeLayoutUpdateInput>;

/** The layout a person starts with (and the UI's fallback when the endpoint is not implemented yet). */
export const DEFAULT_HOME_LAYOUT: HomeLayoutContract = {
  revision: 0,
  app: [
    { key: "today", size: "m" },
    { key: "planScore", size: "s" },
    { key: "nextEvent", size: "s" },
    { key: "secretary", size: "m" },
    { key: "network", size: "s" },
    { key: "memo", size: "s" },
  ] satisfies HomeWidgetSlot[],
  web: [
    { key: "today", size: "m" },
    { key: "planScore", size: "s" },
    { key: "network", size: "s" },
    { key: "secretary", size: "m" },
    { key: "week", size: "m" },
    { key: "nextEvent", size: "s" },
    { key: "eventPick", size: "s" },
  ] satisfies HomeWidgetSlot[],
};
