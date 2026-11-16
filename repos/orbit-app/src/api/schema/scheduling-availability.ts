import { z } from "zod";
import { knownValues, tolerantEnum } from "./tolerant";
import type {
  SchedulingAvailabilityContract,
  SchedulingAvailabilityUpdateInput,
  SchedulingBufferMinutes,
  SchedulingDurationMinutes,
} from "../contract/scheduling-availability";

// contact-reach R40 (DESIGN D4). Responses are read tolerantly (unknown keys dropped,
// unknown enum values fall back to the default); the PUT body is strict and every rule
// is checked here, so an invalid body is a 400 and nothing is written.
// The *Object exports are the uncast schemas for the TS ⇔ zod parity check.

export const SCHEDULING_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const SCHEDULING_DURATIONS = [30, 60, 90] as const;
export const SCHEDULING_MINIMUM_NOTICES = ["15m", "1h", "4h", "1d", "2d"] as const;
export const SCHEDULING_BUFFERS = [0, 15, 30] as const;

/** "HH:mm" on the hour or half hour. */
const HALF_HOUR = /^(?:[01]\d|2[0-3]):(?:00|30)$/;
const ANY_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

function validTimeZone(value: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0); return true; }
  catch { return false; }
}

// ---- response (tolerant) ----

const timestamp = z.string().datetime({ offset: true });
const readTime = z.string().regex(ANY_TIME);
const duration = z.number().transform((value): SchedulingDurationMinutes => ((SCHEDULING_DURATIONS as readonly number[]).includes(value) ? value as SchedulingDurationMinutes : 60));
const buffer = z.number().transform((value): SchedulingBufferMinutes => ((SCHEDULING_BUFFERS as readonly number[]).includes(value) ? value as SchedulingBufferMinutes : 0));

export const schedulingAvailabilityObject = z.object({
  weekdays: knownValues(SCHEDULING_WEEKDAYS),
  start: readTime,
  end: readTime,
  lunch: z.object({ start: readTime, end: readTime }).nullable(),
  durationMinutes: duration,
  minimumNotice: tolerantEnum(SCHEDULING_MINIMUM_NOTICES, "15m"),
  bufferMinutes: buffer,
  timeZoneMode: tolerantEnum(["device", "fixed"], "device"),
  timeZone: z.string().min(1).nullable(),
  updatedAt: timestamp.nullable(),
});
export const schedulingAvailabilitySchema = schedulingAvailabilityObject as z.ZodType<SchedulingAvailabilityContract>;

// ---- request (strict) ----

const writeTime = z.string().regex(HALF_HOUR);

export const schedulingAvailabilityUpdateInputObject = z.object({
  weekdays: z.array(z.enum(SCHEDULING_WEEKDAYS)).min(1).max(7),
  start: writeTime,
  end: writeTime,
  lunch: z.object({ start: writeTime, end: writeTime }).strict().nullable(),
  durationMinutes: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  minimumNotice: z.enum(SCHEDULING_MINIMUM_NOTICES),
  bufferMinutes: z.union([z.literal(0), z.literal(15), z.literal(30)]),
  timeZoneMode: z.enum(["device", "fixed"]),
  timeZone: z.string().min(1).max(64).nullable(),
}).strict();

export const schedulingAvailabilityUpdateInputSchema = schedulingAvailabilityUpdateInputObject.superRefine((input, context) => {
  if (new Set(input.weekdays).size !== input.weekdays.length) context.addIssue({ code: "custom", path: ["weekdays"], message: "a weekday appears once" });
  if (minutes(input.start) >= minutes(input.end)) context.addIssue({ code: "custom", path: ["end"], message: "start must be before end" });
  if (input.lunch) {
    const lunchStart = minutes(input.lunch.start), lunchEnd = minutes(input.lunch.end);
    if (lunchStart >= lunchEnd) context.addIssue({ code: "custom", path: ["lunch", "end"], message: "lunch start must be before lunch end" });
    if (lunchStart < minutes(input.start) || lunchEnd > minutes(input.end)) context.addIssue({ code: "custom", path: ["lunch"], message: "lunch must be inside the day" });
  }
  if (input.timeZoneMode === "fixed" && input.timeZone === null) context.addIssue({ code: "custom", path: ["timeZone"], message: "a fixed time zone is required" });
  if (input.timeZone !== null && !validTimeZone(input.timeZone)) context.addIssue({ code: "custom", path: ["timeZone"], message: "time zone must be a valid IANA zone" });
}).transform((input) => ({
  ...input,
  // Stored in Monday→Sunday order.
  weekdays: SCHEDULING_WEEKDAYS.filter((day) => input.weekdays.includes(day)),
}) as SchedulingAvailabilityUpdateInput) as unknown as z.ZodType<SchedulingAvailabilityUpdateInput>;
