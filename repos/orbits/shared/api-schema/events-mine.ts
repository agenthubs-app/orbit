import { z } from "zod";
import { readableItems, tolerantEnum } from "./tolerant";
import type { MyEventsResponse } from "../contract/events-mine";

// R26 events-mine. Responses tolerant (unknown status skips the row: it decides what the row is), query strict.
const STATUSES = ["registered", "pending_review", "waitlisted", "planned", "attended", "rejected", "cancelled"] as const;

export const myEventItemObject = z.object({
  eventId: z.string().min(1),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  emoji: z.string().max(16),
  coverUrl: z.string().min(1).nullable().optional().catch(null),
  status: z.enum(STATUSES),
  meetCount: z.number().int().min(0).nullable().optional().catch(null),
  meetInitials: z.array(z.string().max(4)).max(4).optional().catch(undefined),
  assessmentId: z.string().min(1).nullable().optional(),
  score: z.number().int().min(0).max(100).nullable().optional().catch(null),
  href: z.string().min(1),
  sample: z.literal(true).optional(),
  // agent-design AG13（只加，可选；读不懂就当没有，不跳行）：自己记的「我去过」、私人活动、私人活动关联的记录。
  selfAttendance: z.object({ attendedOn: z.string(), dayParts: z.array(z.string()).max(5).optional(), selfNote: z.string().nullable().optional() }).nullable().optional().catch(undefined),
  privateEvent: z.literal(true).optional().catch(undefined),
  // AG20a（只加，可选）：全天的私人活动。
  allDay: z.boolean().optional().catch(undefined),
  related: z.array(z.object({ id: z.string().min(1), kind: z.enum(["memo", "todo", "schedule"]), label: z.string() })).max(20).optional().catch(undefined),
});

export const myEventsResponseObject = z.object({
  range: tolerantEnum(["upcoming", "past"], "upcoming"),
  items: readableItems(myEventItemObject),
  upcomingCount: z.number().int().min(0),
  // R26 App 像素返工（只加）：服务端时钟；读不懂按缺省（客户端退回本机时间）。
  asOf: z.string().optional().catch(undefined),
});
export const myEventsResponseSchema = myEventsResponseObject as unknown as z.ZodType<MyEventsResponse>;

export const myEventsQueryObject = z.object({
  range: z.enum(["upcoming", "past"]).default("upcoming"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();
