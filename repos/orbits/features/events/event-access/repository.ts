import {
  isEventAccessRole,
  type EventAccessRole,
} from "./contract";

export interface EventAccessGetQuery {
  readonly eventId: string;
  readonly subjectActorId: string;
}

export interface EventAccessGrantCommand extends EventAccessGetQuery {
  readonly actingActorId: string;
  readonly expectedRevision: number;
  readonly reason: string;
  readonly role: EventAccessRole;
}

export interface EventAccessRevokeCommand extends EventAccessGetQuery {
  readonly actingActorId: string;
  readonly expectedRevision: number;
  readonly reason: string;
}

export interface EventAccessAssignmentView extends EventAccessGetQuery {
  readonly owner: boolean;
  readonly revision: number;
  readonly role: EventAccessRole | null;
  readonly state: "active" | "revoked" | null;
}

export interface EventAccessRepository {
  get(input: EventAccessGetQuery): Promise<EventAccessAssignmentView>;
  grant(input: EventAccessGrantCommand): Promise<EventAccessAssignmentView>;
  revoke(input: EventAccessRevokeCommand): Promise<EventAccessAssignmentView>;
}

export const EVENT_ACCESS_COMMAND_INVALID =
  "EVENT_ACCESS_COMMAND_INVALID" as const;

export class EventAccessCommandError extends Error {
  constructor(readonly code = EVENT_ACCESS_COMMAND_INVALID) {
    super("Event access command is invalid.");
    this.name = "EventAccessCommandError";
  }
}

const GET_KEYS = ["eventId", "subjectActorId"] as const;
const GRANT_KEYS = [
  "actingActorId",
  "eventId",
  "expectedRevision",
  "reason",
  "role",
  "subjectActorId",
] as const;
const REVOKE_KEYS = [
  "actingActorId",
  "eventId",
  "expectedRevision",
  "reason",
  "subjectActorId",
] as const;
const ACTOR_ID = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$/u;

function failure(): never {
  throw new EventAccessCommandError();
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

function safeText(value: unknown, maximumLength: number): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    value.normalize("NFC") !== value ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    failure();
  }
  return value;
}

function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) failure();
  return Number(value);
}

function parse<TValue>(operation: () => TValue): TValue {
  try {
    return operation();
  } catch (error) {
    if (error instanceof EventAccessCommandError) throw error;
    failure();
  }
}

export function parseEventAccessGetQuery(input: unknown): EventAccessGetQuery {
  return parse(() => {
    const record = exactDataRecord(input, GET_KEYS);
    return Object.freeze({
      eventId: safeText(record.eventId, 512),
      subjectActorId: actorId(record.subjectActorId),
    });
  });
}

export function parseEventAccessGrantCommand(
  input: unknown,
): EventAccessGrantCommand {
  return parse(() => {
    const record = exactDataRecord(input, GRANT_KEYS);
    if (!isEventAccessRole(record.role)) failure();
    return Object.freeze({
      actingActorId: actorId(record.actingActorId),
      eventId: safeText(record.eventId, 512),
      expectedRevision: revision(record.expectedRevision),
      reason: safeText(record.reason, 1_000),
      role: record.role,
      subjectActorId: actorId(record.subjectActorId),
    });
  });
}

export function parseEventAccessRevokeCommand(
  input: unknown,
): EventAccessRevokeCommand {
  return parse(() => {
    const record = exactDataRecord(input, REVOKE_KEYS);
    return Object.freeze({
      actingActorId: actorId(record.actingActorId),
      eventId: safeText(record.eventId, 512),
      expectedRevision: revision(record.expectedRevision),
      reason: safeText(record.reason, 1_000),
      subjectActorId: actorId(record.subjectActorId),
    });
  });
}
