import { createHash } from "node:crypto";

// 名片批量摄取 V2 专用表。迁移模式沿用 event-operations（advisory lock + checksum 守卫）。
// 设计方案：docs/superpowers/plans/2026-08-31-business-card-batch-ingest-v2.md (v2.4)

export interface IngestMigrationClient {
  query(text: string): Promise<unknown>;
}

interface IngestSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:business-card-ingest-v2-schema";

const migrations: readonly IngestSchemaMigration[] = [
  {
    name: "business-card-ingest-v2-core",
    version: 1,
    sql: `
create table bc_ingest_batches (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  status text not null check (status in (
    'collecting', 'processing', 'ready_for_review',
    'completed', 'cancelled', 'expired'
  )),
  expected_items integer not null check (expected_items > 0 and expected_items <= 100),
  version bigint not null default 1 check (version > 0),
  review_generation bigint not null default 0 check (review_generation >= 0),
  idempotency_key text not null,
  manifest_fingerprint text not null,
  ingest_version text not null default 'v2',
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  expires_at timestamptz not null,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, idempotency_key),
  check (status <> 'collecting' or finalized_at is null),
  check (status not in ('processing', 'ready_for_review') or finalized_at is not null)
);

create index bc_ingest_batches_actor
  on bc_ingest_batches (workspace_id, actor_id, created_at desc);

create table bc_ingest_items (
  workspace_id text not null,
  id text not null,
  batch_id text not null,
  seq integer not null check (seq >= 1),
  status text not null check (status in (
    'awaiting_upload', 'uploaded', 'excluded', 'queued', 'processing',
    'extracted', 'terminal_failed', 'confirmed', 'skipped'
  )),
  version bigint not null default 1 check (version > 0),
  source_file_name text not null,
  raw_size bigint not null check (raw_size > 0),
  raw_mime_type text not null,
  client_digest text not null,
  image_digest text,
  derivative_object_key text,
  derivative_size bigint,
  extraction jsonb,
  extraction_schema_version integer,
  review_issues jsonb not null default '[]'::jsonb,
  usage jsonb,
  confirmed_contact_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  lease_token text,
  lease_expires_at timestamptz,
  error_stage text check (error_stage in ('normalize', 'ocr', 'lease')),
  error_code text check (error_code in (
    'IMAGE_INVALID', 'OCR_PROVIDER_FAILED', 'OCR_PROVIDER_TIMEOUT',
    'OCR_INVALID_OUTPUT', 'LEASE_EXHAUSTED'
  )),
  provider_request_id text,
  trace_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, batch_id, seq),
  foreign key (workspace_id, batch_id)
    references bc_ingest_batches (workspace_id, id) on delete cascade,
  -- 局部不变量（方案 §三）。跨表不变量（awaiting_upload/uploaded 仅存在于
  -- collecting 批次）由 repository 唯一事务入口 + 竞争测试保证，不用 CHECK。
  check (status <> 'queued' or next_retry_at is not null),
  check ((status = 'processing') = (lease_token is not null)),
  check ((status = 'processing') = (lease_expires_at is not null)),
  check (status <> 'confirmed' or confirmed_contact_id is not null),
  check (status not in ('uploaded', 'queued', 'processing', 'extracted')
         or derivative_object_key is not null),
  check (status <> 'extracted' or extraction is not null)
);

create index bc_ingest_items_batch_status
  on bc_ingest_items (workspace_id, batch_id, status);
create index bc_ingest_items_claim
  on bc_ingest_items (workspace_id, status, next_retry_at);
create index bc_ingest_items_lease_expiry
  on bc_ingest_items (workspace_id, lease_expires_at)
  where status = 'processing';

create table bc_ingest_notifications (
  workspace_id text not null,
  batch_id text not null,
  event_type text not null,
  review_generation bigint not null,
  actor_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'superseded')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (workspace_id, batch_id, event_type, review_generation)
);

create index bc_ingest_notifications_pending
  on bc_ingest_notifications (workspace_id, created_at)
  where status = 'pending';

create table bc_ingest_cleanup_tasks (
  workspace_id text not null,
  id bigint generated always as identity,
  object_key text not null,
  batch_id text,
  status text not null default 'pending' check (status in ('pending', 'done')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  primary key (workspace_id, id)
);

create index bc_ingest_cleanup_pending
  on bc_ingest_cleanup_tasks (workspace_id, next_attempt_at)
  where status = 'pending';
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const BUSINESS_CARD_INGEST_V2_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

export async function runBusinessCardIngestV2Migrations(
  client: IngestMigrationClient,
): Promise<void> {
  await client.query(`
do $bc_ingest_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists bc_ingest_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$bc_ingest_bootstrap$;
`);

  for (const migration of migrations) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $bc_ingest_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from bc_ingest_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'business card ingest v2 migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into bc_ingest_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$bc_ingest_migration$;
`);
  }
}
