import type { CalendarExternalEventContract, CalendarExternalEventsContract } from "../../api/contract/calendar-external-events";
import { calendarExternalEventsResponseSchema } from "../../api/schema/calendar-external-events";

export type CalendarExternalView = { connection: CalendarExternalEventsContract["connection"]; events: CalendarExternalEventContract[] };

/** A split read is complete only when every bounded range has a valid response. */
export function readCalendarExternalChunks(chunks: readonly unknown[]): CalendarExternalView {
  if (!chunks.length) return { connection: "unavailable", events: [] };
  const parsed = chunks.map(chunk => calendarExternalEventsResponseSchema.safeParse(chunk));
  if (parsed.some(result => !result.success)) return { connection: "unavailable", events: [] };
  const values = parsed.flatMap(result => result.success ? [result.data] : []);
  const unavailable = values.find(value => value.connection !== "connected");
  if (unavailable) return { connection: unavailable.connection, events: [] };
  const byId = new Map<string, CalendarExternalEventContract>();
  for (const chunk of values) for (const event of chunk.events) {
    const previous = byId.get(event.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(event)) return { connection: "unavailable", events: [] };
    byId.set(event.id, event);
  }
  return { connection: "connected", events: [...byId.values()] };
}
