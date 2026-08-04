import {
  EVENT_LIFECYCLE_STATES,
  EventCoreDataError,
  type CanonicalEvent,
  type CanonicalEventRecord,
  type EventLifecycleState,
  type EventTemporalPhase,
  type PublishedCanonicalEvent,
} from "./contract";
import { resolveCanonicalEventAlias } from "./alias-resolver";
import type { EventCoreRepository } from "./repository";

function requiredText(
  value: string | null,
  field: string,
  eventId: string,
): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new EventCoreDataError(
      "EVENT_CORE_INVALID_PUBLISHED_EVENT",
      `Published event ${eventId} is missing ${field}.`,
    );
  }
  return normalized;
}

function lifecycleState(value: string, eventId: string): EventLifecycleState {
  if (EVENT_LIFECYCLE_STATES.includes(value as EventLifecycleState)) {
    return value as EventLifecycleState;
  }
  throw new EventCoreDataError(
    "EVENT_CORE_ROW_INVALID",
    `Event ${eventId} has unsupported lifecycle state ${value}.`,
  );
}

export function deriveEventTemporalPhase(
  startsAt: string,
  endsAt: string,
  now = new Date(),
): EventTemporalPhase {
  const startsAtMs = Date.parse(startsAt);
  const endsAtMs = Date.parse(endsAt);
  const nowMs = now.getTime();

  if (
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(endsAtMs) ||
    startsAtMs >= endsAtMs
  ) {
    throw new EventCoreDataError(
      "EVENT_CORE_INVALID_TIME_RANGE",
      `Invalid canonical event time range ${startsAt}..${endsAt}.`,
    );
  }
  if (nowMs < startsAtMs) return "upcoming";
  if (nowMs >= endsAtMs) return "ended";
  return "live";
}

function optionalTemporalPhase(
  record: CanonicalEventRecord,
  now: Date,
): EventTemporalPhase | null {
  if (!record.startsAt || !record.endsAt) return null;
  return deriveEventTemporalPhase(record.startsAt, record.endsAt, now);
}

function eventWithPhase(
  record: CanonicalEventRecord,
  now: Date,
): CanonicalEvent {
  const state = lifecycleState(record.lifecycleState, record.eventId);

  return {
    ...record,
    lifecycleState: state,
    phase: optionalTemporalPhase(record, now),
  };
}

function publishedEvent(
  event: CanonicalEvent,
  now: Date,
): PublishedCanonicalEvent {
  const title = requiredText(event.title, "title", event.eventId);
  const timezone = requiredText(event.timezone, "timezone", event.eventId);
  const startsAt = requiredText(event.startsAt, "startsAt", event.eventId);
  const endsAt = requiredText(event.endsAt, "endsAt", event.eventId);

  return {
    ...event,
    endsAt,
    lifecycleState: "published",
    phase: deriveEventTemporalPhase(startsAt, endsAt, now),
    startsAt,
    timezone,
    title,
  };
}

export interface EventCoreService {
  getEvent(routeId: string, now?: Date): Promise<CanonicalEvent | null>;
  getPublishedEvent(
    routeId: string,
    now?: Date,
  ): Promise<PublishedCanonicalEvent | null>;
  listEvents(now?: Date): Promise<readonly CanonicalEvent[]>;
  listPublishedEvents(now?: Date): Promise<readonly PublishedCanonicalEvent[]>;
}

export function createEventCoreService(
  repository: EventCoreRepository,
): EventCoreService {
  return {
    async getEvent(routeId, now = new Date()) {
      const resolution = await resolveCanonicalEventAlias(repository, routeId);
      if (!resolution) return null;
      const record = await repository.getEvent(resolution.eventId);
      return record ? eventWithPhase(record, now) : null;
    },
    async getPublishedEvent(routeId, now = new Date()) {
      const event = await this.getEvent(routeId, now);
      return event?.lifecycleState === "published"
        ? publishedEvent(event, now)
        : null;
    },
    async listEvents(now = new Date()) {
      const records = await repository.listEvents();
      return records.map((record) => eventWithPhase(record, now));
    },
    async listPublishedEvents(now = new Date()) {
      const events = await this.listEvents(now);
      return events
        .filter((event) => event.lifecycleState === "published")
        .map((event) => publishedEvent(event, now));
    },
  };
}
