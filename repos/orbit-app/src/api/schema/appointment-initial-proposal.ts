import { z } from "zod";
import { meetingDetailsSchema } from "./appointment-details";

const identifier = z.string().min(1).max(256).refine(value => value.trim() === value && value !== "." && value !== ".." && !/[\u0000-\u001f\u007f]/u.test(value));
const medium = meetingDetailsSchema.shape.confirmed.unwrap().shape.medium;
export const meetingInitialProposalRequestSchema = z.object({
  contactId: identifier,
  proposal: z.object({
    candidateTimes: z.array(z.object({ startsAtUtc: z.string().datetime().regex(/Z$/) }).strict()).min(3).max(5),
    durationMinutes: z.number().int().min(15).max(480),
    medium: z.discriminatedUnion("kind", [medium.options[0].strict(), medium.options[1].strict(), medium.options[2].strict()]),
    note: z.string().max(2_000),
    timezone: z.string().trim().min(1).max(128),
  }).strict(),
}).strict();

export const meetingInitialProposalAvailabilityQuerySchema = z.object({ contactId: identifier }).strict();
export const meetingInitialProposalAvailabilitySchema = z.object({ contactId: identifier, available: z.boolean() }).strict();
