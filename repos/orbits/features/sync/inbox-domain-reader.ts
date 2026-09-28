import type { DomainChange } from "../../shared/contract/universal-read";
import type { InboxNotificationSource } from "../../shared/contract/inbox-notifications";
import { inboxDevicePayload, inboxSourceStateOf, type InboxSourceState } from "../../shared/compute/inbox-local";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertInboxRecordsIntact, canonicalJson, type InboxSourceAccessBatch } from "../notifications/inbox-record-service";
import { createPostgresInboxRecordTransaction, type InboxStoredRecord } from "../notifications/storage/inbox-record-repository";
import { SyncReadError } from "./read-service";

/**
 * Sprint 0118 (offline 3a): the reader behind the sync domain
 * "inbox-notifications" — every typed notification row of the actor
 * (orbit_records inboxNotifications, user_id = actor), history included.
 *
 * Whether a notification's sources are still available is decided at read
 * time (a deleted contact, a cancelled appointment, a revoked request...), and
 * that decision never moved the row. A device that already holds the row would
 * keep showing it. reconcileInboxSourceStates runs the server's own source
 * check over the actor's rows and writes a changed decision back onto the row
 * (`sourceState`); the write takes a new sync_revision, so the next page sends
 * the row again — without its content when the sources are gone.
 *
 * A row that is no longer active (archived, deleted) is sent as a delete; a
 * first pull (bookmark 0) sends no tombstones.
 */
interface Queryable {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

const HIGH_WATERMARK_SQL = `
  /* sync:inbox:high-watermark */
  select coalesce(max(sync_revision), 0)::text as high_watermark
  from orbit_records
  where workspace_id = $1 and user_id = $2 and collection_name = 'inboxNotifications'
`;

const PAGE_SQL = `
  /* sync:inbox:page */
  select record_id, user_id, lifecycle_state, payload, sync_revision::text as sync_revision
  from orbit_records
  where workspace_id = $1
    and user_id = $2
    and collection_name = 'inboxNotifications'
    and sync_revision > $3::bigint
    and sync_revision <= $4::bigint
  -- The table column, not the text alias above: "100" sorts before "99".
  order by orbit_records.sync_revision asc
  limit $5
`;

// Only the sources and the stored decision leave SQL: no copy, no excerpts, no receipts.
const RECONCILE_BATCH_SQL = `
  /* sync:inbox:reconcile */
  select record_id,
    (select coalesce(jsonb_agg(source - 'excerpt'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(payload->'notification'->'sources') = 'array' then payload->'notification'->'sources' else '[]'::jsonb end) source) as sources,
    payload->>'sourceState' as source_state
  from orbit_records
  where workspace_id = $1 and collection_name = 'inboxNotifications' and user_id = $2 and lifecycle_state = 'active'
    and record_id > $3
  order by record_id
  limit $4
`;
export const INBOX_RECONCILE_BATCH = 100;

interface PageRow { record_id: string; user_id: string; lifecycle_state: string; payload: InboxStoredRecord | string; sync_revision: string }

export async function readInboxDomainHighWatermark(client: Queryable, input: { workspaceId: string; actorId: string }): Promise<string> {
  const value = (await client.query<{ high_watermark: string }>(HIGH_WATERMARK_SQL, [input.workspaceId, input.actorId])).rows[0]?.high_watermark;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)$/.test(value)) throw new SyncReadError("SYNC_INVALID_HIGH_WATERMARK", "The sync high watermark is invalid.");
  return value;
}

function storedState(value: unknown): InboxSourceState {
  return value === "changed" || value === "unavailable" ? value : "available";
}

