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
  {
    name: "event-operations-v5-task-attempt-telemetry",
    version: 5,
    sql: `
create table event_ops_task_attempts (
  workspace_id text not null,
  generation_id text not null,
  task_id text not null,
  task_kind text not null check (task_kind in (
    'recommendation_shard',
    'grouping_feature_shard',
    'grouping_reduce',
    'table_content_shard'
  )),
  attempt integer not null check (attempt > 0),
  retry_round integer not null check (retry_round >= 0),
  lease_epoch bigint not null check (lease_epoch > 0),
  worker_id text not null,
  participant_count integer not null check (participant_count >= 0),
  dependency_count integer not null check (dependency_count >= 0),
  eligible_at timestamptz not null,
  claimed_at timestamptz not null,
  finished_at timestamptz,
  provider_adapter_duration_ms double precision
    check (provider_adapter_duration_ms is null or provider_adapter_duration_ms >= 0),
  domain_validation_duration_ms double precision
    check (domain_validation_duration_ms is null or domain_validation_duration_ms >= 0),
  request_bytes bigint check (request_bytes is null or request_bytes >= 0),
  response_bytes bigint check (response_bytes is null or response_bytes >= 0),
  provider text,
  model text,
  outcome text check (outcome is null or outcome in (
    'completed',
    'retryable_failed',
    'terminal_failed',
    'lease_lost'
  )),
  failure_code text,
  primary key (workspace_id, task_id, attempt, lease_epoch),
  foreign key (workspace_id, task_id)
    references event_ops_tasks (workspace_id, task_id) on delete cascade,
  foreign key (workspace_id, generation_id)
    references event_ops_generations (workspace_id, generation_id) on delete cascade,
  check (eligible_at <= claimed_at),
  check (finished_at is null or claimed_at <= finished_at),
  check (
    (finished_at is null and outcome is null and failure_code is null
      and provider_adapter_duration_ms is null
      and domain_validation_duration_ms is null
      and request_bytes is null and response_bytes is null)
    or
    (finished_at is not null and outcome is not null)
  ),
  check (
    (outcome is null and failure_code is null)
    or (outcome = 'completed' and failure_code is null)
    or (outcome in ('retryable_failed', 'terminal_failed', 'lease_lost')
      and failure_code is not null)
  )
);

create index event_ops_task_attempts_generation_kind_outcome_idx
  on event_ops_task_attempts (
    workspace_id, generation_id, task_kind, outcome, claimed_at
  );
`,
  },
  {
    name: "event-operations-v6-versioned-profile-responses",
    version: 6,
    sql: `
create table event_ops_profile_response_versions (
  workspace_id text not null,
  event_id text not null,
  participant_id text not null,
  profile_version bigint not null check (profile_version > 0),
  response_id text not null,
  field_key text not null,
  visibility text not null check (visibility in (
    'event_attendees',
    'matching_only',
    'private'
  )),
  question_source text not null check (question_source in (
    'ai_adaptive',
    'legacy_unknown'
  )),
  response_payload jsonb not null
    check (jsonb_typeof(response_payload) = 'object'),
  answered_at timestamptz not null,
  created_at timestamptz not null,
  primary key (
    workspace_id, event_id, participant_id, profile_version, response_id
  ),
  unique (
    workspace_id, event_id, participant_id, profile_version, field_key
  ),
  foreign key (workspace_id, event_id, participant_id, profile_version)
    references event_ops_profile_versions (
      workspace_id,
      event_id,
      participant_id,
      profile_version
    ) on delete restrict
);

create index event_ops_profile_responses_public_lookup_idx
  on event_ops_profile_response_versions (
    workspace_id,
    event_id,
    participant_id,
    profile_version,
    visibility,
    answered_at
  );
`,
  },
  {
    name: "event-operations-v7-registration-answer-ai-policy",
    version: 7,
    sql: `
update event_ops_profile_response_versions
set visibility = 'matching_only',
    response_payload = jsonb_set(
      response_payload,
      '{visibility}',
      '"matching_only"'::jsonb,
      true
    )
where visibility = 'private'
   or response_payload ->> 'visibility' = 'private';

alter table event_ops_profile_response_versions
  drop constraint event_ops_profile_response_versions_visibility_check;

alter table event_ops_profile_response_versions
  add constraint event_ops_profile_response_versions_visibility_check
  check (visibility in ('event_attendees', 'matching_only'));
`,
  },
  {
    name: "event-operations-v8-canonical-event-core",
    version: 8,
    sql: `
alter table event_ops_events
  add column public_code text,
  add column title text,
  add column description text,
  add column venue text,
  add column timezone text,
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column lifecycle_state_v2 text,
  add column source_payload jsonb,
  add column cancelled_at timestamptz,
  add column archived_at timestamptz,
  add column event_version bigint not null default 1
    check (event_version > 0);

alter table event_ops_events
  add constraint event_ops_events_lifecycle_state_v2_check
  check (
    lifecycle_state_v2 is null
    or lifecycle_state_v2 in ('draft', 'published', 'cancelled', 'archived')
  ),
  add constraint event_ops_events_canonical_time_check
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  add constraint event_ops_events_source_payload_check
  check (source_payload is null or jsonb_typeof(source_payload) = 'object'),
  add constraint event_ops_events_cancelled_at_check
  check (cancelled_at is null or lifecycle_state_v2 = 'cancelled'),
  add constraint event_ops_events_archived_at_check
  check (archived_at is null or lifecycle_state_v2 = 'archived');

create unique index event_ops_events_public_code_unique_idx
  on event_ops_events (workspace_id, lower(btrim(public_code)))
  where public_code is not null and btrim(public_code) <> '';

create index event_ops_events_public_catalogue_idx
  on event_ops_events (
    workspace_id,
    lifecycle_state_v2,
    starts_at,
    event_id
  );

create table event_event_versions (
  workspace_id text not null,
  event_id text not null,
  event_version bigint not null check (event_version > 0),
  public_code text,
  title text,
  description text,
  venue text,
  timezone text,
  starts_at timestamptz,
  ends_at timestamptz,
  lifecycle_state_v2 text,
  source_payload jsonb,
  cancelled_at timestamptz,
  archived_at timestamptz,
  organizer_actor_id text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, event_id, event_version),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade,
  check (
    lifecycle_state_v2 is null
    or lifecycle_state_v2 in ('draft', 'published', 'cancelled', 'archived')
  ),
  check (starts_at is null or ends_at is null or starts_at < ends_at),
  check (source_payload is null or jsonb_typeof(source_payload) = 'object')
);

create table event_aliases (
  workspace_id text not null,
  normalized_alias text not null,
  alias_value text not null,
  alias_type text not null
    check (alias_type in ('event_id', 'public_code', 'legacy_route_id')),
  event_id text not null,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_id, normalized_alias),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade,
  check (normalized_alias = lower(btrim(alias_value))),
  check (btrim(alias_value) <> ''),
  check (source_payload is null or jsonb_typeof(source_payload) = 'object')
);

create index event_aliases_event_idx
  on event_aliases (workspace_id, event_id, alias_type);
`,
  },
  {
    name: "event-operations-v9-canonical-admission",
    version: 9,
    sql: `
create table event_ops_admission_policy_versions (
  workspace_id text not null,
  event_id text not null,
  policy_version bigint not null check (policy_version > 0),
  capacity integer check (capacity is null or capacity >= 0),
  admission_mode text not null
    check (admission_mode in ('instant', 'approval_required')),
  waitlist_enabled boolean not null,
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (workspace_id, event_id, policy_version),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade,
  check (registration_opens_at < registration_closes_at)
);

create table event_ops_admission_policy_heads (
  workspace_id text not null,
  event_id text not null,
  policy_version bigint not null,
  updated_at timestamptz not null,
  primary key (workspace_id, event_id),
  foreign key (workspace_id, event_id, policy_version)
    references event_ops_admission_policy_versions (
      workspace_id, event_id, policy_version
    ) on delete restrict
);

create table event_ops_admission_application_versions (
  workspace_id text not null,
  event_id text not null,
  actor_id text not null,
  application_version bigint not null check (application_version > 0),
  policy_version bigint not null check (policy_version > 0),
  status text not null check (status in (
    'pending_review', 'waitlisted', 'admitted', 'rejected', 'withdrawn'
  )),
  profile_payload jsonb not null
    check (jsonb_typeof(profile_payload) = 'object'),
  submitted_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  decision_actor_id text,
  primary key (workspace_id, event_id, actor_id, application_version),
  foreign key (workspace_id, event_id)
    references event_ops_events (workspace_id, event_id) on delete cascade,
  foreign key (workspace_id, event_id, policy_version)
    references event_ops_admission_policy_versions (
      workspace_id, event_id, policy_version
    ) on delete restrict,
  check (
    (decided_at is null and decision_actor_id is null)
    or (decided_at is not null and decision_actor_id is not null)
  )
);

create table event_ops_admission_application_heads (
  workspace_id text not null,
  event_id text not null,
  actor_id text not null,
  application_version bigint not null,
  policy_version bigint not null,
  status text not null check (status in (
    'pending_review', 'waitlisted', 'admitted', 'rejected', 'withdrawn'
  )),
  profile_payload jsonb not null
    check (jsonb_typeof(profile_payload) = 'object'),
  submitted_at timestamptz not null,
  updated_at timestamptz not null,
  decided_at timestamptz,
  decision_actor_id text,
  primary key (workspace_id, event_id, actor_id),
  foreign key (workspace_id, event_id, actor_id, application_version)
    references event_ops_admission_application_versions (
      workspace_id, event_id, actor_id, application_version
    ) on delete restrict,
  foreign key (workspace_id, event_id, policy_version)
    references event_ops_admission_policy_versions (
      workspace_id, event_id, policy_version
    ) on delete restrict,
  check (
    (decided_at is null and decision_actor_id is null)
    or (decided_at is not null and decision_actor_id is not null)
  )
);

create index event_ops_admission_application_heads_status_queue_idx
  on event_ops_admission_application_heads (
    workspace_id, event_id, status, submitted_at, actor_id
  );
`,
  },
  {
    name: "event-operations-v10-admission-membership-bridge",
    version: 10,
    sql: `
alter table event_ops_admission_policy_versions
  add column profile_edit_deadline_at timestamptz;

alter table event_ops_admission_policy_versions
  add constraint event_ops_admission_policy_versions_profile_deadline_check
  check (
    profile_edit_deadline_at is null
    or (
      registration_opens_at <= profile_edit_deadline_at
      and profile_edit_deadline_at <= registration_closes_at
    )
  );

alter table event_ops_membership_versions
  add column origin text,
  add column admission_application_version bigint;

update event_ops_membership_versions
set origin = 'legacy_registration'
where origin is null;

alter table event_ops_membership_versions
  alter column origin set not null,
  add constraint event_ops_membership_versions_origin_check
  check (origin in ('legacy_registration', 'admission_application')),
  add constraint event_ops_membership_versions_admission_origin_check
  check (
    (origin = 'legacy_registration' and admission_application_version is null)
    or
    (origin = 'admission_application' and admission_application_version is not null)
  ),
  add constraint event_ops_membership_versions_admission_application_fk
  foreign key (
    workspace_id, event_id, actor_id, admission_application_version
  ) references event_ops_admission_application_versions (
    workspace_id, event_id, actor_id, application_version
  ) on delete restrict;
`,
  },
  {
    name: "event-operations-v11-profile-repair-audit-ledger",
    version: 11,
    sql: `
create function event_ops_profile_repair_removed_paths_valid(candidate text[])
returns boolean
language sql
immutable
parallel safe
as $event_ops_profile_repair_paths$
  select coalesce(
    cardinality(candidate) > 0
    and array_ndims(candidate) = 1
    and array_position(candidate, null) is null
    and candidate <@ array[
      'participant.profileAnswers.desiredOutcome',
      'participant.profileAnswers.energyStyle',
      'participant.profileAnswers.experienceHighlight',
      'participant.profileAnswers.followUpPreference',
      'participant.profileAnswers.industry',
      'participant.profileAnswers.positioning',
      'participant.profileAnswers.targetAttendees',
      'participant.profileAnswers.valueOffered',
      'registrationProfile.answers.desiredOutcome',
      'registrationProfile.answers.energyStyle',
      'registrationProfile.answers.experienceHighlight',
      'registrationProfile.answers.followUpPreference',
      'registrationProfile.answers.industry',
      'registrationProfile.answers.positioning',
      'registrationProfile.answers.targetAttendees',
      'registrationProfile.answers.valueOffered'
    ]::text[]
    and candidate && array[
      'registrationProfile.answers.desiredOutcome',
      'registrationProfile.answers.energyStyle',
      'registrationProfile.answers.experienceHighlight',
      'registrationProfile.answers.followUpPreference',
      'registrationProfile.answers.industry',
      'registrationProfile.answers.positioning',
      'registrationProfile.answers.targetAttendees',
      'registrationProfile.answers.valueOffered'
    ]::text[]
    and not exists (
      select 1
      from unnest(candidate) as participant_candidate(path)
      where path like 'participant.profileAnswers.%'
        and replace(
          path,
          'participant.profileAnswers.',
          'registrationProfile.answers.'
        ) <> all(candidate)
    )
    and candidate = (
      select array_agg(path order by path collate "C")
      from (
        select distinct path
        from unnest(candidate) as candidate_path(path)
      ) unique_paths
    ),
    false
  )
$event_ops_profile_repair_paths$;

create table event_ops_data_repair_runs (
  workspace_id text not null
    check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  repair_id text not null
    check (
      repair_id = btrim(repair_id)
      and char_length(repair_id) between 1 and 200
    ),
  repair_type text not null
    check (repair_type in ('canonical_profile_empty_answer_v1')),
  schema_version integer not null check (schema_version > 0),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  expected_count integer not null check (expected_count > 0),
  result_hash text not null check (result_hash ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null,
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, repair_id),
  constraint event_ops_data_repair_runs_type_plan_unique
    unique (workspace_id, repair_type, plan_hash),
  check (isfinite(applied_at)),
  check (isfinite(created_at)),
  check (applied_at <= created_at),
  check (
    reverted_at is null
    or (isfinite(reverted_at) and reverted_at >= created_at)
  )
);

create table event_ops_data_repair_items (
  workspace_id text not null
    check (workspace_id = btrim(workspace_id) and workspace_id <> ''),
  repair_id text not null
    check (
      repair_id = btrim(repair_id)
      and char_length(repair_id) between 1 and 200
    ),
  event_id text not null
    check (event_id = btrim(event_id) and event_id <> ''),
  actor_id text not null
    check (actor_id = btrim(actor_id) and actor_id <> ''),
  participant_id text not null
    check (participant_id = btrim(participant_id) and participant_id <> ''),
  source_profile_version bigint not null check (source_profile_version > 0),
  target_profile_version bigint not null check (target_profile_version > 0),
  source_membership_version bigint not null check (source_membership_version > 0),
  target_membership_version bigint not null check (target_membership_version > 0),
  before_profile_hash text not null
    check (before_profile_hash ~ '^[0-9a-f]{64}$'),
  after_profile_hash text not null
    check (after_profile_hash ~ '^[0-9a-f]{64}$'),
  before_membership_hash text not null
    check (before_membership_hash ~ '^[0-9a-f]{64}$'),
  after_membership_hash text not null
    check (after_membership_hash ~ '^[0-9a-f]{64}$'),
  removed_paths text[] not null
    check (event_ops_profile_repair_removed_paths_valid(removed_paths)),
  created_at timestamptz not null default now(),
  primary key (workspace_id, repair_id, event_id, actor_id),
  constraint event_ops_data_repair_items_participant_unique
    unique (workspace_id, repair_id, event_id, participant_id),
  constraint event_ops_data_repair_items_run_fk
    foreign key (workspace_id, repair_id)
    references event_ops_data_repair_runs (workspace_id, repair_id)
    on delete restrict,
  check (target_profile_version = source_profile_version + 1),
  check (target_membership_version = source_membership_version + 1),
  check (before_profile_hash <> after_profile_hash),
  check (before_membership_hash <> after_membership_hash),
  check (isfinite(created_at))
);

create index event_ops_data_repair_items_event_actor_idx
  on event_ops_data_repair_items (
    workspace_id, event_id, actor_id, repair_id
  );

create index event_ops_data_repair_items_event_participant_idx
  on event_ops_data_repair_items (
    workspace_id, event_id, participant_id, repair_id
  );

create function event_ops_data_repair_runs_immutable_guard()
returns trigger
language plpgsql
as $event_ops_data_repair_runs_guard$
begin
  if tg_op = 'UPDATE' then
    if old.reverted_at is null
      and new.reverted_at is not null
      and isfinite(new.reverted_at)
      and new.reverted_at >= old.created_at
      and row(
        new.workspace_id,
        new.repair_id,
        new.repair_type,
        new.schema_version,
        new.plan_hash,
        new.expected_count,
        new.result_hash,
        new.applied_at,
        new.created_at
      ) is not distinct from row(
        old.workspace_id,
        old.repair_id,
        old.repair_type,
        old.schema_version,
        old.plan_hash,
        old.expected_count,
        old.result_hash,
        old.applied_at,
        old.created_at
      ) then
      return new;
    end if;
  end if;
  raise exception 'event operations data repair runs are append-only'
    using errcode = '55000';
end
$event_ops_data_repair_runs_guard$;

create trigger event_ops_data_repair_runs_immutable_row_guard
before update or delete on event_ops_data_repair_runs
for each row execute function event_ops_data_repair_runs_immutable_guard();

create trigger event_ops_data_repair_runs_immutable_truncate_guard
before truncate on event_ops_data_repair_runs
for each statement execute function event_ops_data_repair_runs_immutable_guard();

create function event_ops_data_repair_items_immutable_guard()
returns trigger
language plpgsql
as $event_ops_data_repair_items_guard$
begin
  raise exception 'event operations data repair items are append-only'
    using errcode = '55000';
end
$event_ops_data_repair_items_guard$;

create trigger event_ops_data_repair_items_immutable_row_guard
before update or delete on event_ops_data_repair_items
for each row execute function event_ops_data_repair_items_immutable_guard();

create trigger event_ops_data_repair_items_immutable_truncate_guard
before truncate on event_ops_data_repair_items
for each statement execute function event_ops_data_repair_items_immutable_guard();
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
