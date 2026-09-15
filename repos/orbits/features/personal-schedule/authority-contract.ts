import { z } from "zod";

const text = z.string().trim().min(1);
const instant = z.string().datetime({ offset: true });

export const canonicalScheduleItemSchema = z.object({
  accountId: text,
  allDay: z.boolean().optional(),
  category: z.enum(["relationship", "meeting", "event", "work", "personal", "other"]),
  contactId: text.optional(),
  createdAt: instant,
  details: text.max(4_000).optional(),
  endsAt: instant.optional(),
  eventId: text.optional(),
  evidenceIds: z.array(text).max(50).default([]),
  id: text,
  kind: z.enum(["meeting", "event", "personal"]),
  location: text.max(500).optional(),
  meetingId: text.optional(),
  meetingMethod: z.enum(["in_person", "phone", "video", "unspecified"]).optional(),
  ownerUserId: text,
  sourceId: text,
  startsAt: instant,
  state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]),
  timeZone: text.max(100).optional(),
  title: text.max(300),
  updatedAt: instant,
}).strict().superRefine((item, context) => {
  if (item.endsAt && Date.parse(item.endsAt) <= Date.parse(item.startsAt)) {
    context.addIssue({ code: "custom", message: "endsAt must be after startsAt", path: ["endsAt"] });
  }
  if (item.kind === "event" && !item.eventId) {
    context.addIssue({ code: "custom", message: "eventId is required for event schedule items", path: ["eventId"] });
  }
  if (item.kind === "meeting" && !item.meetingId) {
    context.addIssue({ code: "custom", message: "meetingId is required for meeting schedule items", path: ["meetingId"] });
  }
});

export type CanonicalScheduleItem = z.infer<typeof canonicalScheduleItemSchema>;
