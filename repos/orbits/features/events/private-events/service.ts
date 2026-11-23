/**
 * agent-design AG13 (设计稿 §4 活动, 附录 B 私有活动): the user's own private events — create, update, delete, restore, and
 * the records that link to one. Only the account can see or change its private events; platform events are never written
 * here.
 *
 * Deleting (PLANNER 易错边界 4): the references (attendance notes, memos, to-dos, schedule items) are looked up again at the
 * moment of deletion, inside the same locks every write that adds a link takes (the to-do lock, the schedule lock and the
 * event-link lock, in that order). Any reference left, or added since the card was frozen, keeps the event and says which.
 */
import { createHash } from "node:crypto";

import type { EventRefContract, PrivateEventContract } from "../../../shared/contract/agent-v1";
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../../shared/storage/postgres-live-record-store";
import { ATTENDANCE_COLLECTION, eventRefLockKey, liveRecordOf, PRIVATE_EVENT_COLLECTION, readAttendance, readPrivateEvent, scheduleLockKey, taskLockKey, EVENT_RECORDS_LIST_LIMIT } from "./records";

export class PrivateEventError extends Error {
  constructor(readonly code: "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID" | "STILL_REFERENCED", message: string, readonly detail?: { references: PrivateEventReference[] }) {
    super(message);
    this.name = "PrivateEventError";
  }
}

export type ReferenceKind = "attendance" | "memo" | "todo" | "schedule";

/** A record that links to a private event (what a delete card lists and the executor checks again). */
export interface PrivateEventReference {
  kind: ReferenceKind;
  id: string;
  /** What the user calls it: the to-do's title, the memo's title or first words, the schedule item's title, the day attended. */
  label: string;
  /** Kept for the card: the record's version or updatedAt at the time of reading. */
  version: string;
}

export interface PrivateEventCreateInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  /** AG20a: a day without a clock time (startsAt is 00:00 of that day). */
  allDay?: boolean;
  venue?: string;
  notes?: string;
  idempotencyKey: string;
}

export interface PrivateEventPatch {
  /** AG20a: null when a clock time is set on an all-day event. */
  allDay?: null;
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  venue?: string | null;
  notes?: string | null;
}

const REF_PATH: Record<Exclude<ReferenceKind, "attendance">, { collection: string; path: string[] }> = {
  memo: { collection: "notes", path: ["note", "eventRefs"] },
  schedule: { collection: "personal_schedule_items", path: ["eventRefs"] },
  todo: { collection: "tasks", path: ["task", "relatedEventRefs"] },
};

const at = (value: unknown, path: readonly string[]) => path.reduce<unknown>((item, key) => (item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined), value);
const linksTo = (value: unknown, id: string) => Array.isArray(value) && value.some((ref) => ref && typeof ref === "object" && (ref as EventRefContract).kind === "private" && (ref as EventRefContract).id === id);

function labelOf(kind: ReferenceKind, payload: Record<string, unknown>): string {
  if (kind === "todo") return String((payload.task as Record<string, unknown> | undefined)?.title ?? "");
  if (kind === "memo") {
    const note = (payload.note ?? {}) as Record<string, unknown>;
    return String(note.title ?? "").trim() || String(note.body ?? "").slice(0, 24);
  }
  if (kind === "schedule") return String(payload.title ?? "");
  return String(payload.attendedOn ?? "");
}

function versionOf(kind: ReferenceKind, record: LiveRecord<Record<string, unknown>>): string {
  if (kind === "memo") return String((record.payload.note as Record<string, unknown> | undefined)?.version ?? record.updatedAt);
  if (kind === "attendance") return String(record.payload.version ?? record.updatedAt);
  return record.updatedAt;
}

export function privateEventId(actorId: string, idempotencyKey: string): string {
  return `private_event:${createHash("sha256").update(JSON.stringify([actorId, idempotencyKey])).digest("hex").slice(0, 24)}`;
}

