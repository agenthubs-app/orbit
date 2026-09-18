export const SYNC_REVISION_MIGRATION_SQL = `
create sequence if not exists orbit_records_sync_revision_seq;

alter table orbit_records
  add column if not exists sync_revision bigint;

create or replace function orbit_records_is_sync_collection(target_collection text)
returns boolean
language sql
immutable
parallel safe
as $$
  select target_collection in ('notes', 'tasks', 'personal_schedule_items');
$$;

create or replace function orbit_records_sync_write_lock_key()
returns bigint
language sql
stable
parallel safe
as $$
  select hashtextextended(
    'orbit:sync:commit-order:v1:' || 'orbit_records'::regclass::oid::text,
    0
  );
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
    perform set_config('orbit.sync_write_lock_key', lock_key::text, true);
  end if;
  return true;
end;
$$;

create or replace function orbit_records_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
  if orbit_records_is_sync_collection(new.collection_name)
    and current_setting('orbit.sync_write_lock_key', true)
      is distinct from orbit_records_sync_write_lock_key()::text then
    raise exception 'SYNC_WRITE_LOCK_REQUIRED'
      using errcode = '55P03';
  end if;
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$;

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

with sync_write_lock as materialized (
  select orbit_records_acquire_sync_write_lock('notes') as acquired
)
update orbit_records
set sync_revision = nextval('orbit_records_sync_revision_seq'::regclass)
from sync_write_lock
where sync_revision is null
  and sync_write_lock.acquired;

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

drop trigger if exists orbit_records_assign_sync_revision_trigger on orbit_records;
create trigger orbit_records_assign_sync_revision_trigger
  before insert or update on orbit_records
  for each row execute function orbit_records_assign_sync_revision();

create index if not exists orbit_records_sync_actor_idx
  on orbit_records (workspace_id, user_id, sync_revision)
  where user_id is not null
    and collection_name in ('notes', 'tasks', 'personal_schedule_items');

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
