import { DASHBOARD_GRAPH_VERSION_INDEX_SQL } from "../../features/sync/migrations";

/**
 * sync_revision as it exists on the local development database (orbit_events,
 * set up in sprint 0069): column, sequence and a trigger that assigns a new
 * revision on every insert and update, without the sync commit-order write
 * lock that SYNC_REVISION_MIGRATION_SQL enforces (the product write paths do
 * not take that lock yet, so the full migration would reject task writes).
 * Plus the sprint 0102 graph-version index. Apply after ORBIT_RECORDS_SCHEMA_SQL.
 */
export const SYNC_REVISION_ASSIGN_ONLY_SQL = `
create sequence if not exists orbit_records_sync_revision_seq;
alter table orbit_records add column if not exists sync_revision bigint;
update orbit_records set sync_revision = nextval('orbit_records_sync_revision_seq') where sync_revision is null;
alter table orbit_records alter column sync_revision set not null;
create unique index if not exists orbit_records_sync_revision_uidx on orbit_records (sync_revision);

create or replace function orbit_records_assign_sync_revision()
returns trigger
language plpgsql
as $$
begin
  new.sync_revision := nextval('orbit_records_sync_revision_seq'::regclass);
  return new;
end;
$$;

drop trigger if exists orbit_records_assign_sync_revision_trigger on orbit_records;
create trigger orbit_records_assign_sync_revision_trigger
  before insert or update on orbit_records
  for each row execute function orbit_records_assign_sync_revision();

create index if not exists orbit_records_sync_actor_idx
  on orbit_records (workspace_id, user_id, sync_revision)
  where user_id is not null
    and collection_name in ('notes', 'tasks', 'personal_schedule_items');
${DASHBOARD_GRAPH_VERSION_INDEX_SQL}
`;
