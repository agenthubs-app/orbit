import { z } from "zod";
import type { EventCodeResolveResponse } from "../contract/event-code";

// R27 参加コード lookup (`GET /api/events/by-code/[code]`).
export const eventCodeResolveResponseObject = z.object({
  code: z.string(),
  eventId: z.string().min(1).nullable(),
  sample: z.literal(true).optional(),
});
export const eventCodeResolveResponseSchema = eventCodeResolveResponseObject as unknown as z.ZodType<EventCodeResolveResponse>;
