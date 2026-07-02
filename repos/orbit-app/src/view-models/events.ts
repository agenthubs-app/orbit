export interface EventSummary {
  id: string;
  location: string;
  startsAt: string;
  status: string;
  title: string;
}

export interface EventDetailSummary extends EventSummary {
  description: string;
  nextAction: string;
  preparation: string;
  relationshipContext: string;
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

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value || "Time pending";
  }

  const parts = new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric"
  }).formatToParts(new Date(timestamp));
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${partValue("month")} ${partValue("day")}, ${partValue("year")}, ${partValue("hour")}:${partValue("minute")}`;
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
      startsAt: formatDateTime(stringField(event, "startsAt", "Time pending")),
      status: stringField(event, "status", "scheduled"),
      title: stringField(event, "title", stringField(event, "name", "Event"))
    }));
}

function eventRecordFromPayload(data: unknown): Record<string, unknown> | null {
  if (isRecord(data) && isRecord(data.event)) {
    return data.event;
  }

  return isRecord(data) ? data : null;
}

export function eventDetailToSummary(data: unknown): EventDetailSummary {
  const event = eventRecordFromPayload(data);

  if (!event) {
    return {
      description: "",
      id: "event",
      location: "",
      nextAction: "Review this event in Orbit AI.",
      preparation: "Preparation details are not available yet.",
      relationshipContext: "Relationship context is not available yet.",
      startsAt: "Time pending",
      status: "scheduled",
      title: "Event"
    };
  }

  return {
    description: stringField(event, "description"),
    id: stringField(event, "id", "event"),
    location:
      stringField(event, "venue") ||
      stringField(event, "location") ||
      stringField(event, "locationLabel"),
    nextAction: stringField(
      event,
      "nextAction",
      "Review this event in Orbit AI."
    ),
    preparation: stringField(
      event,
      "recommendedPreparation",
      "Preparation details are not available yet."
    ),
    relationshipContext: stringField(
      event,
      "relationshipContext",
      "Relationship context is not available yet."
    ),
    startsAt: formatDateTime(stringField(event, "startsAt", "Time pending")),
    status: stringField(event, "status", "scheduled"),
    title: stringField(event, "title", stringField(event, "name", "Event"))
  };
}
