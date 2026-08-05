import type { EventCoreService } from "../../../../../../features/events/core/service";

export interface EventOperationsPageEvent {
  readonly endsAt: string;
  readonly id: string;
  readonly startsAt: string;
  readonly title: string;
}

/**
 * Operations pages call this only after their per-event capability guard has
 * passed. The canonical Event Core read is therefore scoped by both the
 * runtime workspace and prior event authority, rather than by ownership of a
 * separate live-record-store item.
 */
export async function loadEventOperationsPageEvent(
  eventId: string,
  eventCore: Pick<EventCoreService, "getEvent"> | null,
): Promise<EventOperationsPageEvent> {
  const event = eventCore ? await eventCore.getEvent(eventId) : null;
  return Object.freeze({
    endsAt: event?.endsAt ?? "",
    id: eventId,
    startsAt: event?.startsAt ?? "",
    title: event?.title?.trim() || eventId,
  });
}
