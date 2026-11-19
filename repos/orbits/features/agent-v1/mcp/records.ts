/**
 * agent-design AG17 (设计稿附录 E「外部连接」): how connections and what hangs off them are stored — collections of the
 * generic record table, addressed by workspace, collection and record id (no new table, no migration).
 *
 *   agentConnections           one row per authorised client of one account (id, account, client, scopes, revokedAt …)
 *   agentConnectionGrants      authorisation codes and refresh tokens, by the SHA-256 of their value (never the value)
 *   agentConnectionProposals   proposal id → the card it stands for (the confirm link carries only this id)
 *   agentConnectionCalls       one row per tool call: connection, tool, scopes, how many records went back
 *   agentConnectionUsage       last use per connection (its own row, so a call never rewrites the connection)
 *
 * Every row carries a numeric `version`; a change is a compare-and-swap on it.
 */
import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";

export const CONNECTION_COLLECTION = "agentConnections";
export const GRANT_COLLECTION = "agentConnectionGrants";
export const PROPOSAL_COLLECTION = "agentConnectionProposals";
export const CALL_COLLECTION = "agentConnectionCalls";
export const USAGE_COLLECTION = "agentConnectionUsage";

/** One account's connections read at once (bounded; the settings page lists them all). */
export const CONNECTION_LIST_LIMIT = 200;
/** One connection's proposals looked at when it is revoked (24 hours of proposals; bounded). */
export const PROPOSAL_LIST_LIMIT = 500;

export type McpStore = LiveRecordStoreLike<Record<string, unknown>>;

export interface StoredRow<T> {
  value: T;
  createdAt: string;
  updatedAt: string;
}

export interface McpRecords {
  get<T extends { version: number }>(collection: string, id: string): Promise<StoredRow<T> | null>;
  /** Insert only; false when a row with this id already exists. */
  insert<T extends { version: number }>(collection: string, id: string, owner: string, value: T, at: string, link?: { sourceId?: string }): Promise<boolean>;
  /** Compare-and-swap on `version`; false when the row changed in between. */
  replace<T extends { version: number }>(collection: string, id: string, owner: string, current: StoredRow<T>, next: T, at: string, link?: { sourceId?: string }): Promise<boolean>;
  /** Rows of one account in a collection, optionally those hanging off one source (a connection id). */
  list<T extends { version: number }>(collection: string, owner: string, options: { sourceId?: string; limit: number }): Promise<T[]>;
  /** Last write wins (the usage row only). */
  put(collection: string, id: string, owner: string, value: Record<string, unknown>, at: string): Promise<void>;
}

function row(input: { workspaceId: string; collection: string; id: string; owner: string; value: Record<string, unknown>; createdAt: string; updatedAt: string; sourceId?: string }): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: input.collection,
    createdAt: input.createdAt,
    deletedAt: null,
    evidenceIds: [],
    lifecycleState: "active",
    payload: input.value,
    recordId: input.id,
    searchText: null,
    sourceId: input.sourceId ?? input.id,
    sourceType: "agent_connection",
    updatedAt: input.updatedAt,
    userId: input.owner,
    workspaceId: input.workspaceId,
  };
}

/** A later instant than `previous`, so a compare-and-swap by time also sees the change. */
function after(previous: string, at: string): string {
  return Date.parse(at) > Date.parse(previous) ? at : new Date(Date.parse(previous) + 1).toISOString();
}

export function createMcpRecords(store: McpStore, workspaceId: string): McpRecords {
  if (!store.insertRecordIfAbsent || !store.updateRecordIfCurrent) throw new Error("External connections need a record store with conditional writes.");
  const insertIfAbsent = store.insertRecordIfAbsent;
  const updateIfCurrent = store.updateRecordIfCurrent;
  return {
    async get<T extends { version: number }>(collection: string, id: string) {
      const found = await store.getRecord({ collectionName: collection, recordId: id, workspaceId });
      return found ? { createdAt: found.createdAt, updatedAt: found.updatedAt, value: found.payload as unknown as T } : null;
    },
    async insert(collection, id, owner, value, at, link) {
      const created = await insertIfAbsent(row({ collection, createdAt: at, id, owner, updatedAt: at, value: value as unknown as Record<string, unknown>, workspaceId, ...(link?.sourceId ? { sourceId: link.sourceId } : {}) }));
      return created !== null;
    },
    async replace(collection, id, owner, current, next, at, link) {
      const updated = await updateIfCurrent(
        row({ collection, createdAt: current.createdAt, id, owner, updatedAt: after(current.updatedAt, at), value: next as unknown as Record<string, unknown>, workspaceId, ...(link?.sourceId ? { sourceId: link.sourceId } : {}) }),
        { expectedPayloadVersion: { path: ["version"], value: current.value.version }, updatedAt: current.updatedAt, userId: owner },
      );
      return updated !== null;
    },
    async list<T extends { version: number }>(collection: string, owner: string, options: { sourceId?: string; limit: number }) {
      const found = await store.listRecords({ collectionName: collection, limit: options.limit, userId: owner, workspaceId, ...(options.sourceId ? { sourceId: options.sourceId } : {}) });
      return found.map((item) => item.payload as unknown as T);
    },
    async put(collection, id, owner, value, at) {
      await store.upsertRecord(row({ collection, createdAt: at, id, owner, updatedAt: at, value, workspaceId }));
    },
  };
}