export function createPrivateEventService(input: { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string; client?: TransactionalPostgresClient | null; now?: () => string }) {
  const now = input.now ?? (() => new Date().toISOString());
  const workspaceId = input.workspaceId;

  async function get(store: LiveRecordStoreLike<Record<string, unknown>>, actorId: string, id: string, includeDeleted = false) {
    const record = await store.getRecord({ collectionName: PRIVATE_EVENT_COLLECTION, includeDeleted, recordId: id, userId: actorId, workspaceId });
    const event = readPrivateEvent(record, actorId);
    return record && event ? { event, record } : null;
  }

  /** The records linking to the event, by the indexes of shared/storage/migrations.ts when a database is there. */
  async function references(executor: TransactionalSqlExecutor | null, store: LiveRecordStoreLike<Record<string, unknown>>, actorId: string, id: string): Promise<PrivateEventReference[]> {
    const out: PrivateEventReference[] = [];
    const ref = { id, kind: "private" };
    if (executor) {
      const rows = async (sql: string, value: unknown) => (await executor.query<{ collection_name: string; record_id: string; payload: Record<string, unknown>; updated_at: string | Date }>(sql, [workspaceId, actorId, JSON.stringify(value)])).rows;
      const kinds: [ReferenceKind, string, unknown][] = [
        ["attendance", `select collection_name, record_id, payload, updated_at from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = '${ATTENDANCE_COLLECTION}' and lifecycle_state <> 'deleted' and (payload->'eventRef'->>'kind') = 'private' and (payload->'eventRef'->>'id') = ($3::jsonb->>'id')`, ref],
        ["memo", "select collection_name, record_id, payload, updated_at from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'notes' and lifecycle_state <> 'deleted' and (payload->'note'->'eventRefs') @> $3::jsonb", [ref]],
        ["todo", "select collection_name, record_id, payload, updated_at from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'tasks' and lifecycle_state <> 'deleted' and (payload->'task'->'relatedEventRefs') @> $3::jsonb", [ref]],
        ["schedule", "select collection_name, record_id, payload, updated_at from orbit_records where workspace_id = $1 and user_id = $2 and collection_name = 'personal_schedule_items' and lifecycle_state <> 'deleted' and (payload->'eventRefs') @> $3::jsonb", [ref]],
      ];
      for (const [kind, sql, value] of kinds) {
        for (const row of await rows(sql, value)) {
          const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
          out.push({ id: row.record_id, kind, label: labelOf(kind, row.payload), version: versionOf(kind, { payload: row.payload, updatedAt } as LiveRecord<Record<string, unknown>>) });
        }
      }
      return out;
    }
    // No database (tests, memory store): the same rule over the account's records.
    const list = async (collectionName: string) => store.listRecords({ collectionName, limit: EVENT_RECORDS_LIST_LIMIT, userId: actorId, workspaceId });
    for (const record of await list(ATTENDANCE_COLLECTION)) {
      const note = readAttendance(record, actorId);
      if (note && note.eventRef.kind === "private" && note.eventRef.id === id) out.push({ id: record.recordId, kind: "attendance", label: note.attendedOn, version: String(note.version) });
    }
    for (const kind of ["memo", "todo", "schedule"] as const) {
      for (const record of await list(REF_PATH[kind].collection)) if (record.lifecycleState !== "deleted" && linksTo(at(record.payload, REF_PATH[kind].path), id)) out.push({ id: record.recordId, kind, label: labelOf(kind, record.payload), version: versionOf(kind, record) });
    }
    return out;
  }

  /** Runs with the locks of every link writer held (read committed: each statement sees what was committed meanwhile). */
  async function withLinkLocks<T>(actorId: string, operation: (store: LiveRecordStoreLike<Record<string, unknown>>, executor: TransactionalSqlExecutor | null) => Promise<T>): Promise<T> {
    if (!input.client) return operation(input.store, null);
    // Serializable, like the to-do and schedule writers: a link committed while this waited for the locks makes one of the
    // two transactions fail to serialize, and it is tried again (it then sees the link, or the link sees the event gone).
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await input.client.transaction(async (tx) => {
          for (const key of [taskLockKey(workspaceId, actorId), scheduleLockKey(workspaceId, actorId), eventRefLockKey(workspaceId, actorId)]) await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
          return operation(createPostgresLiveRecordStore({ client: tx }), tx);
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : null;
        if ((code === "40001" || code === "40P01") && attempt < 4) continue;
        throw error;
      }
    }
  }

  function validated(fields: { title?: string; startsAt?: string; endsAt?: string | null; venue?: string | null }) {
    if (fields.title !== undefined && (!fields.title.trim() || fields.title.length > 300)) throw new PrivateEventError("INVALID", "A private event needs a title (up to 300 characters).");
    if (fields.startsAt !== undefined && !Number.isFinite(Date.parse(fields.startsAt))) throw new PrivateEventError("INVALID", "startsAt must be a time.");
    if (fields.endsAt && fields.startsAt && Date.parse(fields.endsAt) <= Date.parse(fields.startsAt)) throw new PrivateEventError("INVALID", "The end must be after the start.");
  }

  return {
    async get(actorId: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<PrivateEventContract | null> {
      return (await get(input.store, actorId, id, options.includeDeleted))?.event ?? null;
    },

    async list(actorId: string): Promise<PrivateEventContract[]> {
      const records = await input.store.listRecords({ collectionName: PRIVATE_EVENT_COLLECTION, limit: EVENT_RECORDS_LIST_LIMIT, userId: actorId, workspaceId });
      return records.map((record) => readPrivateEvent(record, actorId)).filter((event): event is PrivateEventContract => Boolean(event)).sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    },

    references: (actorId: string, id: string) => references(input.client ?? null, input.store, actorId, id),

    async create(actorId: string, fields: PrivateEventCreateInput): Promise<PrivateEventContract> {
      validated(fields);
      const id = privateEventId(actorId, fields.idempotencyKey);
      const existing = await get(input.store, actorId, id, true);
      if (existing) {
        // The same key again: the event made then (a replay), never a second one.
        if (existing.event.title === fields.title.trim() && Date.parse(existing.event.startsAt) === Date.parse(fields.startsAt)) return existing.event;
        throw new PrivateEventError("VERSION_CONFLICT", "The idempotency key was used for another event.");
      }
      const time = now();
      const event: PrivateEventContract = {
        accountId: actorId, createdAt: time, id, startsAt: new Date(fields.startsAt).toISOString(), title: fields.title.trim(), updatedAt: time, version: 1,
        ...(fields.endsAt ? { endsAt: new Date(fields.endsAt).toISOString() } : {}),
        ...(fields.allDay === true ? { allDay: true } : {}),
        ...(fields.venue?.trim() ? { venue: fields.venue.trim() } : {}),
        ...(fields.notes?.trim() ? { notes: fields.notes.trim() } : {}),
      };
      const record = liveRecordOf({ actorId, collectionName: PRIVATE_EVENT_COLLECTION, payload: { ...event }, searchText: [event.title, event.venue].filter(Boolean).join(" "), workspaceId });
      const saved = input.store.insertRecordIfAbsent ? await input.store.insertRecordIfAbsent(record) : await input.store.upsertRecord(record);
      if (!saved) {
        const again = await get(input.store, actorId, id, true);
        if (again) return again.event;
        throw new PrivateEventError("VERSION_CONFLICT", "The event could not be created.");
      }
      return event;
    },

    async update(actorId: string, id: string, change: { expectedVersion: number; patch: PrivateEventPatch }): Promise<PrivateEventContract> {
      const current = await get(input.store, actorId, id);
      if (!current) throw new PrivateEventError("NOT_FOUND", "Private event not found.");
      if (current.event.version !== change.expectedVersion) throw new PrivateEventError("VERSION_CONFLICT", "The event changed since it was read.");
      const next: Record<string, unknown> = { ...current.event };
      for (const [key, value] of Object.entries(change.patch)) {
        if (value === null) delete next[key];
        else if (value !== undefined) next[key] = key === "startsAt" || key === "endsAt" ? new Date(value).toISOString() : String(value).trim();
      }
      validated(next as PrivateEventPatch);
      const time = new Date(Math.max(Date.parse(now()), Date.parse(current.event.updatedAt) + 1)).toISOString();
      const event = { ...next, updatedAt: time, version: current.event.version + 1 } as unknown as PrivateEventContract;
      const record = liveRecordOf({ actorId, collectionName: PRIVATE_EVENT_COLLECTION, payload: { ...event }, searchText: [event.title, event.venue].filter(Boolean).join(" "), workspaceId });
      const written = input.store.updateRecordIfCurrent
        ? await input.store.updateRecordIfCurrent({ ...record, createdAt: current.record.createdAt }, { expectedPayloadVersion: { path: ["version"], value: change.expectedVersion }, updatedAt: current.record.updatedAt, userId: actorId })
        : await input.store.upsertRecord({ ...record, createdAt: current.record.createdAt });
      if (!written) throw new PrivateEventError("VERSION_CONFLICT", "The event changed since it was read.");
      return event;
    },

    /**
     * Deletes the event when nothing links to it any more (looked up again here, under the link locks). With references
     * left it is kept: `deleted: false` and the references, so the card says why.
     */
    async delete(actorId: string, id: string, options: { expectedVersion?: number } = {}): Promise<{ deleted: true; event: PrivateEventContract } | { deleted: false; references: PrivateEventReference[]; event: PrivateEventContract }> {
      return withLinkLocks(actorId, async (store, executor) => {
        const current = await get(store, actorId, id, true);
        if (!current || current.record.lifecycleState === "deleted") throw new PrivateEventError("NOT_FOUND", "Private event not found.");
        if (options.expectedVersion !== undefined && current.event.version !== options.expectedVersion) throw new PrivateEventError("VERSION_CONFLICT", "The event changed since the card was made.");
        const left = await references(executor, store, actorId, id);
        if (left.length) return { deleted: false as const, event: current.event, references: left };
        const time = new Date(Math.max(Date.parse(now()), Date.parse(current.event.updatedAt) + 1)).toISOString();
        const event = { ...current.event, updatedAt: time, version: current.event.version + 1 };
        await store.upsertRecord(liveRecordOf({ actorId, collectionName: PRIVATE_EVENT_COLLECTION, deletedAt: time, payload: { ...event }, searchText: "", workspaceId }));
        return { deleted: true as const, event };
      });
    },

    /** Brings the event itself back (never its former links). */
    async restore(actorId: string, id: string): Promise<PrivateEventContract> {
      const current = await get(input.store, actorId, id, true);
      if (!current) throw new PrivateEventError("NOT_FOUND", "Private event not found.");
      if (current.record.lifecycleState !== "deleted") return current.event;
      const time = new Date(Math.max(Date.parse(now()), Date.parse(current.event.updatedAt) + 1)).toISOString();
      const event = { ...current.event, updatedAt: time, version: current.event.version + 1 };
      await input.store.upsertRecord(liveRecordOf({ actorId, collectionName: PRIVATE_EVENT_COLLECTION, payload: { ...event }, searchText: [event.title, event.venue].filter(Boolean).join(" "), workspaceId }));
      return event;
    },
  };
}

export type PrivateEventService = ReturnType<typeof createPrivateEventService>;
