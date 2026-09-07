export const RELATIONSHIP_LIFECYCLE_SCHEMA_SQL = `
create table if not exists relationship_lifecycle_command_receipts (
  workspace_id text not null,
  actor_id text not null,
  idempotency_key text not null,
  command text not null,
  request_hash text not null,
  response_snapshot jsonb not null,
  created_at timestamptz not null,
  primary key (workspace_id, actor_id, idempotency_key)
);

create index if not exists orbit_records_actor_collection_idx
  on orbit_records (workspace_id, collection_name, user_id);

create index if not exists orbit_records_relationship_tasks_idx
  on orbit_records (workspace_id, user_id, (payload ->> 'connectionId'), (payload ->> 'status'), (payload ->> 'dueAt'))
  where collection_name = 'tasks';
`;

export async function runRelationshipLifecycleMigrations(client: { query(text: string): Promise<unknown> }): Promise<void> {
  await client.query(RELATIONSHIP_LIFECYCLE_SCHEMA_SQL);
}
