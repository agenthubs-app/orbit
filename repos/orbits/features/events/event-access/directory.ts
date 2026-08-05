import {
  isEventAccessRole,
  type EventAccessPrincipalRole,
  type EventAccessRole,
} from "./contract";

export const EVENT_ACCESS_DIRECTORY_QUERY_INVALID =
  "EVENT_ACCESS_DIRECTORY_QUERY_INVALID" as const;

export class EventAccessDirectoryQueryError extends Error {
  constructor(readonly code = EVENT_ACCESS_DIRECTORY_QUERY_INVALID) {
    super("Event access directory query is invalid.");
    this.name = "EventAccessDirectoryQueryError";
  }
}

export type EventAccessDirectoryLifecycleState =
  | "draft"
  | "published"
  | "cancelled"
  | "archived"
  | "legacy_active"
  | "legacy_archived";

/**
 * A queue item sourced from Event Core ownership or one active, event-scoped
 * assignment. A legacy item is migration notice only; it cannot be opened or
 * used as authority. This boundary deliberately contains no workspace-level
 * role or fallback authority.
 */
export interface EventAccessDirectoryEvent {
  /**
   * Legacy rows may establish that an actor needs migration attention, but
   * they cannot unlock an operations surface. Only Event Core v2 records are
   * ready for display and authorization.
   */
  readonly migrationPending: boolean;
  readonly endsAt: string | null;
  readonly eventId: string;
  readonly lifecycleState: EventAccessDirectoryLifecycleState;
  readonly owner: boolean;
  readonly revision: number;
  readonly role: EventAccessPrincipalRole;
  readonly startsAt: string | null;
  readonly title: string | null;
  readonly venue: string | null;
}

/** Current, active role facts for a single event. Owner remains Event Core-derived. */
export interface EventAccessRoleMember {
  readonly assignedAt: string | null;
  readonly assignedByActorId: string | null;
  readonly eventId: string;
  readonly reason: string | null;
  readonly revision: number;
  readonly role: EventAccessPrincipalRole;
  readonly state: "active";
  readonly subjectActorId: string;
}

export interface EventAccessAccessibleEventsQuery {
  readonly actorId: string;
}

export interface EventAccessRoleMembersQuery {
  readonly actingActorId: string;
  readonly eventId: string;
}

export interface EventAccessRoleMembersPayload {
  readonly event: EventAccessDirectoryEvent;
  readonly members: readonly EventAccessRoleMember[];
}

export interface EventAccessDirectoryRepository {
  listAccessibleEvents(
    input: EventAccessAccessibleEventsQuery,
  ): Promise<readonly EventAccessDirectoryEvent[]>;
  listEventRoleMembers(
    input: EventAccessRoleMembersQuery,
  ): Promise<EventAccessRoleMembersPayload>;
}

const ACCESSIBLE_EVENTS_KEYS = ["actorId"] as const;
const ROLE_MEMBERS_KEYS = ["actingActorId", "eventId"] as const;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;

function failure(): never {
  throw new EventAccessDirectoryQueryError();
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) failure();
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) failure();
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== expectedKeys.length ||
    !expectedKeys.every((key) => keys.includes(key))
  ) {
    failure();
  }

  const output = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      failure();
    }
    output[key] = descriptor.value;
  }
  return output;
}

function actorId(value: unknown): string {
  if (typeof value !== "string" || !ACTOR_ID.test(value)) failure();
  return value;
}

function eventId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    failure();
  }
  return value;
}

function parse<TValue>(operation: () => TValue): TValue {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EventAccessDirectoryQueryError) throw error;
    failure();
  }
}

export function parseEventAccessAccessibleEventsQuery(
  input: unknown,
): EventAccessAccessibleEventsQuery {
  return parse(() => {
    const record = exactDataRecord(input, ACCESSIBLE_EVENTS_KEYS);
    return Object.freeze({ actorId: actorId(record.actorId) });
  });
}

export function parseEventAccessRoleMembersQuery(
  input: unknown,
): EventAccessRoleMembersQuery {
  return parse(() => {
    const record = exactDataRecord(input, ROLE_MEMBERS_KEYS);
    return Object.freeze({
      actingActorId: actorId(record.actingActorId),
      eventId: eventId(record.eventId),
    });
  });
}

export function isEventAccessDirectoryLifecycleState(
  value: unknown,
): value is EventAccessDirectoryLifecycleState {
  return (
    value === "draft" ||
    value === "published" ||
    value === "cancelled" ||
    value === "archived" ||
    value === "legacy_active" ||
    value === "legacy_archived"
  );
}

export function isCurrentDelegatedRole(
  value: unknown,
): value is EventAccessRole {
  return isEventAccessRole(value);
}
