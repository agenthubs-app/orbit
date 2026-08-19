export const EVENT_ACCESS_ROLES = [
  "operations",
  "check_in",
  "reviewer",
  "read_only_analyst",
] as const;

export const EVENT_ACCESS_ASSIGNMENT_STATES = ["active", "revoked"] as const;

export const EVENT_ACCESS_CAPABILITIES = [
  "event.center.read",
  "roles.manage",
  "owner.transfer",
  "operations.read_sensitive",
  "operations.configure",
  "experience.configure",
  "experience.publish",
  "attendees.read_full",
  "attendees.export",
  "check_in.roster.read_limited",
  "check_in.roster.write",
  "admission.read",
  "admission.decide",
  "generation.run",
  "generation.publish",
  "analytics.read_aggregate",
] as const;

export type EventAccessRole = (typeof EVENT_ACCESS_ROLES)[number];
export type EventAccessPrincipalRole = "owner" | EventAccessRole;
export type EventAccessAssignmentState =
  (typeof EVENT_ACCESS_ASSIGNMENT_STATES)[number];
export type EventAccessCapability =
  (typeof EVENT_ACCESS_CAPABILITIES)[number];

export const EVENT_ACCESS_ASSIGNMENT_INVALID =
  "EVENT_ACCESS_ASSIGNMENT_INVALID" as const;

export class EventAccessAssignmentError extends Error {
  constructor(readonly code = EVENT_ACCESS_ASSIGNMENT_INVALID) {
    super("Event access assignment is invalid.");
    this.name = "EventAccessAssignmentError";
  }
}

/** Owner is deliberately absent; it is derived from Event Core organizer. */
export interface EventAccessAssignment {
  readonly assignedByActorId: string;
  readonly eventId: string;
  readonly reason: string;
  readonly role: EventAccessRole;
  readonly state: EventAccessAssignmentState;
  readonly subjectActorId: string;
}

const ASSIGNMENT_KEYS = [
  "assignedByActorId",
  "eventId",
  "reason",
  "role",
  "state",
  "subjectActorId",
] as const;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;

function failure(): never {
  throw new EventAccessAssignmentError();
}

function exactDataRecord(input: unknown): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    failure();
  }
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== ASSIGNMENT_KEYS.length ||
    !ASSIGNMENT_KEYS.every((key) => keys.includes(key))
  ) {
    failure();
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of ASSIGNMENT_KEYS) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      failure();
    }
    output[key] = descriptor.value;
  }
  return output;
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

function actorId(value: unknown): string {
  if (typeof value !== "string" || !ACTOR_ID.test(value)) failure();
  return value;
}

function reason(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 1_000 ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    failure();
  }
  return value;
}

export function isEventAccessRole(value: unknown): value is EventAccessRole {
  return (
    typeof value === "string" &&
    (EVENT_ACCESS_ROLES as readonly string[]).includes(value)
  );
}

export function isEventAccessAssignmentState(
  value: unknown,
): value is EventAccessAssignmentState {
  return (
    typeof value === "string" &&
    (EVENT_ACCESS_ASSIGNMENT_STATES as readonly string[]).includes(value)
  );
}

export function isEventAccessCapability(
  value: unknown,
): value is EventAccessCapability {
  return (
    typeof value === "string" &&
    (EVENT_ACCESS_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function parseEventAccessAssignment(
  input: unknown,
): EventAccessAssignment {
  try {
    const record = exactDataRecord(input);
    if (
      !isEventAccessRole(record.role) ||
      !isEventAccessAssignmentState(record.state)
    ) {
      failure();
    }
    return Object.freeze({
      assignedByActorId: actorId(record.assignedByActorId),
      eventId: eventId(record.eventId),
      reason: reason(record.reason),
      role: record.role,
      state: record.state,
      subjectActorId: actorId(record.subjectActorId),
    });
  } catch (error) {
    if (error instanceof EventAccessAssignmentError) throw error;
    failure();
  }
}
