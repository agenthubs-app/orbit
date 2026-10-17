import { z } from "zod";
import type { ScheduleItemContract } from "../../../../../shared/contract/tasks";
import type { CalendarExternalEventContract, CalendarExternalEventsContract } from "../../../../../shared/contract/calendar-external-events";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { calendarExternalEventsQuerySchema, calendarExternalEventsResponseSchema } from "../../../../../shared/api-schema/calendar-external-events";
import { calendarDate } from "../../../../../features/tasks/local-date-time";

const instant = z.string().datetime({ offset: true }).refine(value => calendarDate(value.slice(0, 10)) !== null && Number.isFinite(Date.parse(value)));
const itemSchema = z.object({ id: z.string().min(1), sourceId: z.string().min(1), title: z.string(), kind: z.enum(["personal", "meeting", "event"]), category: z.enum(["relationship", "meeting", "event", "work", "personal", "other"]), state: z.enum(["upcoming", "ongoing", "ended", "cancelled"]), startsAt: instant, endsAt: instant.optional(), allDay: z.boolean().optional(), timeZone: z.string().optional(), location: z.string().optional() })
  .refine(item => item.endsAt === undefined || Date.parse(item.endsAt) > Date.parse(item.startsAt));
export interface CalendarInternalRead { items: ScheduleItemContract[]; skipped: number }
export interface CalendarExternalRead extends CalendarExternalEventsContract { skipped: number }
export class CalendarReadError extends Error {
  constructor(readonly code: "denied" | "failed") { super(code === "denied" ? "CALENDAR_UNAUTHORIZED" : "CALENDAR_RESPONSE_INVALID"); }
}

function validExternal(event: CalendarExternalEventContract) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/u.test(event.startsAt);
  if (dateOnly) return event.allDay && calendarDate(event.startsAt) !== null && (event.endsAt === undefined || calendarDate(event.endsAt) !== null && event.endsAt > event.startsAt);
  return instant.safeParse(event.startsAt).success && (event.endsAt === undefined || instant.safeParse(event.endsAt).success && Date.parse(event.endsAt) > Date.parse(event.startsAt));
}

export function createCalendarReadClient(options: { fetch?: typeof fetch } = {}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  async function request(path: string, signal?: AbortSignal) {
    const response = await fetcher(path, { cache: "no-store", signal, headers: { accept: "application/json" } });
    if (response.status === 401 || response.status === 403) throw new CalendarReadError("denied");
    const text = await response.text();
    if (!response.ok || text.length > 1_048_576) throw new CalendarReadError("failed");
    const envelope = JSON.parse(text);
    if (envelope?.success !== true) throw new CalendarReadError("failed");
    return envelope.data;
  }
  return {
    async internal(window: { from: string; to: string }, language: OrbitLanguage, signal?: AbortSignal): Promise<CalendarInternalRead> {
      const data = await request(`/api/schedule-items?${new URLSearchParams({ scope: "calendar", from: window.from, to: window.to, language })}`, signal);
      const rows = z.array(z.unknown()).max(1000).parse(data?.scheduleItems);
      let skipped = 0;
      const keys = new Set<string>();
      const items = rows.flatMap(row => {
        const checked = itemSchema.safeParse(row);
        if (!checked.success) { skipped++; return []; }
        const item = checked.data as ScheduleItemContract;
        const key = `${item.kind}:${item.id}`;
        if (keys.has(key)) throw new CalendarReadError("failed");
        keys.add(key); return [item];
      });
      return { items, skipped };
    },
    async external(ranges: readonly { from: string; to: string }[], signal?: AbortSignal): Promise<CalendarExternalRead> {
      if (ranges.length < 1 || ranges.length > 2 || ranges.some(range => !calendarExternalEventsQuerySchema.safeParse(range).success)) throw new CalendarReadError("failed");
      const chunks = await Promise.all(ranges.map(async range => {
        const raw = await request(`/api/calendar/external-events?${new URLSearchParams(range)}`, signal);
        if (!Array.isArray(raw?.events) || raw.events.length > 1000) throw new CalendarReadError("failed");
        const parsed = calendarExternalEventsResponseSchema.parse(raw);
        const events = parsed.events.filter(validExternal);
        return { ...parsed, events, skipped: raw.events.length - events.length };
      }));
      const unavailable = chunks.find(chunk => chunk.connection !== "connected");
      if (unavailable) return { ...unavailable, events: [] };
      const events = new Map<string, CalendarExternalEventContract>();
      for (const chunk of chunks) for (const event of chunk.events) {
        const prior = events.get(event.id);
        if (prior && JSON.stringify(prior) !== JSON.stringify(event)) throw new CalendarReadError("failed");
        events.set(event.id, event);
      }
      if (events.size > 1000) throw new CalendarReadError("failed");
      return { provider: "google_calendar", connection: "connected", events: [...events.values()], asOf: chunks.reduce((oldest, chunk) => Date.parse(chunk.asOf) < Date.parse(oldest) ? chunk.asOf : oldest, chunks[0]!.asOf), skipped: chunks.reduce((sum, chunk) => sum + chunk.skipped, 0) };
    },
  };
}
