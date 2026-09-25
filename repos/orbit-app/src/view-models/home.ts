import { eventsToSummaries, type EventSummary } from "./events";

export type HomeEventFilter = "active" | "all" | "ended" | "upcoming";
export type HomeEventState = Exclude<HomeEventFilter, "all">;

export interface HomeEventView extends EventSummary {
  detailLine: string;
  state: HomeEventState;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: UnknownRecord, fieldName: string): string {
  const value = record[fieldName];
  return typeof value === "string" ? value.trim() : "";
}

function listFromPayload(data: unknown): UnknownRecord[] {
  if (Array.isArray(data)) {
    return data.filter(isRecord);
  }

  if (!isRecord(data)) {
    return [];
  }

  const events = data.events;
  return Array.isArray(events) ? events.filter(isRecord) : [];
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventState(
  status: string,
  timing: {
    endsAt: string;
    now: number;
    startsAt: string;
  }
): HomeEventState {
  if (/已结束|已取消|ended|cancelled|canceled|past/iu.test(status)) {
    return "ended";
  }

  const startsAt = timestamp(timing.startsAt);
  const endsAt = timestamp(timing.endsAt);

  if (endsAt !== null && endsAt < timing.now) {
    return "ended";
  }

  if (
    startsAt !== null &&
    endsAt !== null &&
    startsAt <= timing.now &&
    timing.now <= endsAt
  ) {
    return "active";
  }

  if (startsAt !== null && endsAt === null && startsAt < timing.now) {
    return "ended";
  }

  if (/进行中|active|live/iu.test(status)) {
    return "active";
  }

  return "upcoming";
}

function detailLine(event: EventSummary): string {
  return [event.startsAt, event.location].filter(Boolean).join(" · ");
}

function homeEvents(
  events: EventSummary[],
  rawEvents: UnknownRecord[],
  now: number
): HomeEventView[] {
  return events.map((event, index) => ({
    ...event,
    detailLine: detailLine(event),
    state: eventState(event.status, {
      endsAt: stringField(rawEvents[index] ?? {}, "endsAt"),
      now,
      startsAt: stringField(rawEvents[index] ?? {}, "startsAt")
    })
  }));
}

export function homeEventsToView({ events, now = new Date() }: {
  events: unknown;
  now?: Date;
}): HomeEventView[] {
  return homeEvents(
    eventsToSummaries(events),
    listFromPayload(events),
    now.getTime()
  );
}
