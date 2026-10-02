import { createHash } from "node:crypto";

// W0051：每人洞察读模型 `contact_insights`（按 actor × contact 一行）。
// 写法与 `features/plans/migrations.ts` 相同：advisory lock + 自带 schema_migrations 表 + checksum 守卫；
// 已发布的迁移不可修改，改表只追加新版本。生产库执行需要用户单独授权（scripts/migrate-web-runtime.ts）。
//
// - status：pending 等生成／ready 已生成／failed 生成失败／blocked_no_goal 没有关系目标（不调用模型）；
// - dirty_at／dirty_reasons：待更新标记（补全、memo、计划关联、目标、手动）；部分索引只覆盖待更新行；
// - deferred_until：后台池额度用尽时顺延到下一东京日 00:00；
// - ai_state + lease_owner／lease_expires_at／claimed_at：调用前先以 CAS 提交 started（领取租约），只有领到的执行器
//   能调用模型；进程中途退出的 started 行不自动重调，由维护任务标 failed 等下一次待更新；
// - goal_hash：生成时关系目标的哈希（读取时与当前目标比对，不同显示「目标已更新」）。

export interface ContactInsightsMigrationClient {
  query(text: string): Promise<unknown>;
}

interface ContactInsightsSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:contact-insights-schema";

const migrations: readonly ContactInsightsSchemaMigration[] = [
  {
    name: "contact-insights-core",
    version: 1,
    sql: `
create table contact_insights (
  workspace_id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  contact_id text not null check (length(contact_id) between 1 and 512),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'blocked_no_goal')),
  goal_relation jsonb check (goal_relation is null or jsonb_typeof(goal_relation) = 'object'),
  next_step jsonb check (next_step is null or jsonb_typeof(next_step) = 'object'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  relevance smallint check (relevance is null or relevance between 0 and 100),
  source_data_version text,
  goal_hash text,
  dirty_at timestamptz,
  dirty_reasons text[] not null default '{}',
  deferred_until timestamptz,
  ai_state text not null default 'none' check (ai_state in ('none', 'started', 'done')),
  lease_owner text,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  usage jsonb,
  model text,
  generated_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, actor_id, contact_id),
  check ((ai_state = 'started') = (lease_owner is not null and lease_expires_at is not null))
);

-- 「洞察」标签的排序与分页。
create index contact_insights_relevance
  on contact_insights (workspace_id, actor_id, relevance desc, contact_id);

-- 维护任务只扫待更新行。
create index contact_insights_dirty
  on contact_insights (workspace_id, dirty_at, actor_id)
  where dirty_at is not null;
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const CONTACT_INSIGHTS_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

/** 测试用：可以换一组迁移（证明改了已发布 SQL 会报 checksum）。 */
export async function runContactInsightsMigrations(
  client: ContactInsightsMigrationClient,
  override: readonly ContactInsightsSchemaMigration[] = migrations,
): Promise<void> {
  await client.query(`
do $contact_insights_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists contact_insights_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$contact_insights_bootstrap$;
`);

  for (const migration of override) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $contact_insights_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from contact_insights_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'contact insights migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into contact_insights_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$contact_insights_migration$;
`);
  }
}

/** 测试用：当前迁移定义（只读副本）。 */
export function contactInsightsMigrationDefinitions(): readonly ContactInsightsSchemaMigration[] {
  return migrations.map((migration) => ({ ...migration }));
}
