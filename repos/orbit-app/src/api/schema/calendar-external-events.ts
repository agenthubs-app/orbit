import { z } from "zod";
import type { CalendarExternalEventsContract } from "../contract/calendar-external-events";
import { readableItems, tolerantEnum } from "./tolerant";

const instant = z.string().datetime({ offset: true });
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const eventTime = z.union([instant, calendarDate]);

export const calendarExternalEventsQueryObject = z.object({ from: instant, to: instant }).strict()
  .refine(value => Date.parse(value.from) < Date.parse(value.to) && Date.parse(value.to) - Date.parse(value.from) <= 42 * 86_400_000,
    "Calendar interval must be positive and at most 42 days");
export const calendarExternalEventsQuerySchema = calendarExternalEventsQueryObject;

export const calendarExternalEventObject = z.object({
  id: z.string().min(1), titlePreview: z.string(), startsAt: eventTime, endsAt: eventTime.optional(),
  allDay: z.boolean(), locationPreview: z.string().optional(),
});
export const calendarExternalEventsResponseObject = z.object({
  connection: tolerantEnum(["connected", "not_connected", "needs_reconnect", "unavailable", "off"], "unavailable"),
  provider: z.literal("google_calendar"), events: readableItems(calendarExternalEventObject), asOf: instant,
});
export const calendarExternalEventsResponseSchema = calendarExternalEventsResponseObject as z.ZodType<CalendarExternalEventsContract>;
