/**
 * R26 迁移「event-assessments-core」（events DESIGN §3.1、§5「执行方式」）。Owner: 甲 (R26).
 * Used by: `features/events/assessment/configured.ts`（首次使用时以 advisory lock 幂等执行）、`scripts/migrate-web-runtime.ts`。
 *
 * 写法同 `features/invite-codes/migrations.ts`：advisory lock + 模块自己的 `event_assessments_schema_migrations` + checksum 守卫，
 * 已发布的迁移不可修改（checksum 变化会报错），改表只追加新版本。**生产库执行需要用户单独授权**（DESIGN §11 / 复核 A4）。
 *
 * - `event_assessments`：一行 = 一次评估（库内活动 `orbit_event` 或外部活动 url / poster / text / manual）。
 *   外部活动不进活动表：这一行本身就是那场外部活动，计划条目引用 `assessment:<id>`（复核 S1）。
 * - 不存页面全文、抓取 HTML：只存事实、分数与说明（DESIGN §9 #9）。
 * - `event_assessment_posters`：海报 / 截图的短期上传资产（结果页缩略图；7 天后由维护任务清理）。
 * - 异步执行（复核 M5）：`status = reading` 且 `lease_until` 为空或已过期的行可被处理器认领；`attempts` 记认领次数。
 * - `source_host`：URL 的主机名（每人每分钟 ≤10 次、主机级每分钟 ≤30 次的限速按这张表计数，serverless 下共享，§9 #23）。
 * - 幂等：`(workspace_id, actor_id, idempotency_key)` 唯一；同一来源同一评分版本 `(… source_digest, rubric_version)` 唯一。
 */
import { createHash } from "node:crypto";

export interface EventAssessmentMigrationClient {
  query(text: string): Promise<unknown>;
}

interface EventAssessmentSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:event-assessments-schema";

const migrations: readonly EventAssessmentSchemaMigration[] = [
  {
    name: "event-assessments-core",
    version: 1,
    sql: `
create table event_assessments (
  workspace_id text not null,
  id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  source_kind text not null check (source_kind in ('url', 'poster', 'text', 'manual', 'orbit_event')),
  source_url text check (source_url is null or length(source_url) <= 2048),
  source_host text check (source_host is null or length(source_host) <= 255),
  source_digest text not null check (length(source_digest) between 1 and 200),
  poster_asset_ids text[] not null default '{}',
  event_id text check (event_id is null or length(event_id) <= 200),
  facts jsonb not null default '{}'::jsonb,
  fact_basis jsonb not null default '{}'::jsonb,
  score_breakdown jsonb not null default '[]'::jsonb,
  view jsonb not null default '{}'::jsonb,
  total smallint not null default 0 check (total between 0 and 100),
  total_min smallint check (total_min is null or total_min between 0 and 100),
  total_max smallint check (total_max is null or total_max between 0 and 100),
  verdict text not null default 'conditional' check (verdict in ('recommend', 'conditional', 'skip')),
  rubric_version text not null,
  status text not null default 'reading' check (status in ('reading', 'ready', 'needs_input', 'failed')),
  failure_reason text check (failure_reason is null or failure_reason in (
    'login_required', 'not_event_page', 'unreadable', 'fetch_failed', 'too_large', 'blocked_host', 'ai_unavailable', 'quota_exceeded', 'timeout'
  )),
  missing_fields text[] not null default '{}',
  user_filled_fields text[] not null default '{}',
  page_candidates jsonb,
  user_decision text check (user_decision is null or user_decision in ('added', 'dismissed')),
  plan_item_id text,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  prompt_version text,
  ai_operation_id text,
  read_ms integer check (read_ms is null or read_ms >= 0),
  lease_until timestamptz,
  attempts smallint not null default 0 check (attempts >= 0),
  attendee_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  facts_refreshed_at timestamptz,
  primary key (workspace_id, id),
  check (source_kind <> 'orbit_event' or event_id is not null),
  check (total_min is null or total_max is null or total_min <= total_max)
);

create unique index event_assessments_idempotency on event_assessments (workspace_id, actor_id, idempotency_key);
create unique index event_assessments_source on event_assessments (workspace_id, actor_id, source_digest, rubric_version);
create index event_assessments_actor_list on event_assessments (workspace_id, actor_id, total desc, created_at desc);
create index event_assessments_reading on event_assessments (workspace_id, lease_until) where status = 'reading';
create index event_assessments_event on event_assessments (workspace_id, event_id) where event_id is not null;
create index event_assessments_fetch_window on event_assessments (workspace_id, created_at) where source_kind = 'url';

create table event_assessment_posters (
  workspace_id text not null,
  id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  byte_size integer not null check (byte_size between 1 and 6291456),
  digest text not null check (length(digest) = 64),
  bytes bytea not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index event_assessment_posters_actor on event_assessment_posters (workspace_id, actor_id, created_at);
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const EVENT_ASSESSMENT_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

export const EVENT_ASSESSMENT_SCHEMA_MIGRATIONS: readonly EventAssessmentSchemaMigration[] = migrations;

/** 测试用：可以换一组迁移（证明改了已发布 SQL 会报 checksum）。 */
export async function runEventAssessmentMigrations(
  client: EventAssessmentMigrationClient,
  override: readonly EventAssessmentSchemaMigration[] = migrations,
): Promise<void> {
  await client.query(`
do $event_assessments_bootstrap$
begin
  perform pg_advisory_xact_lock(hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0));
  create table if not exists event_assessments_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$event_assessments_bootstrap$;
`);
  for (const migration of override) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $event_assessments_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0));
  select checksum into stored_checksum from event_assessments_schema_migrations where version = ${migration.version};
  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'event assessments migration % checksum mismatch', ${migration.version};
  end if;
  if stored_checksum is null then
    ${migration.sql}
    insert into event_assessments_schema_migrations (version, name, checksum)
    values (${migration.version}, ${sqlLiteral(migration.name)}, ${sqlLiteral(migrationChecksum)});
  end if;
end
$event_assessments_migration$;
`);
  }
}
