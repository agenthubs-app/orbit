import { createHash } from "node:crypto";

export interface EventOperationsMigrationClient {
  query(text: string): Promise<unknown>;
}

interface EventOperationsSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:event-operations-schema";

const migrations: readonly EventOperationsSchemaMigration[] = [
  {
    name: "event-operations-v1-transactional-core",
    version: 1,
    sql: `
create table event_ops_events (
  workspace_id text not null,
  event_id text not null,
  organizer_actor_id text not null,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'archived')),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, event_id)
);

create table event_ops_configurations (
  workspace_id text not null,
  event_id text not null,
  configuration_version bigint not null check (configuration_version > 0),
  check_in_opens_at timestamptz not null,
  event_starts_at timestamptz not null,
  event_ends_at timestamptz not null,
  profile_edit_deadline_at timestamptz not null,
  registration_cutoff_at timestamptz not null,
  results_available_at timestamptz not null,
  round_one_starts_at timestamptz not null,
  round_two_starts_at timestamptz not null,
  recommendation_count integer not null check (recommendation_count > 0),
  table_size integer not null check (table_size >= 2),
  shard_size integer not null check (shard_size > 0),
  max_attempts_per_task integer not null check (max_attempts_per_task > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, event_id, configuration_version),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade,
  check (event_starts_at < event_ends_at),
  check (check_in_opens_at <= event_ends_at),
  check (profile_edit_deadline_at <= registration_cutoff_at),
  check (registration_cutoff_at <= results_available_at),
  check (results_available_at <= round_one_starts_at),
  check (event_starts_at <= round_one_starts_at),
  check (round_one_starts_at < round_two_starts_at),
  check (round_two_starts_at <= event_ends_at)
);

create table event_ops_configuration_heads (
  workspace_id text not null,
  event_id text not null,
  configuration_version bigint not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  primary key (workspace_id, event_id),
  foreign key (workspace_id, event_id, configuration_version)
    references event_ops_configurations (
      workspace_id,
      event_id,
      configuration_version
    ) on delete restrict
);

create table event_ops_profile_versions (
  workspace_id text not null,
  event_id text not null,
  participant_id text not null,
  profile_version bigint not null check (profile_version > 0),
  actor_id text not null,
  profile_payload jsonb not null check (jsonb_typeof(profile_payload) = 'object'),
  profile_hash text not null,
  source_registration_id text not null,
  created_at timestamptz not null,
  primary key (workspace_id, event_id, participant_id, profile_version),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade
);

create table event_ops_profile_heads (
  workspace_id text not null,
  event_id text not null,
  participant_id text not null,
  actor_id text not null,
  profile_version bigint not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  primary key (workspace_id, event_id, participant_id),
  unique (workspace_id, event_id, actor_id),
  foreign key (workspace_id, event_id, participant_id, profile_version)
    references event_ops_profile_versions (
      workspace_id,
      event_id,
      participant_id,
      profile_version
    ) on delete restrict
);

create table event_ops_membership_versions (
  workspace_id text not null,
  event_id text not null,
  actor_id text not null,
  membership_version bigint not null check (membership_version > 0),
  participant_id text not null,
  profile_version bigint not null,
  status text not null check (status in ('rsvped', 'cancelled')),
  registered_at timestamptz not null,
  cancelled_at timestamptz,
  reactivated_at timestamptz,
  late_registration boolean not null,
  source_registration_id text not null,
  created_at timestamptz not null,
  primary key (workspace_id, event_id, actor_id, membership_version),
  foreign key (workspace_id, event_id, participant_id, profile_version)
    references event_ops_profile_versions (
      workspace_id,
      event_id,
      participant_id,
      profile_version
    ) on delete restrict
);

create table event_ops_membership_heads (
  workspace_id text not null,
  event_id text not null,
  actor_id text not null,
  membership_version bigint not null,
  participant_id text not null,
  profile_version bigint not null,
  status text not null check (status in ('rsvped', 'cancelled')),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  primary key (workspace_id, event_id, actor_id),
  unique (workspace_id, event_id, participant_id),
  unique (workspace_id, event_id, actor_id, participant_id),
  foreign key (workspace_id, event_id, actor_id, membership_version)
    references event_ops_membership_versions (
      workspace_id,
      event_id,
      actor_id,
      membership_version
    ) on delete restrict,
  foreign key (workspace_id, event_id, participant_id, profile_version)
    references event_ops_profile_versions (
      workspace_id,
      event_id,
      participant_id,
      profile_version
    ) on delete restrict
);

create table event_ops_generations (
  workspace_id text not null,
  generation_id text not null,
  event_id text not null,
  organizer_actor_id text not null,
  idempotency_key text not null,
  configuration_version bigint not null,
  snapshot_hash text not null,
  status text not null
    check (status in (
      'initializing',
      'queued',
      'running',
      'failed',
      'completed',
      'published',
      'superseded'
    )),
  expected_task_count integer not null check (expected_task_count > 0),
  completed_at timestamptz,
  published_at timestamptz,
  error_code text,
  error_message text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, generation_id),
  unique (workspace_id, event_id, idempotency_key),
  foreign key (workspace_id, event_id, configuration_version)
    references event_ops_configurations (
      workspace_id,
      event_id,
      configuration_version
    ) on delete restrict
);

create table event_ops_generation_participants (
  workspace_id text not null,
  generation_id text not null,
  participant_id text not null,
  actor_id text not null,
  profile_version bigint not null,
  ordinal integer not null check (ordinal >= 0),
  participant_payload jsonb not null
    check (jsonb_typeof(participant_payload) = 'object'),
  primary key (workspace_id, generation_id, participant_id),
  unique (workspace_id, generation_id, actor_id),
  unique (workspace_id, generation_id, ordinal),
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete cascade
);

create table event_ops_candidates (
  workspace_id text not null,
  generation_id text not null,
  source_participant_id text not null,
  target_participant_id text not null,
  retrieval_rank integer not null check (retrieval_rank > 0),
  retrieval_score double precision not null,
  feature_payload jsonb not null check (jsonb_typeof(feature_payload) = 'object'),
  created_at timestamptz not null,
  primary key (
    workspace_id,
    generation_id,
    source_participant_id,
    target_participant_id
  ),
  unique (workspace_id, generation_id, source_participant_id, retrieval_rank),
  check (source_participant_id <> target_participant_id),
  foreign key (workspace_id, generation_id, source_participant_id)
    references event_ops_generation_participants (
      workspace_id,
      generation_id,
      participant_id
    ) on delete cascade,
  foreign key (workspace_id, generation_id, target_participant_id)
    references event_ops_generation_participants (
      workspace_id,
      generation_id,
      participant_id
    ) on delete cascade
);

create table event_ops_tasks (
  workspace_id text not null,
  task_id text not null,
  generation_id text not null,
  task_kind text not null check (
    task_kind in (
      'candidate_retrieval',
      'recommendation_shard',
      'grouping_feature_shard',
      'grouping_reduce',
      'table_content_shard'
    )
  ),
  status text not null check (status in ('queued', 'running', 'failed', 'completed')),
  participant_ids text[] not null default '{}',
  depends_on_task_ids text[] not null default '{}',
  attempt_limit integer not null check (attempt_limit > 0),
  attempts integer not null default 0 check (attempts >= 0),
  retry_round integer not null default 0 check (retry_round >= 0),
  lease_token text,
  lease_epoch bigint not null default 0 check (lease_epoch >= 0),
  lease_expires_at timestamptz,
  worker_id text,
  output_payload jsonb,
  output_hash text,
  error_code text,
  error_message text,
  completed_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, task_id),
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete cascade,
  check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null and worker_id is not null)
    or
    (status <> 'running' and lease_token is null and lease_expires_at is null and worker_id is null)
  ),
  check (output_payload is null or jsonb_typeof(output_payload) = 'object')
);

create table event_ops_ai_artifacts (
  workspace_id text not null,
  artifact_id text not null,
  generation_id text not null,
  task_id text not null,
  attempt integer not null check (attempt > 0),
  artifact_kind text not null,
  provider text not null,
  model text not null,
  request_hash text not null,
  response_hash text not null,
  schema_version integer not null check (schema_version > 0),
  evidence_metadata jsonb not null check (jsonb_typeof(evidence_metadata) = 'object'),
  validated_payload jsonb not null check (jsonb_typeof(validated_payload) = 'object'),
  created_at timestamptz not null,
  primary key (workspace_id, artifact_id),
  unique (workspace_id, task_id, attempt),
  foreign key (workspace_id, task_id)
    references event_ops_tasks (workspace_id, task_id) on delete cascade,
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete cascade
);

create table event_ops_recommendation_results (
  workspace_id text not null,
  generation_id text not null,
  source_participant_id text not null,
  no_match_reason text,
  artifact_id text not null,
  created_at timestamptz not null,
  primary key (workspace_id, generation_id, source_participant_id),
  foreign key (workspace_id, generation_id, source_participant_id)
    references event_ops_generation_participants (
      workspace_id,
      generation_id,
      participant_id
    ) on delete cascade,
  foreign key (workspace_id, artifact_id)
    references event_ops_ai_artifacts (workspace_id, artifact_id) on delete restrict
);

create table event_ops_recommendations (
  workspace_id text not null,
  generation_id text not null,
  source_participant_id text not null,
  recommendation_rank integer not null check (recommendation_rank > 0),
  target_participant_id text not null,
  score double precision not null check (score >= 0 and score <= 100),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  icebreakers jsonb not null check (jsonb_typeof(icebreakers) = 'array'),
  member_hint text not null,
  created_at timestamptz not null,
  primary key (
    workspace_id,
    generation_id,
    source_participant_id,
    recommendation_rank
  ),
  unique (
    workspace_id,
    generation_id,
    source_participant_id,
    target_participant_id
  ),
  check (source_participant_id <> target_participant_id),
  foreign key (workspace_id, generation_id, source_participant_id)
    references event_ops_recommendation_results (
      workspace_id,
      generation_id,
      source_participant_id
    ) on delete cascade,
  foreign key (workspace_id, generation_id, target_participant_id)
    references event_ops_generation_participants (
      workspace_id,
      generation_id,
      participant_id
    ) on delete cascade
);

create table event_ops_tables (
  workspace_id text not null,
  generation_id text not null,
  round_number smallint not null check (round_number in (1, 2)),
  table_number integer not null check (table_number > 0),
  theme text not null,
  rationale text not null,
  icebreakers jsonb not null check (jsonb_typeof(icebreakers) = 'array'),
  artifact_id text,
  created_at timestamptz not null,
  primary key (workspace_id, generation_id, round_number, table_number),
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete cascade,
  foreign key (workspace_id, artifact_id)
    references event_ops_ai_artifacts (workspace_id, artifact_id) on delete restrict
);

create table event_ops_seats (
  workspace_id text not null,
  generation_id text not null,
  round_number smallint not null check (round_number in (1, 2)),
  table_number integer not null,
  participant_id text not null,
  seat text not null,
  member_prompts jsonb not null check (jsonb_typeof(member_prompts) = 'array'),
  created_at timestamptz not null,
  primary key (workspace_id, generation_id, round_number, participant_id),
  unique (workspace_id, generation_id, round_number, table_number, seat),
  foreign key (workspace_id, generation_id, round_number, table_number)
    references event_ops_tables (
      workspace_id,
      generation_id,
      round_number,
      table_number
    ) on delete cascade,
  foreign key (workspace_id, generation_id, participant_id)
    references event_ops_generation_participants (
      workspace_id,
      generation_id,
      participant_id
    ) on delete cascade
);

create table event_ops_publications (
  workspace_id text not null,
  publication_id text not null,
  event_id text not null,
  generation_id text not null,
  snapshot_hash text not null,
  dto_hash text not null,
  published_dto jsonb not null check (jsonb_typeof(published_dto) = 'object'),
  published_by_actor_id text not null,
  published_at timestamptz not null,
  primary key (workspace_id, publication_id),
  unique (workspace_id, generation_id),
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete restrict
);

create table event_ops_publication_heads (
  workspace_id text not null,
  event_id text not null,
  publication_id text not null,
  generation_id text not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null,
  primary key (workspace_id, event_id),
  foreign key (workspace_id, publication_id)
    references event_ops_publications (workspace_id, publication_id) on delete restrict,
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete restrict
);

create table event_ops_graph_nodes (
  workspace_id text not null,
  publication_id text not null,
  participant_id text not null,
  node_payload jsonb not null check (jsonb_typeof(node_payload) = 'object'),
  primary key (workspace_id, publication_id, participant_id),
  foreign key (workspace_id, publication_id)
    references event_ops_publications (workspace_id, publication_id) on delete cascade
);

create table event_ops_graph_edges (
  workspace_id text not null,
  publication_id text not null,
  edge_id text not null,
  from_participant_id text not null,
  to_participant_id text not null,
  edge_kind text not null check (
    edge_kind in ('recommendation', 'round_one_table', 'round_two_topic')
  ),
  label text not null,
  edge_payload jsonb not null check (jsonb_typeof(edge_payload) = 'object'),
  primary key (workspace_id, publication_id, edge_id),
  check (from_participant_id <> to_participant_id),
  foreign key (workspace_id, publication_id, from_participant_id)
    references event_ops_graph_nodes (
      workspace_id,
      publication_id,
      participant_id
    ) on delete cascade,
  foreign key (workspace_id, publication_id, to_participant_id)
    references event_ops_graph_nodes (
      workspace_id,
      publication_id,
      participant_id
    ) on delete cascade
);

create table event_ops_checkins (
  workspace_id text not null,
  event_id text not null,
  actor_id text not null,
  participant_id text not null,
  evidence_id text not null,
  checked_in_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0),
  primary key (workspace_id, event_id, actor_id),
  unique (workspace_id, event_id, participant_id),
  unique (workspace_id, evidence_id),
  foreign key (workspace_id, event_id, actor_id, participant_id)
    references event_ops_membership_heads (
      workspace_id,
      event_id,
      actor_id,
      participant_id
    ) on delete restrict
);

create table event_ops_contact_requests (
  workspace_id text not null,
  request_id text not null,
  event_id text not null,
  participant_pair_key text not null,
  requester_actor_id text not null,
  requester_participant_id text not null,
  target_actor_id text not null,
  target_participant_id text not null,
  status text not null check (
    status in ('awaiting_target_consent', 'accepted', 'declined')
  ),
  accepted_at timestamptz,
  declined_at timestamptz,
  relationship_pair_id text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, request_id),
  unique (workspace_id, event_id, participant_pair_key),
  check (requester_actor_id <> target_actor_id),
  check (requester_participant_id <> target_participant_id),
  foreign key (workspace_id, event_id, requester_actor_id, requester_participant_id)
    references event_ops_membership_heads (
      workspace_id,
      event_id,
      actor_id,
      participant_id
    ) on delete restrict,
  foreign key (workspace_id, event_id, target_actor_id, target_participant_id)
    references event_ops_membership_heads (
      workspace_id,
      event_id,
      actor_id,
      participant_id
    ) on delete restrict
);

create table event_ops_relationship_pairs (
  workspace_id text not null,
  relationship_pair_id text not null,
  event_id text not null,
  request_id text not null,
  participant_pair_key text not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null,
  primary key (workspace_id, relationship_pair_id),
  unique (workspace_id, request_id),
  unique (workspace_id, event_id, participant_pair_key),
  foreign key (workspace_id, request_id)
    references event_ops_contact_requests (workspace_id, request_id) on delete restrict
);

alter table event_ops_contact_requests
  add foreign key (workspace_id, relationship_pair_id)
  references event_ops_relationship_pairs (workspace_id, relationship_pair_id)
  deferrable initially deferred;

create table event_ops_relationship_sides (
  workspace_id text not null,
  relationship_pair_id text not null,
  owner_actor_id text not null,
  other_actor_id text not null,
  contact_id text not null,
  connection_id text not null,
  side_payload jsonb not null check (jsonb_typeof(side_payload) = 'object'),
  created_at timestamptz not null,
  primary key (workspace_id, relationship_pair_id, owner_actor_id),
  unique (workspace_id, owner_actor_id, contact_id),
  unique (workspace_id, owner_actor_id, connection_id),
  check (owner_actor_id <> other_actor_id),
  foreign key (workspace_id, relationship_pair_id)
    references event_ops_relationship_pairs (
      workspace_id,
      relationship_pair_id
    ) on delete cascade
);

create table event_ops_relationship_evidence (
  workspace_id text not null,
  evidence_id text not null,
  relationship_pair_id text not null,
  owner_actor_id text not null,
  evidence_payload jsonb not null check (jsonb_typeof(evidence_payload) = 'object'),
  evidence_hash text not null,
  created_at timestamptz not null,
  primary key (workspace_id, evidence_id),
  unique (workspace_id, relationship_pair_id, owner_actor_id),
  foreign key (workspace_id, relationship_pair_id, owner_actor_id)
    references event_ops_relationship_sides (
      workspace_id,
      relationship_pair_id,
      owner_actor_id
    ) on delete cascade
);

create table event_ops_outbox (
  workspace_id text not null,
  outbox_id text not null,
  event_id text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null,
  lease_token text,
  lease_expires_at timestamptz,
  worker_id text,
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, outbox_id),
  check (
    (status = 'running' and lease_token is not null and lease_expires_at is not null and worker_id is not null)
    or
    (status <> 'running' and lease_token is null and lease_expires_at is null and worker_id is null)
  )
);

create table event_ops_audit_log (
  workspace_id text not null,
  audit_id text not null,
  event_id text not null,
  actor_id text,
  action text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  before_payload jsonb,
  after_payload jsonb,
  evidence_ids text[] not null default '{}',
  occurred_at timestamptz not null,
  primary key (workspace_id, audit_id),
  check (before_payload is null or jsonb_typeof(before_payload) = 'object'),
  check (after_payload is null or jsonb_typeof(after_payload) = 'object')
);

create index event_ops_membership_heads_event_status_idx
  on event_ops_membership_heads (workspace_id, event_id, status, participant_id);
create index event_ops_profile_heads_event_idx
  on event_ops_profile_heads (workspace_id, event_id, participant_id);
create index event_ops_generations_event_created_idx
  on event_ops_generations (workspace_id, event_id, created_at desc);
create unique index event_ops_generations_one_published_idx
  on event_ops_generations (workspace_id, event_id)
  where status = 'published';
create index event_ops_tasks_claim_idx
  on event_ops_tasks (
    workspace_id,
    generation_id,
    status,
    task_kind,
    lease_expires_at,
    created_at
  );
create index event_ops_tasks_dependencies_idx
  on event_ops_tasks using gin (depends_on_task_ids);
create index event_ops_candidates_source_rank_idx
  on event_ops_candidates (
    workspace_id,
    generation_id,
    source_participant_id,
    retrieval_rank
  );
create index event_ops_recommendations_target_idx
  on event_ops_recommendations (
    workspace_id,
    generation_id,
    target_participant_id
  );
create index event_ops_graph_edges_from_idx
  on event_ops_graph_edges (
    workspace_id,
    publication_id,
    from_participant_id,
    edge_kind
  );
create index event_ops_graph_edges_to_idx
  on event_ops_graph_edges (
    workspace_id,
    publication_id,
    to_participant_id,
    edge_kind
  );
create index event_ops_contact_requests_event_status_idx
  on event_ops_contact_requests (workspace_id, event_id, status, updated_at desc);
create index event_ops_outbox_claim_idx
  on event_ops_outbox (workspace_id, status, available_at, lease_expires_at);
create index event_ops_audit_event_idx
  on event_ops_audit_log (workspace_id, event_id, occurred_at desc);
`,
  },
  {
    name: "event-operations-v2-frozen-membership-provenance",
    version: 2,
    sql: `
alter table event_ops_events
  add column registration_migration_state text not null default 'legacy'
  check (registration_migration_state in ('legacy', 'importing', 'canonical')),
  add column registration_migration_count integer
  check (registration_migration_count is null or registration_migration_count >= 0),
  add column registration_migration_hash text,
  add column registration_migrated_at timestamptz;

alter table event_ops_profile_versions
  add column effective_at timestamptz;

update event_ops_profile_versions
set effective_at = created_at
where effective_at is null;

alter table event_ops_profile_versions
  alter column effective_at set not null;

alter table event_ops_membership_versions
  add column effective_at timestamptz;

update event_ops_membership_versions
set effective_at = created_at
where effective_at is null;

alter table event_ops_membership_versions
  alter column effective_at set not null;

alter table event_ops_generation_participants
  add column membership_version bigint not null default 1
  check (membership_version > 0);

alter table event_ops_generation_participants
  alter column membership_version drop default;

create index event_ops_profile_versions_effective_idx
  on event_ops_profile_versions (
    workspace_id, event_id, participant_id, effective_at, profile_version
  );

create index event_ops_membership_versions_effective_idx
  on event_ops_membership_versions (
    workspace_id, event_id, actor_id, effective_at, membership_version
  );
`,
  },
  {
    name: "event-operations-v3-durable-outbox-fencing",
    version: 3,
    sql: `
alter table event_ops_outbox
  add column lease_epoch bigint not null default 0
    check (lease_epoch >= 0),
  add column attempt_limit integer not null default 10
    check (attempt_limit > 0),
  add column error_code text,
  add column error_message text,
  add column completion_payload jsonb
    check (
      completion_payload is null
      or jsonb_typeof(completion_payload) = 'object'
    );

create index event_ops_generations_worker_claim_idx
  on event_ops_generations (workspace_id, status, updated_at, generation_id)
  where status in ('queued', 'running');
`,
  },
  {
    name: "event-operations-v4-generation-ai-request-fingerprint",
    version: 4,
    sql: `
alter table event_ops_generations
  add column ai_request_fingerprint text;

update event_ops_generations
set ai_request_fingerprint = 'legacy:unversioned'
where ai_request_fingerprint is null;

alter table event_ops_generations
  alter column ai_request_fingerprint set not null;
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const EVENT_OPERATIONS_SCHEMA_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

export async function runEventOperationsMigrations(
  client: EventOperationsMigrationClient,
): Promise<void> {
  await client.query(`
do $event_ops_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists event_ops_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$event_ops_bootstrap$;
`);

  for (const migration of migrations) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $event_ops_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from event_ops_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'event operations migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into event_ops_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$event_ops_migration$;
`);
  }
}
