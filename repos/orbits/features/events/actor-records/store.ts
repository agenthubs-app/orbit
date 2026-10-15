/**
 * R27：参加者自己的小集合（不迁移，存 `orbit_records`）——`eventRecommendationFeedback`（契约 9）、
 * `organizerFollows`（DESIGN §10 A2）、`eventPrepChecklists`（会う準備）、`eventAfterConfirmations`（会後の確定，幂等回执 + 逐行去重）。Owner: 甲 (R27).
 * 每条记录只属于一个人（`user_id`），写入时 `on conflict` 只更新同一个人的行，从不改 owner（sync owner guard）。
 */
export type ActorRecordCollection = "eventRecommendationFeedback" | "organizerFollows" | "eventPrepChecklists" | "eventAfterConfirmations" | "eventTentativeSchedules";

export interface ActorRecord<T> {
  recordId: string;
  payload: T;
  updatedAt: string;
  deleted: boolean;
}

export interface ActorRecordStore {
  get<T>(collection: ActorRecordCollection, actorId: string, recordId: string): Promise<ActorRecord<T> | null>;
  /** Live rows of one person, newest first (`limit` is pushed into storage). */
  list<T>(collection: ActorRecordCollection, actorId: string, limit: number): Promise<Array<ActorRecord<T>>>;
  put<T extends Record<string, unknown>>(collection: ActorRecordCollection, actorId: string, recordId: string, payload: T, at: string): Promise<void>;
  remove(collection: ActorRecordCollection, actorId: string, recordId: string, at: string): Promise<void>;
}

export type ActorRecordQuery = (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ""));

export function createPostgresActorRecordStore(input: { query: ActorRecordQuery; workspaceId: string }): ActorRecordStore {
  const { query, workspaceId } = input;
  return {
    async get<T>(collection: ActorRecordCollection, actorId: string, recordId: string) {
      const result = await query(
        `/* events:actor-record:get */ select payload, updated_at, lifecycle_state from orbit_records where workspace_id = $1 and collection_name = $2 and record_id = $3 and user_id = $4 limit 1`,
        [workspaceId, collection, recordId, actorId],
      );
      const row = result.rows[0];
      return row ? { deleted: row.lifecycle_state === "deleted", payload: row.payload as T, recordId, updatedAt: iso(row.updated_at) } : null;
    },
    async list<T>(collection: ActorRecordCollection, actorId: string, limit: number) {
      const result = await query(
        `/* events:actor-record:list */ select record_id, payload, updated_at from orbit_records where workspace_id = $1 and collection_name = $2 and user_id = $3 and lifecycle_state <> 'deleted' order by updated_at desc limit $4`,
        [workspaceId, collection, actorId, limit],
      );
      return result.rows.map((row) => ({ deleted: false, payload: row.payload as T, recordId: String(row.record_id), updatedAt: iso(row.updated_at) }));
    },
    async put(collection, actorId, recordId, payload, at) {
      await query(
        `/* events:actor-record:put */
        insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, source_label, evidence_ids, lifecycle_state, payload, created_at, updated_at)
        values ($1, $2, $3, $4, 'system', $3, 'R27 event attendee record', '{}', 'active', $5::jsonb, $6, $6)
        on conflict (workspace_id, collection_name, record_id)
        do update set payload = excluded.payload, updated_at = excluded.updated_at, lifecycle_state = 'active', deleted_at = null
        where orbit_records.user_id = excluded.user_id`,
        [workspaceId, collection, recordId, actorId, JSON.stringify(payload), at],
      );
    },
    async remove(collection, actorId, recordId, at) {
      await query(
        `/* events:actor-record:remove */ update orbit_records set lifecycle_state = 'deleted', deleted_at = $5, updated_at = $5 where workspace_id = $1 and collection_name = $2 and record_id = $3 and user_id = $4`,
        [workspaceId, collection, recordId, actorId, at],
      );
    },
  };
}

/** Tests and the demo world: per-process memory, same semantics. */
export function createMemoryActorRecordStore(): ActorRecordStore {
  const rows = new Map<string, { actorId: string; collection: ActorRecordCollection; recordId: string; payload: unknown; updatedAt: string; deleted: boolean }>();
  const key = (collection: string, recordId: string) => `${collection}\u0000${recordId}`;
  return {
    async get<T>(collection: ActorRecordCollection, actorId: string, recordId: string) {
      const row = rows.get(key(collection, recordId));
      return row && row.actorId === actorId ? { deleted: row.deleted, payload: row.payload as T, recordId, updatedAt: row.updatedAt } : null;
    },
    async list<T>(collection: ActorRecordCollection, actorId: string, limit: number) {
      return [...rows.values()]
        .filter((row) => row.collection === collection && row.actorId === actorId && !row.deleted)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, limit)
        .map((row) => ({ deleted: false, payload: row.payload as T, recordId: row.recordId, updatedAt: row.updatedAt }));
    },
    async put(collection, actorId, recordId, payload, at) {
      const existing = rows.get(key(collection, recordId));
      if (existing && existing.actorId !== actorId) return;
      rows.set(key(collection, recordId), { actorId, collection, deleted: false, payload: structuredClone(payload), recordId, updatedAt: at });
    },
    async remove(collection, actorId, recordId, at) {
      const existing = rows.get(key(collection, recordId));
      if (existing && existing.actorId === actorId) rows.set(key(collection, recordId), { ...existing, deleted: true, updatedAt: at });
    },
  };
}
