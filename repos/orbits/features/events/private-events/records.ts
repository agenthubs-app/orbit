/**
 * agent-design AG13: how private events and attendance notes («我去过», user-recorded) are stored — two collections of the
 * generic record table, addressed by workspace, collection and record id (no new table). Both carry a numeric `version`
 * that each write raises by one and conditional writes check (`expectedPayloadVersion`).
 */
import type { AttendanceDayPart, AttendanceNoteContract, EventRefContract, PrivateEventContract } from "../../../shared/contract/agent-v1";
import type { LiveRecord } from "../../../shared/storage/live-record-store";

export const PRIVATE_EVENT_COLLECTION = "private_events";
export const ATTENDANCE_COLLECTION = "event_attendance_notes";
/** One account's private events or «我去过» rows read at once (bounded, like CONTACT_FACTS_LIST_LIMIT; not an unbounded read). */
export const EVENT_RECORDS_LIST_LIMIT = 500;

/** Lock keys every write that adds or removes a link to a private event shares with its deletion (PLANNER 易错边界 4). */
export const eventRefLockKey = (workspaceId: string, actorId: string) => JSON.stringify(["event-refs", workspaceId, actorId]);
export const taskLockKey = (workspaceId: string, actorId: string) => JSON.stringify(["task", workspaceId, actorId]);
export const scheduleLockKey = (workspaceId: string, actorId: string) => JSON.stringify(["personal-schedule", workspaceId, actorId]);

export const DAY_PARTS: readonly AttendanceDayPart[] = ["morning", "noon", "afternoon", "evening", "night"];

const isString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isInstant = (value: unknown): value is string => isString(value) && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));
const isDay = (value: unknown): value is string => isString(value) && /^\d{4}-\d{2}-\d{2}$/u.test(value);

export function isEventRef(value: unknown): value is EventRefContract {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return (ref.kind === "platform" || ref.kind === "private") && isString(ref.id) && Object.keys(ref).every((key) => key === "kind" || key === "id");
}

export const sameRef = (left: EventRefContract, right: EventRefContract) => left.kind === right.kind && left.id === right.id;

/** A stored private event, checked; null when it is not one of this account's. */
export function readPrivateEvent(record: Pick<LiveRecord<Record<string, unknown>>, "payload" | "userId" | "recordId"> | null, actorId: string): PrivateEventContract | null {
  if (!record || record.userId !== actorId) return null;
  const value = record.payload;
  if (!isString(value.id) || value.id !== record.recordId || value.accountId !== actorId || !isString(value.title) || !isInstant(value.startsAt)
    || (value.endsAt !== undefined && !isInstant(value.endsAt)) || (value.venue !== undefined && !isString(value.venue))
    || !Number.isInteger(value.version) || Number(value.version) < 1 || !isInstant(value.createdAt) || !isInstant(value.updatedAt)) return null;
  return value as unknown as PrivateEventContract;
}

/** A stored attendance note, checked; null when it is not one of this account's. */
export function readAttendance(record: Pick<LiveRecord<Record<string, unknown>>, "payload" | "userId" | "recordId"> | null, actorId: string): AttendanceNoteContract | null {
  if (!record || record.userId !== actorId) return null;
  const value = record.payload;
  if (!isString(value.id) || value.id !== record.recordId || value.accountId !== actorId || !isEventRef(value.eventRef) || !isDay(value.attendedOn)
    || (value.dayParts !== undefined && (!Array.isArray(value.dayParts) || value.dayParts.some((part) => !(DAY_PARTS as readonly unknown[]).includes(part))))
    || (value.selfNote !== undefined && typeof value.selfNote !== "string")
    || !Number.isInteger(value.version) || Number(value.version) < 1 || !isInstant(value.createdAt) || !isInstant(value.updatedAt)) return null;
  return value as unknown as AttendanceNoteContract;
}

export function liveRecordOf(input: { workspaceId: string; collectionName: string; actorId: string; payload: Record<string, unknown> & { id: string; createdAt: string; updatedAt: string }; searchText: string; deletedAt?: string | null }): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: input.collectionName,
    createdAt: input.payload.createdAt,
    deletedAt: input.deletedAt ?? null,
    evidenceIds: [],
    lifecycleState: input.deletedAt ? "deleted" : "active",
    payload: input.payload,
    recordId: input.payload.id,
    searchText: input.searchText,
    sourceId: input.payload.id,
    sourceType: "manual",
    updatedAt: input.deletedAt ?? input.payload.updatedAt,
    userId: input.actorId,
    workspaceId: input.workspaceId,
  };
}
