import { z } from "zod";
import type { HomeLayoutContract, HomeLayoutUpdateInput, HomeWidgetSlot } from "../contract/home-layout";

// R08 contract 1 (owner 乙 / R10). Each widget at most once per surface.
const key = z.enum(["today", "planScore", "nextEvent", "network", "secretary", "pending", "week", "eventPick", "memo", "deadline"]);
const slot = z.object({ key, size: z.enum(["s", "m"]) }).strict();
const slots = z.array(slot).max(10).refine((items) => new Set(items.map((item) => item.key)).size === items.length, { message: "a widget appears once" });

export const homeLayoutSchema = z.object({
  revision: z.number().int().min(0),
  app: slots,
  web: slots,
  hintDismissedAt: z.string().datetime({ offset: true }).optional(),
}).strict() as z.ZodType<HomeLayoutContract>;

export const homeLayoutUpdateInputSchema = z.object({
  expectedRevision: z.number().int().min(0),
  mutationId: z.string().min(1).max(200),
  app: slots,
  web: slots,
  hintDismissedAt: z.string().datetime({ offset: true }).optional(),
}).strict() as z.ZodType<HomeLayoutUpdateInput>;

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
