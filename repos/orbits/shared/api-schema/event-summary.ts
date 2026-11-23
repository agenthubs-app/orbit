import { z } from "zod";

import type { EventSummaryResponse } from "../contract/event-summary";
import { readableItems, tolerantEnum } from "./tolerant";

// 2026-11-23 探す 简介栏（宽进：未知报名状态 → none，读不了的首字跳过）。
const STATUSES = ["none", "registered", "pending_review", "waitlisted", "rejected", "cancelled", "attended"] as const;

export const eventSummaryResponseObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  emoji: z.string().max(16),
  coverUrl: z.string().min(1).nullable().optional().catch(null),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  priceYen: z.number().int().min(0).nullable().optional().catch(null),
  description: z.string().nullable(),
  capacity: z.number().int().min(0).nullable().catch(null),
  remaining: z.number().int().min(0).nullable().catch(null),
  registrationClosesAt: z.string().nullable(),
  waitlistEnabled: z.boolean().catch(false),
  registrationCount: z.number().int().min(0).catch(0),
  status: tolerantEnum(STATUSES, "none"),
  ended: z.boolean(),
  organizer: z.object({ organizerId: z.string().nullable(), name: z.string(), unnamed: z.boolean().optional(), following: z.boolean() }),
  attendeeInitials: readableItems(z.string().min(1).max(4)),
  met: z.object({ count: z.number().int().min(0), notInContacts: z.number().int().min(0), initials: readableItems(z.string().min(1).max(4)), hasRecord: z.boolean() }).nullable().optional().catch(null),
  next: z.object({ eventId: z.string().min(1), title: z.string(), startsAt: z.string(), venue: z.string().nullable(), coverUrl: z.string().min(1).nullable(), emoji: z.string().max(16) }).nullable().optional().catch(null),
});
export const eventSummaryResponseSchema = eventSummaryResponseObject as unknown as z.ZodType<EventSummaryResponse>;
