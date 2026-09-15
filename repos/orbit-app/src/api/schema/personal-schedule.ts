import { z } from "zod";

const text = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });
export const personalScheduleSchema = z.object({
  id: text, sourceId: text, accountId: text, ownerUserId: text,
  kind: z.literal("personal"), category: z.literal("personal"),
  state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]),
  title: text.max(300), startsAt: instant, endsAt: instant.optional(), location: text.max(500).optional(),
  createdAt: instant, updatedAt: instant,
}).strict();
export const personalScheduleCreateSchema = z.object({
  title: text.max(300), startsAt: instant, endsAt: instant.optional(), location: text.max(500).optional(), idempotencyKey: text.max(200),
}).strict();
export const personalScheduleUpdateSchema = z.object({
  expectedUpdatedAt: instant, idempotencyKey: text.max(200),
  patch: z.object({ title: text.max(300).optional(), startsAt: instant.optional(), endsAt: instant.nullable().optional(), location: text.max(500).nullable().optional() }).strict().refine(value => Object.keys(value).length > 0),
}).strict();
export const personalScheduleDeleteSchema = z.object({ expectedUpdatedAt: instant, idempotencyKey: text.max(200) }).strict();
export type PersonalScheduleCreate = z.infer<typeof personalScheduleCreateSchema>;
export type PersonalScheduleUpdate = z.infer<typeof personalScheduleUpdateSchema>;
export type PersonalScheduleDelete = z.infer<typeof personalScheduleDeleteSchema>;
