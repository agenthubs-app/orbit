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

create index if not exists orbit_records_search_text_idx
  on orbit_records using gin (to_tsvector('simple', search_text));
`;
