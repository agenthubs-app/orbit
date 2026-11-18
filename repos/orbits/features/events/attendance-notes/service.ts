/**
 * agent-design AG13 (设计稿 §4, 附录 B 参会自述): «我去过», recorded by the user — kept apart from the organizer's check-ins
 * and registrations. Nothing here writes those tables, and nothing there writes this collection (PLANNER 易错边界 2).
 *
 * One note per account and event (a deleted one does not count): checked here, and by the unique index of
 * shared/storage/migrations.ts on the database. A note on a private event is written under the event-link lock, after
 * checking that the event is still the account's and not deleted.
 */
import { createHash } from "node:crypto";

import type { AttendanceDayPart, AttendanceNoteContract, EventRefContract } from "../../../shared/contract/agent-v1";
import type { LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import { ATTENDANCE_COLLECTION, DAY_PARTS, eventRefLockKey, isEventRef, liveRecordOf, PRIVATE_EVENT_COLLECTION, readAttendance, readPrivateEvent, sameRef, EVENT_RECORDS_LIST_LIMIT } from "../private-events/records";

export class AttendanceError extends Error {
  constructor(readonly code: "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID" | "DUPLICATE" | "EVENT_UNAVAILABLE", message: string) {
    super(message);
    this.name = "AttendanceError";
  }
}

export interface AttendanceCreateInput {
  eventRef: EventRefContract;
  attendedOn: string;
  dayParts?: readonly AttendanceDayPart[];
  selfNote?: string;
  idempotencyKey: string;
}

export interface AttendancePatch {
  eventRef?: EventRefContract;
  attendedOn?: string;
  dayParts?: readonly AttendanceDayPart[] | null;
  selfNote?: string | null;
}

export function attendanceId(actorId: string, idempotencyKey: string): string {
  return `attendance:${createHash("sha256").update(JSON.stringify([actorId, idempotencyKey])).digest("hex").slice(0, 24)}`;
}

const isUniqueViolation = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");

export function createAttendanceService(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string; client?: TransactionalPostgresClient | null; now?: () => string; platformEventExists?: (id: string) => Promise<boolean> }) {
  const now = input.now ?? (() => new Date().toISOString());
  const workspaceId = input.workspaceId;

  async function listAll(store: LiveRecordStoreLike<Record<string, unknown>>, actorId: string): Promise<AttendanceNoteContract[]> {
    const records = await store.listRecords({ collectionName: ATTENDANCE_COLLECTION, limit: EVENT_RECORDS_LIST_LIMIT, userId: actorId, workspaceId });
    return records.filter((record) => record.lifecycleState !== "deleted").map((record) => readAttendance(record, actorId)).filter((note): note is AttendanceNoteContract => Boolean(note));
  }

  async function getOne(store: LiveRecordStoreLike<Record<string, unknown>>, actorId: string, id: string, includeDeleted = false) {
    const record = await store.getRecord({ collectionName: ATTENDANCE_COLLECTION, includeDeleted, recordId: id, userId: actorId, workspaceId });
    const note = readAttendance(record, actorId);
    return record && note ? { note, record } : null;
  }

  /** Runs under the event-link lock (the private-event deletion takes it too). */
  async function locked<T>(actorId: string, operation: (store: LiveRecordStoreLike<Record<string, unknown>>, executor: TransactionalSqlExecutor | null) => Promise<T>): Promise<T> {
    if (!input.client) return operation(input.store, null);
    // Serializable, as the private event's deletion: one of two racing writers fails to serialize and is tried again.
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await input.client.transaction(async (tx) => {
          await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [eventRefLockKey(workspaceId, actorId)]);
          return operation(createPostgresLiveRecordStore({ client: tx }), tx);
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
        if ((code === "40001" || code === "40P01") && attempt < 4) continue;
        throw error;
      }
    }
  }

  async function requireEvent(store: LiveRecordStoreLike<Record<string, unknown>>, actorId: string, ref: EventRefContract): Promise<void> {
    if (ref.kind === "private") {
      const record = await store.getRecord({ collectionName: PRIVATE_EVENT_COLLECTION, recordId: ref.id, userId: actorId, workspaceId });
      if (!readPrivateEvent(record, actorId)) throw new AttendanceError("EVENT_UNAVAILABLE", "The private event is not available.");
      return;
    }
    if (input.platformEventExists && !(await input.platformEventExists(ref.id))) throw new AttendanceError("EVENT_UNAVAILABLE", "The platform event is not available.");
  }

  function checkFields(fields: { attendedOn?: string; dayParts?: readonly AttendanceDayPart[] | null; eventRef?: EventRefContract }) {
    if (fields.eventRef !== undefined && !isEventRef(fields.eventRef)) throw new AttendanceError("INVALID", "eventRef must be { kind: platform | private, id }.");
    if (fields.attendedOn !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(fields.attendedOn)) throw new AttendanceError("INVALID", "attendedOn must be YYYY-MM-DD.");
    if (fields.dayParts && fields.dayParts.some((part) => !DAY_PARTS.includes(part))) throw new AttendanceError("INVALID", "dayParts has an unknown part of the day.");
  }

  return {
    list: (actorId: string) => listAll(input.store, actorId),
    async get(actorId: string, id: string): Promise<AttendanceNoteContract | null> {
      return (await getOne(input.store, actorId, id))?.note ?? null;
    },
    async forEvent(actorId: string, ref: EventRefContract): Promise<AttendanceNoteContract | null> {
      return (await listAll(input.store, actorId)).find((note) => sameRef(note.eventRef, ref)) ?? null;
    },

    async create(actorId: string, fields: AttendanceCreateInput): Promise<AttendanceNoteContract> {
      checkFields(fields);
      const id = attendanceId(actorId, fields.idempotencyKey);
      return locked(actorId, async (store) => {
        const existing = await getOne(store, actorId, id, true);
        if (existing) {
          if (sameRef(existing.note.eventRef, fields.eventRef) && existing.note.attendedOn === fields.attendedOn) return existing.note;
          throw new AttendanceError("VERSION_CONFLICT", "The idempotency key was used for another note.");
        }
        await requireEvent(store, actorId, fields.eventRef);
        if ((await listAll(store, actorId)).some((note) => sameRef(note.eventRef, fields.eventRef))) throw new AttendanceError("DUPLICATE", "«我去过» is already recorded for this event.");
        const time = now();
        const note: AttendanceNoteContract = {
          accountId: actorId, attendedOn: fields.attendedOn, createdAt: time, eventRef: { id: fields.eventRef.id, kind: fields.eventRef.kind }, id, updatedAt: time, version: 1,
          ...(fields.dayParts?.length ? { dayParts: [...new Set(fields.dayParts)] } : {}),
          ...(fields.selfNote?.trim() ? { selfNote: fields.selfNote.trim() } : {}),
        };
        try {
          await store.upsertRecord(liveRecordOf({ actorId, collectionName: ATTENDANCE_COLLECTION, payload: { ...note }, searchText: note.selfNote ?? "", workspaceId }));
        } catch (error) {
          if (isUniqueViolation(error)) throw new AttendanceError("DUPLICATE", "«我去过» is already recorded for this event.");
          throw error;
        }
        return note;
      });
    },

    async update(actorId: string, id: string, change: { expectedVersion: number; patch: AttendancePatch }): Promise<AttendanceNoteContract> {
      checkFields({ ...change.patch, dayParts: change.patch.dayParts ?? undefined });
      return locked(actorId, async (store) => {
        const current = await getOne(store, actorId, id);
        if (!current) throw new AttendanceError("NOT_FOUND", "Attendance note not found.");
        if (current.note.version !== change.expectedVersion) throw new AttendanceError("VERSION_CONFLICT", "The note changed since it was read.");
        if (change.patch.eventRef && !sameRef(change.patch.eventRef, current.note.eventRef)) {
          // Moving it to another event: that event must be there and have no note of its own yet.
          await requireEvent(store, actorId, change.patch.eventRef);
          if ((await listAll(store, actorId)).some((note) => note.id !== id && sameRef(note.eventRef, change.patch.eventRef!))) throw new AttendanceError("DUPLICATE", "«我去过» is already recorded for that event.");
        }
        const next: Record<string, unknown> = { ...current.note };
        for (const [key, value] of Object.entries(change.patch)) {
          if (value === null) delete next[key];
          else if (value !== undefined) next[key] = value;
        }
        const time = new Date(Math.max(Date.parse(now()), Date.parse(current.note.updatedAt) + 1)).toISOString();
        const note = { ...next, updatedAt: time, version: current.note.version + 1 } as unknown as AttendanceNoteContract;
        const record = liveRecordOf({ actorId, collectionName: ATTENDANCE_COLLECTION, payload: { ...note }, searchText: note.selfNote ?? "", workspaceId });
        try {
          const written = store.updateRecordIfCurrent
            ? await store.updateRecordIfCurrent({ ...record, createdAt: current.record.createdAt }, { expectedPayloadVersion: { path: ["version"], value: change.expectedVersion }, updatedAt: current.record.updatedAt, userId: actorId })
            : await store.upsertRecord({ ...record, createdAt: current.record.createdAt });
          if (!written) throw new AttendanceError("VERSION_CONFLICT", "The note changed since it was read.");
        } catch (error) {
          if (isUniqueViolation(error)) throw new AttendanceError("DUPLICATE", "«我去过» is already recorded for that event.");
          throw error;
        }
        return note;
      });
    },

    async delete(actorId: string, id: string, options: { expectedVersion?: number } = {}): Promise<AttendanceNoteContract> {
      return locked(actorId, async (store) => {
        const current = await getOne(store, actorId, id);
        if (!current) throw new AttendanceError("NOT_FOUND", "Attendance note not found.");
        if (options.expectedVersion !== undefined && current.note.version !== options.expectedVersion) throw new AttendanceError("VERSION_CONFLICT", "The note changed since the card was made.");
        const time = new Date(Math.max(Date.parse(now()), Date.parse(current.note.updatedAt) + 1)).toISOString();
        const note = { ...current.note, updatedAt: time, version: current.note.version + 1 };
        await store.upsertRecord(liveRecordOf({ actorId, collectionName: ATTENDANCE_COLLECTION, deletedAt: time, payload: { ...note }, searchText: "", workspaceId }));
        return note;
      });
    },
  };
}

export type AttendanceService = ReturnType<typeof createAttendanceService>;
