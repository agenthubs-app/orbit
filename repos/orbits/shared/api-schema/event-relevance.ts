import { z } from "zod";

import { readableItems, tolerantEnum } from "./tolerant";

// 2026-11-15 去分数：「跟你有关」。读宽松：看不懂的整块当没有（null），看不懂的单项跳过。
export const eventRelevanceObject = z.object({
  group: tolerantEnum(["people", "topic", "other"], "other"),
  people: readableItems(z.object({ typeKey: z.string().min(1), label: z.string().max(120), emoji: z.string().max(16), count: z.number().int().min(0), source: z.enum(["registrants", "speakers", "exhibitors"]) })).catch([]),
  known: z.object({ count: z.number().int().min(1), names: z.array(z.string().max(120)).max(10) }).nullable().catch(null),
  topic: z.object({ labels: z.array(z.string().max(120)).max(5) }).nullable().catch(null),
  warnings: readableItems(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("budget"), feeYen: z.number().int().min(0), limitYen: z.number().int().min(0) }),
    z.object({ kind: z.literal("travel"), minutes: z.number().int().min(0), limitMinutes: z.number().int().min(0) }),
  ])).catch([]),
});

export const optionalRelevance = eventRelevanceObject.nullable().optional().catch(null);