export async function readInboxDomainPage(
  client: Queryable,
  input: { workspaceId: string; actorId: string; afterRevision: string; highWatermark: string; limit: number },
): Promise<{ changes: DomainChange[]; hasMore: boolean; lastRevision: string | null }> {
  const result = await client.query<PageRow>(PAGE_SQL, [input.workspaceId, input.actorId, input.afterRevision, input.highWatermark, input.limit + 1]);
  if (result.rows.some((row) => row.user_id !== input.actorId)) throw new SyncReadError("SYNC_SCOPE_MISMATCH", "Sync rows must match the authenticated scope.");
  const pageRows = result.rows.slice(0, input.limit);
  const firstPull = input.afterRevision === "0";
  const changes: DomainChange[] = [];
  for (const row of pageRows) {
    if (row.lifecycle_state !== "active") {
      if (!firstPull) changes.push({ id: row.record_id, revision: row.sync_revision, operation: "delete", payload: null });
      continue;
    }
    const stored = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as InboxStoredRecord;
    const notification = stored?.notification;
    if (!notification || notification.id !== row.record_id || notification.actorId !== input.actorId) {
      throw new SyncReadError("SYNC_INVALID_RECORD", "An inbox notification row is invalid.");
    }
    // The same fail-closed rule as the server's list: an unclassifiable record is a data fault.
    try { assertInboxRecordsIntact([notification]); } catch { throw new SyncReadError("SYNC_INVALID_RECORD", "An inbox notification row is invalid."); }
    changes.push({ id: row.record_id, revision: row.sync_revision, operation: "upsert", payload: inboxDevicePayload(notification, storedState(stored.sourceState)) as unknown as Record<string, unknown> });
  }
  return { changes, hasMore: result.rows.length > input.limit, lastRevision: pageRows.length ? pageRows.at(-1)!.sync_revision : null };
}

export interface InboxReconcileResult { checked: number; changed: number }

/**
 * Runs the server's read-time source check (sourceAccessBatch: one batched
 * statement for record sources, the domain checks for the rest) over every
 * active notification of the actor, INBOX_RECONCILE_BATCH rows at a time, and
 * writes back each decision that differs from the stored one. A row whose
 * sources changed in between (a producer redelivery) is left for the next run.
 */
export async function reconcileInboxSourceStates(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  access: InboxSourceAccessBatch;
}): Promise<InboxReconcileResult> {
  let after = "";
  let checked = 0;
  let changed = 0;
  for (;;) {
    const batch = await input.client.query<{ record_id: string; sources: InboxNotificationSource[] | string; source_state: string | null }>(
      RECONCILE_BATCH_SQL, [input.workspaceId, input.actorId, after, INBOX_RECONCILE_BATCH],
    );
    if (batch.rows.length === 0) break;
    const rows = batch.rows.map((row) => ({ id: row.record_id, sources: (typeof row.sources === "string" ? JSON.parse(row.sources) : row.sources) as InboxNotificationSource[], stored: storedState(row.source_state) }));
    const states = await input.access(input.actorId, rows.flatMap((row) => row.sources));
    if (states.length !== rows.reduce((total, row) => total + row.sources.length, 0)) throw new Error("Incomplete source authorization");
    let offset = 0;
    const decided = rows.map((row) => {
      const state = inboxSourceStateOf(states.slice(offset, offset + row.sources.length));
      offset += row.sources.length;
      return { ...row, state };
    }).filter((row) => row.state !== row.stored);
    checked += rows.length;
    if (decided.length > 0) {
      changed += await input.client.transaction(async (executor) => {
        const inbox = await createPostgresInboxRecordTransaction({ executor, workspaceId: input.workspaceId, actorId: input.actorId });
        let written = 0;
        for (const row of decided) {
          const current = await inbox.get(row.id);
          if (!current || canonicalJson(current.notification.sources.map(({ excerpt: _excerpt, ...source }) => source)) !== canonicalJson(row.sources)) continue;
          if (storedState(current.sourceState) === row.state) continue;
          const next: InboxStoredRecord = { ...current };
          if (row.state === "available") delete next.sourceState;
          else next.sourceState = row.state;
          await inbox.save(next);
          written += 1;
        }
        return written;
      });
    }
    after = rows.at(-1)!.id;
    if (batch.rows.length < INBOX_RECONCILE_BATCH) break;
  }
  return { checked, changed };
}

