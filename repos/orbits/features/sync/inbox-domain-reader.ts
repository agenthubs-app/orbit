import type { DomainChange } from "../../shared/contract/universal-read";
import type { InboxNotificationSource } from "../../shared/contract/inbox-notifications";
import { inboxDevicePayload, inboxSourceStateOf, type InboxSourceState } from "../../shared/compute/inbox-local";
import type { TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { assertInboxRecordsIntact, canonicalJson, type InboxSourceAccessBatch } from "../notifications/inbox-record-service";
import { createPostgresInboxRecordTransaction, type InboxStoredRecord } from "../notifications/storage/inbox-record-repository";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
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
const SOURCES_SQL = `case when jsonb_typeof(payload->'notification'->'sources') = 'array' then payload->'notification'->'sources' else '[]'::jsonb end`;
const RECONCILE_COLUMNS = `record_id,
    (select coalesce(jsonb_agg(source - 'excerpt'), '[]'::jsonb) from jsonb_array_elements(${SOURCES_SQL}) source) as sources,
    payload->>'sourceState' as source_state`;
const ACTIVE_INBOX = `workspace_id = $1 and collection_name = 'inboxNotifications' and user_id = $2 and lifecycle_state = 'active'`;

/**
 * Sprint 0119 (coordinator item from 0118): the manifest's source check is
 * incremental. Each run checks
 *   1. the notifications that cite a record source changed since the
 *      account's source watermark (the greatest sync_revision among its
 *      source rows already looked at, kept in one inboxSourceCheckMarks row);
 *   2. one rotating window of INBOX_RECONCILE_ROTATION_BATCH active
 *      notifications, picked by the 15-second time slot, which reaches every
 *      notification within ceil(count / batch) polls and catches what leaves no
 *      revision behind: a hard-deleted row, a complex or external source.
 * The amount read per run is bounded by the batch sizes, not by the number of
 * notifications.
 */
export const INBOX_RECONCILE_ROTATION_BATCH = 50;
/** How many changed source rows one run looks at (the watermark then moves past them). */
export const INBOX_RECONCILE_CHANGED_SOURCES = 50;
/** How many notifications citing those rows one run checks; beyond it the rotation catches the rest (logged). */
export const INBOX_RECONCILE_AFFECTED_LIMIT = 100;
export const INBOX_RECONCILE_SLOT_MS = 15_000;
export const INBOX_SOURCE_CHECK_MARK_COLLECTION = "inboxSourceCheckMarks";

/** Record-backed source kinds whose decision reads that same orbit_records row (inbox-record-service-factory sourceAccess). */
const RECORD_SOURCE_KINDS: Readonly<Record<string, readonly string[]>> = {
  tasks: ["task"], personal_schedule_items: ["schedule"], notes: ["note"], contacts: ["contact"], profiles: ["goal"],
  reminderPlans: ["reminder_plan"], businessCardBatches: ["batch"],
};
const RECORD_SOURCE_COLLECTIONS = Object.keys(RECORD_SOURCE_KINDS);

const SOURCE_WATERMARK_SQL = `
  /* sync:inbox:reconcile-source-watermark */
  select coalesce(max(sync_revision), 0)::text as watermark
  from orbit_records
  where workspace_id = $1 and user_id = $2 and collection_name = any($3::text[])
`;

const CHANGED_SOURCES_SQL = `
  /* sync:inbox:reconcile-changed-sources */
  select collection_name, record_id, sync_revision::text as sync_revision
  from orbit_records
  where workspace_id = $1 and user_id = $2 and collection_name = any($3::text[]) and sync_revision > $4::bigint
  order by sync_revision asc
  limit $5
`;

const AFFECTED_SQL = `
  /* sync:inbox:reconcile-affected */
  select ${RECONCILE_COLUMNS}
  from orbit_records n
  where ${ACTIVE_INBOX}
    and exists (
      select 1 from jsonb_array_elements(${SOURCES_SQL}) source
      join jsonb_to_recordset($3::jsonb) as changed(kind text, id text) on changed.kind = source->>'sourceKind' and changed.id = source->>'sourceId')
  order by record_id
  limit $4
`;

// Window k of the active notifications in record-id order; k is the time slot modulo the number of windows.
const ROTATION_SQL = `
  /* sync:inbox:reconcile-rotation */
  select record_id, sources, source_state from (
    select ${RECONCILE_COLUMNS},
      row_number() over (order by record_id) - 1 as position,
      count(*) over () as total
    from orbit_records
    where ${ACTIVE_INBOX}
  ) ranked
  where position / $3 = $4::bigint % greatest(1, (total + $3 - 1) / $3)
  order by record_id
`;

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

type CheckRow = { record_id: string; sources: InboxNotificationSource[] | string; source_state: string | null };

async function readSourceWatermark(client: TransactionalPostgresClient, workspaceId: string, actorId: string): Promise<{ watermark: string | null; save: (next: string) => Promise<void> }> {
  const store = createPostgresLiveRecordStore({ client });
  const mark = await store.getRecord({ workspaceId, collectionName: INBOX_SOURCE_CHECK_MARK_COLLECTION, recordId: actorId });
  const stored = mark?.userId === actorId ? mark.payload.sourceWatermark : null;
  return {
    watermark: typeof stored === "string" && /^(?:0|[1-9]\d*)$/.test(stored) ? stored : null,
    async save(next) {
      const at = new Date().toISOString();
      await store.upsertRecord({
        workspaceId, collectionName: INBOX_SOURCE_CHECK_MARK_COLLECTION, recordId: actorId, userId: actorId, sourceType: "system", sourceId: actorId,
        evidenceIds: [], lifecycleState: "active", createdAt: mark?.createdAt ?? at, updatedAt: at, payload: { sourceWatermark: next },
      });
    },
  };
}

/**
 * Runs the server's read-time source check (sourceAccessBatch: one batched
 * statement for record sources, the domain checks for the rest) over the
 * notifications this run picks (see INBOX_RECONCILE_ROTATION_BATCH: those
 * citing a changed record source, plus one rotating window), and writes back
 * each decision that differs from the stored one. A row whose sources changed
 * in between (a producer redelivery) is left for the next run.
 */
export async function reconcileInboxSourceStates(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  actorId: string;
  access: InboxSourceAccessBatch;
  /** The poll's time; the rotation window is its 15-second slot. */
  nowMs?: () => number;
}): Promise<InboxReconcileResult> {
  const picked = new Map<string, CheckRow>();
  const mark = await readSourceWatermark(input.client, input.workspaceId, input.actorId);
  let nextWatermark: string | null = null;
  if (mark.watermark === null) {
    // First run for this account: start from its current sources; the rotation covers what came before.
    nextWatermark = (await input.client.query<{ watermark: string }>(SOURCE_WATERMARK_SQL, [input.workspaceId, input.actorId, RECORD_SOURCE_COLLECTIONS])).rows[0]?.watermark ?? "0";
  } else {
    const changedSources = await input.client.query<{ collection_name: string; record_id: string; sync_revision: string }>(
      CHANGED_SOURCES_SQL, [input.workspaceId, input.actorId, RECORD_SOURCE_COLLECTIONS, mark.watermark, INBOX_RECONCILE_CHANGED_SOURCES],
    );
    if (changedSources.rows.length > 0) {
      const keys = changedSources.rows.flatMap((row) => (RECORD_SOURCE_KINDS[row.collection_name] ?? []).map((kind) => ({ kind, id: row.record_id })));
      const affected = await input.client.query<CheckRow>(AFFECTED_SQL, [input.workspaceId, input.actorId, JSON.stringify(keys), INBOX_RECONCILE_AFFECTED_LIMIT]);
      if (affected.rows.length >= INBOX_RECONCILE_AFFECTED_LIMIT) {
        console.warn(JSON.stringify({ event: "inbox_reconcile_affected_capped", limit: INBOX_RECONCILE_AFFECTED_LIMIT }));
      }
      for (const row of affected.rows) picked.set(row.record_id, row);
      nextWatermark = changedSources.rows.at(-1)!.sync_revision;
    }
  }
  const slot = Math.floor((input.nowMs ?? Date.now)() / INBOX_RECONCILE_SLOT_MS);
  const rotation = await input.client.query<CheckRow>(ROTATION_SQL, [input.workspaceId, input.actorId, INBOX_RECONCILE_ROTATION_BATCH, slot]);
  for (const row of rotation.rows) if (!picked.has(row.record_id)) picked.set(row.record_id, row);
  const result = await checkAndWriteBack(input, [...picked.values()]);
  if (nextWatermark !== null && nextWatermark !== mark.watermark) await mark.save(nextWatermark);
  return result;
}

async function checkAndWriteBack(
  input: { client: TransactionalPostgresClient; workspaceId: string; actorId: string; access: InboxSourceAccessBatch },
  picked: readonly CheckRow[],
): Promise<InboxReconcileResult> {
  let checked = 0;
  let changed = 0;
  for (let start = 0; start < picked.length; start += INBOX_RECONCILE_ROTATION_BATCH) {
    const batch = { rows: picked.slice(start, start + INBOX_RECONCILE_ROTATION_BATCH) };
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
  }
  return { checked, changed };
}

