import {
  SYNC_COLLECTION_NAMES,
  SYNC_COMMIT_ORDER_LOCK_CTE,
  SYNC_WRITE_LOCK_KEY_SQL,
  SYNC_WRITE_LOCK_SETTING,
} from "./commit-order-lock";
import { SYNC_OWNER_GUARD_SQL } from "./owner-guard";

/**
 * The strict trigger function: every insert/update gets a new revision, and a
 * write to a sync collection must hold the commit-order lock.
 */
export const SYNC_REVISION_STRICT_FUNCTION_SQL = `
create or replace function orbit_records_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
  if orbit_records_is_sync_collection(new.collection_name)
    and current_setting('${SYNC_WRITE_LOCK_SETTING}', true)
      is distinct from orbit_records_sync_write_lock_key()::text then
    raise exception 'SYNC_WRITE_LOCK_REQUIRED'
      using errcode = '55P03';
  end if;
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$;
`;

/**
 * Rollback step 1 ("relax"): the same trigger without the lock check. Writes
 * can no longer fail on the lock and still get revisions; only the commit-order
 * guarantee is lost. This is the state sprint 0069 left orbit_events in.
 */
export const SYNC_REVISION_RELAXED_FUNCTION_SQL = `
create or replace function orbit_records_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$;
`;

/**
 * Dashboard relationship-graph version (sprint 0102). A separate partial index
 * instead of widening orbit_records_sync_actor_idx: the sync readers scan
 * (workspace_id, user_id, sync_revision) ranges and filter collection_name on
 * the heap, so widening that index would make every sync page step over the
 * user's contacts, connections and evidence rows. This one serves only the
 * count/sum/max aggregate in features/dashboard/storage/dashboard-snapshot.ts
 * as an index-only scan. Idempotent; safe to run alone on a database that
 * already has sync_revision (it does not touch the sync trigger or functions).
 */
export const DASHBOARD_GRAPH_VERSION_INDEX_SQL = `
create index if not exists orbit_records_graph_version_idx
  on orbit_records (workspace_id, user_id, sync_revision)
  where user_id is not null
    and collection_name in ('connections', 'contact_detail_states', 'contacts', 'events', 'evidence', 'tasks');
`;

/** Sequence and nullable column. Idempotent. */
export const SYNC_REVISION_COLUMN_SQL = `
create sequence if not exists orbit_records_sync_revision_seq;

alter table orbit_records
  add column if not exists sync_revision bigint;
`;

/**
 * The functions of the strict sync_revision schema. The assign function
 * refuses a write to a sync collection that does not hold the commit-order
 * lock (see features/sync/commit-order-lock.ts). Idempotent; replacing a
 * function takes no table lock.
 */
export const SYNC_REVISION_FUNCTIONS_SQL = `
create or replace function orbit_records_is_sync_collection(target_collection text)
returns boolean
language sql
immutable
parallel safe
as $$
  select target_collection in (${SYNC_COLLECTION_NAMES.map((name) => `'${name}'`).join(", ")});
$$;

create or replace function orbit_records_sync_write_lock_key()
returns bigint
language sql
stable
parallel safe
as $$
  select ${SYNC_WRITE_LOCK_KEY_SQL};
$$;

create or replace function orbit_records_acquire_sync_write_lock(target_collection text)
returns boolean
language plpgsql
as $$
declare
  lock_key bigint;
begin
  if orbit_records_is_sync_collection(target_collection) then
    lock_key := orbit_records_sync_write_lock_key();
    perform pg_advisory_xact_lock(lock_key);
    perform set_config('${SYNC_WRITE_LOCK_SETTING}', lock_key::text, true);
  end if;
  return true;
end;
$$;

${SYNC_REVISION_STRICT_FUNCTION_SQL}
`;

/**
 * Moves the sequence past every stored revision, so the next nextval() can
 * never collide with a revision a relaxed or restored database already holds.
 */
export const SYNC_REVISION_ALIGN_SEQUENCE_SQL = `
with revision_state as (
  select
    coalesce((select max(sync_revision) from orbit_records), 0) as table_max,
    last_value as sequence_last_value,
    is_called as sequence_is_called
  from orbit_records_sync_revision_seq
)
select setval(
  'orbit_records_sync_revision_seq'::regclass,
  greatest(table_max, sequence_last_value, 1),
  case
    when table_max >= sequence_last_value then table_max > 0
    else sequence_is_called
  end
)
from revision_state;
`;

export const SYNC_REVISION_TRIGGER_SQL = `
drop trigger if exists orbit_records_assign_sync_revision_trigger on orbit_records;
create trigger orbit_records_assign_sync_revision_trigger
  before insert or update on orbit_records
  for each row execute function orbit_records_assign_sync_revision();
`;

// The record domains' actor index keeps its three collections (sprint 0108):
// the contact collections are served by orbit_records_graph_version_idx, and
// widening this one would make every notes/tasks page step over contact rows.
const SYNC_ACTOR_INDEX_COLLECTIONS = ["notes", "tasks", "personal_schedule_items"] as const;

export const SYNC_ACTOR_INDEX_SQL = `
create index if not exists orbit_records_sync_actor_idx
  on orbit_records (workspace_id, user_id, sync_revision)
  where user_id is not null
    and collection_name in (${SYNC_ACTOR_INDEX_COLLECTIONS.map((name) => `'${name}'`).join(", ")});
`;

/**
 * One-shot strict schema for a fresh or test database: everything in one
 * statement batch, with a single-statement backfill. Production uses the
 * online, batched runner in sync-revision-migration.ts instead.
 */
export const SYNC_REVISION_MIGRATION_SQL = `
${SYNC_REVISION_COLUMN_SQL}
${SYNC_REVISION_FUNCTIONS_SQL}
${SYNC_REVISION_ALIGN_SEQUENCE_SQL}
with ${SYNC_COMMIT_ORDER_LOCK_CTE}
update orbit_records
set sync_revision = nextval('orbit_records_sync_revision_seq'::regclass)
from sync_write_lock
where sync_revision is null;

${SYNC_REVISION_ALIGN_SEQUENCE_SQL}
do $$
begin
  if exists (select 1 from orbit_records where sync_revision is null) then
    raise exception 'SYNC_REVISION_NULL_BACKFILL_FAILED';
  end if;
  if exists (
    select 1 from orbit_records
    group by sync_revision
    having count(*) > 1
  ) then
    raise exception 'SYNC_REVISION_DUPLICATE_BACKFILL_FAILED';
  end if;
end;
$$;

alter table orbit_records
  alter column sync_revision set not null;

create unique index if not exists orbit_records_sync_revision_uidx
  on orbit_records (sync_revision);

${SYNC_REVISION_TRIGGER_SQL}
${SYNC_ACTOR_INDEX_SQL}
${DASHBOARD_GRAPH_VERSION_INDEX_SQL}
-- Sprint 0113: an owned sync row cannot change owner or collection outside a
-- registered handler (features/sync/owner-guard.ts).
${SYNC_OWNER_GUARD_SQL}
-- Product deletes are persistent lifecycle_state = 'deleted' updates, so the
-- UPDATE trigger assigns their tombstone revision without removing the row.
`;

export interface SyncMigrationClient {
  query(text: string): Promise<unknown>;
}

export function appendSyncRevisionMigration(schemaSql: string): string {
  return `${schemaSql.trimEnd()}\n\n${SYNC_REVISION_MIGRATION_SQL}`;
}

export async function runSyncRevisionMigration(
  client: SyncMigrationClient,
  sql = SYNC_REVISION_MIGRATION_SQL,
): Promise<void> {
  await client.query(sql);
}
