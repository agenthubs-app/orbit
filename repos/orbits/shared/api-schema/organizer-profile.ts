import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { OrganizerProfile, OrganizerProfileInput, OrganizerProfileListResponse, OrganizerPublicResponse } from "../contract/organizer-profile";

// R17 主办方资料. An unknown visibility reads as `link_only` (never widens who can see it).
const count = z.number().int().min(0);

export const organizerProfileObject = z.object({
  profileId: z.string().min(1),
  slug: z.string().min(1),
  displayName: z.string(),
  emoji: z.string().nullable(),
  bio: z.string().nullable(),
  visibility: tolerantEnum(["public", "link_only"], "link_only"),
  eventCount: count,
  updatedAt: z.string(),
  sample: z.literal(true).optional(),
});
export const organizerProfileSchema = organizerProfileObject as unknown as z.ZodType<OrganizerProfile>;

export const organizerProfileListResponseObject = z.object({ profiles: readableItems(organizerProfileObject), sample: z.literal(true).optional() });
export const organizerProfileListResponseSchema = organizerProfileListResponseObject as unknown as z.ZodType<OrganizerProfileListResponse>;

export const organizerProfileInputObject = z.object({
  displayName: z.string().trim().min(1).max(60),
  emoji: z.string().trim().min(1).max(8).nullable().optional(),
  bio: z.string().trim().max(400).nullable().optional(),
  visibility: z.enum(["public", "link_only"]).optional(),
  slug: z.string().trim().min(3).max(48).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u).nullable().optional(),
}).strict();
export const organizerProfileInputSchema = organizerProfileInputObject as z.ZodType<OrganizerProfileInput>;

export const organizerPublicResponseObject = z.object({
  profile: organizerProfileObject,
  organizerKey: z.string().min(1),
  stats: z.object({ eventsHeld: count, attendeesTotal: count, followers: count }),
  following: z.boolean().nullable(),
  upcoming: readableItems(z.object({
    eventId: z.string().min(1),
    title: z.string(),
    emoji: z.string().nullable(),
    startsAt: z.string(),
    venue: z.string().nullable(),
    feeKind: tolerantEnum(["free", "amount", "pay_at_door", "external_link"], "free"),
    feeAmountYen: count.nullable(),
    remainingSeats: count.nullable(),
    registrationOpen: z.boolean(),
    href: z.string(),
  })),
  past: readableItems(z.object({ eventId: z.string().min(1), title: z.string(), emoji: z.string().nullable(), startsAt: z.string(), attended: count })),
  pastTotal: count,
  sample: z.literal(true).optional(),
});
export const organizerPublicResponseSchema = organizerPublicResponseObject as unknown as z.ZodType<OrganizerPublicResponse>;
