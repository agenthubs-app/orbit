import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { runRelationshipLifecycleMigrations } from "../../features/connections/lifecycle/migrations";

export const ORBIT_RECORDS_SCHEMA_SQL = `
create table if not exists orbit_records (
  workspace_id text not null,
  collection_name text not null,
  record_id text not null,
  user_id text,
  source_type text not null,
  source_id text not null,
  source_label text,
  provider text,
  provider_record_id text,
  evidence_ids text[] not null default '{}',
  target_type text,
  target_id text,
  occurred_at timestamptz,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'archived', 'deleted')),
  search_text text not null default '',
  payload jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (workspace_id, collection_name, record_id)
);

create index if not exists orbit_records_workspace_collection_idx
  on orbit_records (workspace_id, collection_name, lifecycle_state, updated_at desc);

create index if not exists orbit_records_source_idx
  on orbit_records (workspace_id, source_type, source_id);

create index if not exists orbit_records_target_idx
  on orbit_records (workspace_id, target_type, target_id);

create index if not exists orbit_records_occurred_at_idx
  on orbit_records (workspace_id, collection_name, occurred_at);

create index if not exists orbit_records_updated_at_idx
  on orbit_records (workspace_id, updated_at desc);

-- Substring search (search_text ilike '%x%') is accelerated by trigrams. The
-- former to_tsvector index was never queried by any code path and is retired.
-- Patterns shorter than three characters produce no trigram and fall back to a
-- filter; results are identical either way.
-- Installed into public and referenced schema-qualified, so a session whose
-- search_path is a private schema (tests, tenants) still resolves the operator
-- class. "if not exists" is not race-safe across parallel migrators, so a
-- concurrent creator's unique violation is treated as benign.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    begin
      create extension pg_trgm with schema public;
    exception
      when unique_violation then null;
    end;
  end if;
  if (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm') <> 'public' then
    alter extension pg_trgm set schema public;
  end if;
end
$$;

create index if not exists orbit_records_search_text_trgm_idx
  on orbit_records using gin (search_text public.gin_trgm_ops);

drop index if exists orbit_records_search_text_idx;

create index if not exists orbit_records_identity_payload_idx
  on orbit_records (workspace_id, collection_name, (payload->>'id'))
  where lifecycle_state <> 'deleted' and collection_name in ('accounts', 'profiles');

create index if not exists orbit_records_profile_account_idx
  on orbit_records (workspace_id, (payload->>'accountId'))
  where lifecycle_state <> 'deleted' and collection_name = 'profiles';

create index if not exists orbit_records_private_owner_idx
  on orbit_records (workspace_id, collection_name, user_id, updated_at desc)
  where lifecycle_state <> 'deleted';

create index if not exists orbit_records_connection_contact_owner_idx
  on orbit_records (workspace_id, (payload->>'contactId'), user_id, (payload->>'accountId'))
  where lifecycle_state <> 'deleted' and collection_name = 'connections';

-- Reconcile one schedule series without reading unrelated plans or completed
-- history. C collation makes the hashed series prefix a bounded index range.
create index if not exists orbit_records_schedule_pending_series_idx
  on orbit_records (workspace_id, user_id, record_id collate "C")
  where collection_name = 'reminderPlans' and lifecycle_state = 'active'
    and record_id like 'schedule-reminder:%' and payload->'entity'->>'status' = 'scheduled';
`;

export interface OrbitRecordsMigrationClient {
  query: (text: string) => Promise<unknown>;
}

export async function runOrbitRecordsMigration(
  client: OrbitRecordsMigrationClient,
): Promise<void> {
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await runRelationshipLifecycleMigrations(client);
  await runEventOperationsMigrations(client);
}
