export const EVENT_LIFECYCLE_STATES = [
  "draft",
  "published",
  "cancelled",
  "archived",
] as const;

export type EventLifecycleState = (typeof EVENT_LIFECYCLE_STATES)[number];
export type EventTemporalPhase = "upcoming" | "live" | "ended";
export type EventAliasType = "event_id" | "public_code" | "legacy_route_id";

/**
 * Canonical persisted head. Drafts deliberately permit incomplete metadata;
 * publication completeness belongs to the published read boundary.
 */
export interface CanonicalEventRecord {
  archivedAt: string | null;
  cancelledAt: string | null;
  description: string | null;
  endsAt: string | null;
  eventId: string;
  eventVersion: number;
  lifecycleState: EventLifecycleState;
  organizerActorId: string;
  publicCode: string | null;
  sourcePayload: Readonly<Record<string, unknown>>;
  startsAt: string | null;
  timezone: string | null;
  title: string | null;
  venue: string | null;
  workspaceId: string;
}

export interface CanonicalEvent extends CanonicalEventRecord {
  phase: EventTemporalPhase | null;
}

export interface PublishedCanonicalEvent extends CanonicalEvent {
  endsAt: string;
  lifecycleState: "published";
  phase: EventTemporalPhase;
  startsAt: string;
  timezone: string;
  title: string;
}

export interface EventAliasResolution {
  eventId: string;
  matchedBy: EventAliasType;
  requestedAlias: string;
}

export class EventCoreDataError extends Error {
  constructor(
    readonly code:
      | "EVENT_CORE_ALIAS_COLLISION"
      | "EVENT_CORE_BACKFILL_CONFLICT"
      | "EVENT_CORE_INVALID_PUBLISHED_EVENT"
      | "EVENT_CORE_INVALID_TIME_RANGE"
      | "EVENT_CORE_ROW_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "EventCoreDataError";
  }
}
