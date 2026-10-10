import { createHash } from "node:crypto";

// W0048a：人脉分析快照、后台任务与两池 AI 配额账本（按操作计次 + 每次 HTTP 一条成本子账）。
// 写法与 `features/plans/matching-migrations.ts` 相同：advisory lock + 自带 schema_migrations 表 + checksum 守卫；
// 已发布的迁移不可修改，改表只追加新版本。生产库执行需要用户单独授权（scripts/migrate-web-runtime.ts，W48-9）。
//
// - ai_usage_ledger：一行 = 一次操作（额度只数这张表；released 不计次）；
// - ai_usage_calls：一行 = 一次供应商 HTTP（成本、调用次数、token 按 operation_id 聚合）；
// - network_analysis_snapshots：每人每版一行，部分唯一索引保证每人恰好一份 current，保留最近 12 版；
// - network_analysis_jobs：后台任务（快照自动重算／补全顺延），每人每种一行，完成即删。

export interface NetworkAnalysisMigrationClient {
  query(text: string): Promise<unknown>;
}

interface NetworkAnalysisSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:network-analysis-schema";

const migrations: readonly NetworkAnalysisSchemaMigration[] = [
  {
    name: "network-analysis-core",
    version: 1,
    sql: `
create table ai_usage_ledger (
  workspace_id text not null,
  id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  usage_day date not null,
  pool text not null check (pool in ('user', 'background', 'system')),
  purpose text not null check (purpose in ('plan', 'plan_refine', 'snapshot', 'memo_extraction', 'insight', 'enrichment')),
  trigger text not null check (trigger in ('auto', 'manual', 'plan')),
  idempotency_key text not null check (length(idempotency_key) between 1 and 300),
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed', 'released')),
  max_calls integer not null check (max_calls between 1 and 20),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, idempotency_key),
  check ((status = 'reserved') = (finished_at is null))
);

-- 额度计数：按人、东京日、池数「未释放」的操作。
create index ai_usage_ledger_day
  on ai_usage_ledger (workspace_id, actor_id, usage_day, pool)
  where status <> 'released';

create table ai_usage_calls (
  workspace_id text not null,
  operation_id text not null,
  seq integer not null check (seq >= 1),
  provider text not null check (length(provider) between 1 and 100),
  model text not null check (length(model) between 1 and 200),
  status text not null default 'started' check (status in ('started', 'responded', 'no_response')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (workspace_id, operation_id, seq),
  foreign key (workspace_id, operation_id) references ai_usage_ledger (workspace_id, id) on delete cascade,
  check ((status = 'started') = (ended_at is null)),
  check ((status = 'responded') = (input_tokens is not null and output_tokens is not null))
);

create table network_analysis_snapshots (
  workspace_id text not null,
  id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  version integer not null check (version >= 1),
  status text not null check (status in ('current', 'superseded')),
  origin text not null check (origin in ('plan', 'standalone')),
  plan_id text,
  trigger text not null check (trigger in ('first', 'threshold', 'goal_changed', 'manual', 'plan')),
  source_data_version text not null check (source_data_version ~ '^[0-9a-f]{64}$'),
  goal_digest text not null check (goal_digest ~ '^[0-9a-f]{64}$'),
  included_contact_ids text[] not null default '{}',
  contact_count integer not null check (contact_count >= 0),
  narrative_zh jsonb not null check (jsonb_typeof(narrative_zh) = 'array'),
  narrative_en jsonb not null check (jsonb_typeof(narrative_en) = 'array'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  provider text not null check (provider in ('deepseek', 'mock')),
  model text not null check (length(model) between 1 and 200),
  prompt_version text not null check (length(prompt_version) between 1 and 100),
  operation_id text,
  generated_at timestamptz not null,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, version),
  check ((origin = 'plan') = (plan_id is not null)),
  check (contact_count = cardinality(included_contact_ids))
);

create unique index network_analysis_snapshots_one_current
  on network_analysis_snapshots (workspace_id, actor_id)
  where status = 'current';

create table network_analysis_jobs (
  workspace_id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  kind text not null check (kind in ('snapshot', 'enrichment')),
  status text not null default 'pending' check (status in ('pending', 'running', 'deferred')),
  trigger text,
  not_before timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  operation_id text,
  contact_ids text[] not null default '{}' check (cardinality(contact_ids) <= 200),
  source_key text check (source_key is null or length(source_key) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, actor_id, kind),
  check ((status = 'running') = (lease_owner is not null and lease_expires_at is not null)),
  check (kind = 'enrichment' or cardinality(contact_ids) = 0)
);

create index network_analysis_jobs_due
  on network_analysis_jobs (workspace_id, not_before)
  where status in ('pending', 'running', 'deferred');
`,
  },
  {
    // W0048a review P2-1：同键重开（released → reserved）开启新的 epoch；max_calls 只按当前 epoch 的全部子账
    // （含 no_response）严格计数，历史子账保留。
    name: "ai-usage-reservation-epoch",
    version: 2,
    sql: `
alter table ai_usage_ledger add column epoch integer not null default 1 check (epoch >= 1);
alter table ai_usage_calls add column epoch integer not null default 1 check (epoch >= 1);
create index ai_usage_calls_operation_epoch on ai_usage_calls (workspace_id, operation_id, epoch);
`,
  },
  {
    // R22（计划 v2.2 DESIGN §3.3）：放宽 purpose。每种 max_calls 不同的计划调用一个用途（账本按用途取 max_calls），
    // 另加 R26 要用的 event_assessment（同一个人负责，合进一次生产授权）。按定义找约束名，不依赖默认名。
    name: "ai-usage-plan-v2-purposes",
    version: 3,
    sql: `
declare
  purpose_check record;
begin
  for purpose_check in
    select conname from pg_constraint
    where conrelid = 'ai_usage_ledger'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%purpose%'
  loop
    execute format('alter table ai_usage_ledger drop constraint %I', purpose_check.conname);
  end loop;
  alter table ai_usage_ledger add constraint ai_usage_ledger_purpose_check
    check (purpose in ('plan', 'plan_refine', 'snapshot', 'memo_extraction', 'insight', 'enrichment',
      'plan_intake', 'plan_background', 'plan_draft', 'plan_revise', 'plan_review_mark', 'plan_review', 'event_assessment'));
end;
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const NETWORK_ANALYSIS_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

/** 测试用：可以换一组迁移（证明改了已发布 SQL 会报 checksum）。 */
export async function runNetworkAnalysisMigrations(
  client: NetworkAnalysisMigrationClient,
  override: readonly NetworkAnalysisSchemaMigration[] = migrations,
): Promise<void> {
  await client.query(`
do $network_analysis_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists network_analysis_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$network_analysis_bootstrap$;
`);

  for (const migration of override) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $network_analysis_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from network_analysis_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'network analysis migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into network_analysis_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$network_analysis_migration$;
`);
  }
}

/** 测试用：当前迁移定义（只读副本）。 */
export function networkAnalysisMigrationDefinitions(): readonly NetworkAnalysisSchemaMigration[] {
  return migrations.map((migration) => ({ ...migration }));
}
