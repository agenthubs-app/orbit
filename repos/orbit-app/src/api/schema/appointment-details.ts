import { z } from "zod";

const text = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });
const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"));
const medium = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("in_person"), location: text.max(500) }),
  z.object({ kind: z.literal("video"), provider: z.enum(["google_meet", "other"]), joinUrl: httpsUrl.nullable() }),
  z.object({ kind: z.literal("phone"), phoneHint: z.string().max(128).nullable() }),
]);
const role = z.enum(["you", "other"]);

export const meetingDetailsSchema = z.object({
  appointmentId: text.max(256),
  confirmed: z.object({
    durationMinutes: z.number().int().min(15).max(480),
    medium,
    startsAtUtc: instant,
    timezone: text.max(128),
  }).nullable(),
  contactId: text.max(256).nullable(),
  details: z.string().max(5_000),
  detailsUpdatedAt: instant.nullable(),
  detailsUpdatedBy: role.nullable(),
  eventId: text.max(256).nullable(),
  proposals: z.array(z.object({
    createdAt: instant,
    durationMinutes: z.number().int().min(15).max(480),
    medium,
    note: z.string().max(2_000),
    proposedBy: role,
    revision: z.number().int().positive(),
    timezone: text.max(128),
  })),
  status: z.enum(["draft", "awaiting_response", "negotiating", "confirmed", "reschedule_pending", "cancelled", "completed"]),
  updatedAt: instant,
  version: z.number().int().positive(),
});

export const meetingDetailsMutationSchema = meetingDetailsSchema.extend({
  replayed: z.boolean(),
});
