import { createHash } from "node:crypto";

// 人脉需求匹配（RW-11，Sprint W0010）：plan_match_jobs / plan_match_candidates。
// 写法与 `migrations.ts`（W0007）相同：advisory lock + 自带 schema_migrations 表 + checksum 守卫；
// 已发布的迁移不可修改，改表只追加新版本。生产库执行需要用户单独授权（scripts/migrate-web-runtime.ts）。
//
// 任务（job）由名片批次转为 completed 的同一事务写入（business-card-ingest-v2/repository.ts）：
// - 多张名片的批次：source_kind = 'batch'，source_key = 批次 id，(workspace, actor, kind, key) 唯一，
//   并发确认最后两张、批次重放都只留一行；
// - 单张补录（一张名片的批次）：source_kind = 'day'，source_key = 东京自然日，同一天的补录并进同一行，
//   到当天结束（not_before = 次日 00:00 JST）才由 worker 统一跑一次 AI。
// ai_state 记录第二轮 AI 是否已经发起：none → started（先提交再调用）→ succeeded/failed；
// skipped = 没有可匹配的联系人／需求或未配置模型。只有 none 才会发起调用，重试永远不重复计费。
// 候选（candidate）按 (workspace, actor, 需求条目, 联系人) 唯一：同一对只提示一次，忽略后不再出现。

export interface PlanMatchingMigrationClient {
  query(text: string): Promise<unknown>;
}

interface PlanMatchingSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:plan-matching-schema";

const migrations: readonly PlanMatchingSchemaMigration[] = [
  {
    name: "plan-matching-core",
    version: 1,
    sql: `
create table plan_match_jobs (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  source_kind text not null check (source_kind in ('batch', 'day')),
  source_key text not null check (length(source_key) between 1 and 200),
  batch_ids text[] not null default '{}',
  contact_ids text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_token text,
  lease_expires_at timestamptz,
  not_before timestamptz not null default now(),
  ai_state text not null default 'none' check (ai_state in ('none', 'started', 'succeeded', 'failed', 'skipped')),
  ai_model text,
  ai_usage jsonb check (ai_usage is null or jsonb_typeof(ai_usage) = 'object'),
  rule_hits integer not null default 0 check (rule_hits >= 0),
  ai_hits integer not null default 0 check (ai_hits >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, id),
  -- 每个批次（或每个人每个东京自然日的单张补录）只有一条任务。
  unique (workspace_id, actor_id, source_kind, source_key),
  check ((status = 'running') = (lease_token is not null)),
  check ((status = 'completed') = (completed_at is not null))
);

create index plan_match_jobs_due
  on plan_match_jobs (workspace_id, not_before)
  where status in ('pending', 'running');
create index plan_match_jobs_batches on plan_match_jobs using gin (batch_ids);

create table plan_match_candidates (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  job_id text not null,
  plan_id text not null,
  need_item_id text not null,
  contact_id text not null,
  tier text not null check (tier in ('rule', 'ai')),
  strength text not null check (strength in ('strong', 'candidate')),
  reason text check (reason is null or length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, need_item_id, contact_id),
  -- 候选与任务必须属于同一个人。
  foreign key (workspace_id, actor_id, job_id)
    references plan_match_jobs (workspace_id, actor_id, id) on delete cascade,
  check ((status = 'pending') = (decided_at is null))
);

create index plan_match_candidates_pending
  on plan_match_candidates (workspace_id, actor_id, created_at)
  where status = 'pending';
create index plan_match_candidates_job on plan_match_candidates (workspace_id, job_id);
`,
  },
  {
    // 任务 ↔ 联系人 ↔ 批次的来源：同一天的单张补录并进一条任务，但审阅页只看「这一批」的联系人。
    name: "plan-matching-job-contacts",
    version: 2,
    sql: `
create table plan_match_job_contacts (
  workspace_id text not null,
  actor_id text not null,
  job_id text not null,
  contact_id text not null,
  batch_id text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, job_id, contact_id, batch_id),
  foreign key (workspace_id, actor_id, job_id)
    references plan_match_jobs (workspace_id, actor_id, id) on delete cascade
);

create index plan_match_job_contacts_batch
  on plan_match_job_contacts (workspace_id, actor_id, batch_id, contact_id);

-- 已有任务：来源未记录时按「任务里的每个联系人 × 每个批次」回填（批次任务本来就只有一个批次）。
insert into plan_match_job_contacts (workspace_id, actor_id, job_id, contact_id, batch_id)
select j.workspace_id, j.actor_id, j.id, c.contact_id, b.batch_id
from plan_match_jobs j
cross join lateral unnest(j.contact_ids) as c(contact_id)
cross join lateral unnest(j.batch_ids) as b(batch_id)
on conflict do nothing;
`,
  },
  {
    // W0017：计划维护日任务（plan-phase / plan-event-attendance / plan-event-registration）的逐任务、
    // 按东京自然日的持久领取记录。一行 = (workspace, 东京日, 任务)；running 必带租约，租约过期可被重新领取；
    // cursor 是同一天续批的位置；failure_count 到上限后当天记 failed，第二天重新开始。
    name: "plan-maintenance-daily-runs",
    version: 3,
    sql: `
create table plan_maintenance_daily_runs (
  workspace_id text not null,
  run_day date not null,
  task_name text not null check (length(task_name) between 1 and 100),
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  lease_token text,
  lease_expires_at timestamptz,
  cursor text check (cursor is null or length(cursor) <= 2000),
  run_count integer not null default 0 check (run_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (workspace_id, run_day, task_name),
  check ((status = 'running') = (lease_token is not null and lease_expires_at is not null))
);
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const PLAN_MATCHING_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

export async function runPlanMatchingMigrations(client: PlanMatchingMigrationClient): Promise<void> {
  await client.query(`
do $plan_matching_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists plan_matching_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$plan_matching_bootstrap$;
`);

  for (const migration of migrations) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $plan_matching_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from plan_matching_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'plan matching migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into plan_matching_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$plan_matching_migration$;
`);
  }
}
