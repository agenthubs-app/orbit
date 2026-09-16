import { z } from "zod";

const text = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });
const zone = text.max(100).refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; } catch { return false; } }, "Invalid time zone");
const meetingUrl = text.max(2_000).refine(value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; } }, "Invalid meeting URL");
const ids = z.array(text.max(300)).max(50).refine(value => new Set(value).size === value.length, "Duplicate association ID");
const metadata = { allDay: z.boolean().optional(), timeZone: zone.optional(), meetingMethod: z.enum(["video", "in_person", "phone", "unspecified"]).optional(), meetingUrl: meetingUrl.optional(), contactIds: ids.optional(), noteIds: ids.optional() };
export const personalScheduleSchema = z.object({
  id: text, sourceId: text, accountId: text, ownerUserId: text,
  kind: z.literal("personal"), category: z.literal("personal"),
  state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]),
  title: text.max(300), startsAt: instant, endsAt: instant.optional(), location: text.max(500).optional(),
  createdAt: instant, updatedAt: instant,
  ...metadata,
}).strict();
export const personalScheduleCreateSchema = z.object({
  title: text.max(300), startsAt: instant, endsAt: instant.optional(), location: text.max(500).optional(), idempotencyKey: text.max(200),
  ...metadata,
}).strict();
export const personalScheduleUpdateSchema = z.object({
  expectedUpdatedAt: instant, idempotencyKey: text.max(200),
  patch: z.object({ title: text.max(300).optional(), startsAt: instant.optional(), endsAt: instant.nullable().optional(), location: text.max(500).nullable().optional(), ...metadata, allDay: z.boolean().nullable().optional(), timeZone: zone.nullable().optional(), meetingMethod: metadata.meetingMethod.nullable(), meetingUrl: meetingUrl.nullable().optional(), contactIds: ids.nullable().optional(), noteIds: ids.nullable().optional() }).strict().refine(value => Object.keys(value).length > 0),
}).strict();
export const personalScheduleDeleteSchema = z.object({ expectedUpdatedAt: instant, idempotencyKey: text.max(200) }).strict();
export type PersonalScheduleCreate = z.infer<typeof personalScheduleCreateSchema>;
export type PersonalScheduleUpdate = z.infer<typeof personalScheduleUpdateSchema>;
export type PersonalScheduleDelete = z.infer<typeof personalScheduleDeleteSchema>;
