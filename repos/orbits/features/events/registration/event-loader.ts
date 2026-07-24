import {
  mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
} from "../event-crud-and-import/fixtures";
import type { EventRecord } from "../event-crud-and-import/contract";
import { createEventCrudAndImportService } from "../service-factory";

const knownRegistrationEvents: readonly EventRecord[] = [
  ...mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
];

export async function loadEventForRegistration(
  eventId: string,
): Promise<EventRecord | null> {
  const normalizedEventId = eventId.trim();
  const knownEvent = knownRegistrationEvents.find(
    (event) => event.id === normalizedEventId,
  );

  if (knownEvent) {
    return knownEvent;
  }

  try {
    const result = await createEventCrudAndImportService().getEvent({
      eventId: normalizedEventId,
    });

    return result.success ? result.data.event : null;
  } catch {
    return null;
  }
}

