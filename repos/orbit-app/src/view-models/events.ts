export interface EventSummary {
  id: string;
  location: string;
  startsAt: string;
  status: string;
  title: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  fieldName: string,
  fallback = ""
): string {
  const value = record[fieldName];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function listFromPayload(value: unknown, fieldName: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const field = value[fieldName];
  return Array.isArray(field) ? field : [];
}

export function eventsToSummaries(data: unknown): EventSummary[] {
  return listFromPayload(data, "events")
    .filter(isRecord)
    .map((event) => ({
      id: stringField(event, "id", "event"),
      location:
        stringField(event, "venue") ||
        stringField(event, "location") ||
        stringField(event, "locationLabel"),
      startsAt: stringField(event, "startsAt", "Time pending"),
      status: stringField(event, "status", "scheduled"),
      title: stringField(event, "title", stringField(event, "name", "Event"))
    }));
}
