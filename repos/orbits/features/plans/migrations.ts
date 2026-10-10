import { createHash } from "node:crypto";

// 计划的结构化存储（RW-09，Sprint W0007）：plans / plan_items / plan_log / plan_commands；
// R22 v2：plan_intakes / plan_drafts / plan_revisions / plan_flow_commands 与 plans、plan_items 的新列。
// 迁移写法沿用 business-card-ingest-v2：advisory lock + 自带 schema_migrations 表 + checksum 守卫。
// 已发布的迁移不可修改（checksum 变化会报错）；改表只追加新版本。
// 生产库执行需要用户单独授权；入口是 scripts/migrate-web-runtime.ts。

export interface PlanMigrationClient {
  query(text: string): Promise<unknown>;
}

interface PlanSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:plans-schema";

const migrations: readonly PlanSchemaMigration[] = [
  {
    name: "plans-core",
    version: 1,
    sql: `
create table plans (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  version integer not null check (version > 0),
  status text not null check (status in ('active', 'archived')),
  goal_snapshot text not null,
  horizon text not null check (horizon in ('month', 'quarter', 'year')),
  starts_on date not null,
  analysis jsonb not null default '{}'::jsonb check (jsonb_typeof(analysis) = 'object'),
  phases jsonb not null default '[]'::jsonb check (jsonb_typeof(phases) = 'array'),
  source_session_id text,
  previous_plan_id text,
  creation_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, id),
  unique (workspace_id, actor_id, version),
  check ((status = 'archived') = (archived_at is not null))
);

-- 每个用户同一时间只有一份生效计划（服务层另有按 actor 的 advisory lock，这里是最后一道防线）。
create unique index plans_one_active_per_actor
  on plans (workspace_id, actor_id)
  where status = 'active';
create unique index plans_creation_key
  on plans (workspace_id, actor_id, creation_key)
  where creation_key is not null;

create table plan_items (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  plan_id text not null,
  kind text not null check (kind in ('action', 'network_need', 'info', 'event')),
  phase text,
  title text not null check (length(title) between 1 and 500),
  detail text,
  suggested_week integer check (suggested_week is null or suggested_week between 1 and 60),
  status text not null,
  linked_contact_ids text[] not null default '{}',
  contact_links jsonb not null default '[]'::jsonb check (jsonb_typeof(contact_links) = 'array'),
  linked_event_id text,
  answer text,
  criteria jsonb,
  sort_key integer not null,
  deferral_count integer not null default 0 check (deferral_count >= 0),
  completed_at timestamptz,
  carried_from_item_id text,
  meta jsonb not null default '{}'::jsonb check (jsonb_typeof(meta) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  -- 进展记录与命令回执按 (人, 计划, 条目) 复合引用条目，跨用户、跨计划的引用在库里就会失败。
  unique (workspace_id, actor_id, plan_id, id),
  -- 条目与计划必须属于同一个人。
  foreign key (workspace_id, actor_id, plan_id)
    references plans (workspace_id, actor_id, id) on delete cascade,
  check (
    (kind = 'action' and status in ('not_started', 'in_progress', 'done'))
    or (kind = 'network_need' and status in ('open', 'linked', 'established'))
    or (kind = 'info' and status in ('open', 'answered'))
    or (kind = 'event' and status in ('recommended', 'registered', 'attended'))
  ),
  check (kind <> 'event' or linked_event_id is not null),
  check (kind <> 'info' or ((status = 'answered') = (answer is not null))),
  check (kind <> 'action' or ((status = 'done') = (completed_at is not null))),
  check (kind = 'network_need' or criteria is null)
);

create index plan_items_plan on plan_items (workspace_id, plan_id, sort_key);
create index plan_items_contacts on plan_items using gin (linked_contact_ids);
create index plan_items_event on plan_items (workspace_id, actor_id, linked_event_id)
  where linked_event_id is not null;

create table plan_log (
  workspace_id text not null,
  id text not null,
  seq bigint generated always as identity,
  actor_id text not null,
  plan_id text not null,
  item_id text,
  kind text not null check (kind in ('auto', 'manual')),
  event text not null check (length(event) between 1 and 64),
  author text not null check (author in ('user', 'system')),
  body text not null check (length(body) between 1 and 2000),
  linked_contact_ids text[] not null default '{}',
  linked_event_id text,
  target_item_id text,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, idempotency_key),
  unique (workspace_id, actor_id, plan_id, id),
  foreign key (workspace_id, actor_id, plan_id)
    references plans (workspace_id, actor_id, id) on delete cascade,
  foreign key (workspace_id, actor_id, plan_id, item_id)
    references plan_items (workspace_id, actor_id, plan_id, id) on delete cascade,
  foreign key (workspace_id, actor_id, plan_id, target_item_id)
    references plan_items (workspace_id, actor_id, plan_id, id) on delete cascade,
  check (kind <> 'manual' or event = 'note')
);

create index plan_log_plan on plan_log (workspace_id, plan_id, seq desc);
create index plan_log_contacts on plan_log using gin (linked_contact_ids);

-- 命令回执：每个带幂等键的请求（含无变化的请求）在同一事务里留一条，绑定条目与请求指纹。
create table plan_commands (
  workspace_id text not null,
  actor_id text not null,
  idempotency_key text not null,
  kind text not null check (kind in ('item_change', 'manual_log')),
  plan_id text not null,
  item_id text,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('applied', 'noop')),
  log_id text,
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_id, idempotency_key),
  foreign key (workspace_id, actor_id, plan_id)
    references plans (workspace_id, actor_id, id) on delete cascade,
  foreign key (workspace_id, actor_id, plan_id, item_id)
    references plan_items (workspace_id, actor_id, plan_id, id) on delete cascade,
  foreign key (workspace_id, actor_id, plan_id, log_id)
    references plan_log (workspace_id, actor_id, plan_id, id) on delete cascade,
  check ((outcome = 'applied') = (log_id is not null)),
  check (kind <> 'item_change' or item_id is not null)
);
`,
  },
  {
    // R22（计划 v2.2，sprints/plan-v2.2/DESIGN.md §3.2）：一个目标一份计划（原地更新、revision 乐观并发）、
    // 生成前的 plan_intakes、确定前的 plan_drafts、确定后的改动记录 plan_revisions、生成流程的命令回执。
    // v1 行为不变：新列都有默认值或可空，旧行满足新约束；唯一索引按 coalesce(goal_id, 'legacy') 分桶，v1 仍每人一份。
    name: "plans-v2-model",
    version: 2,
    sql: `
-- R22（计划 v2.2，DESIGN §3.2）：一个目标一份计划、原地更新；生成前的 intake、确定前的草稿、确定后的改动记录。
-- v1 计划（model_version = 1）的行为不变：默认值让旧行满足新约束，唯一索引按 coalesce(goal_id, 'legacy') 分桶。
alter table plans
  add column model_version smallint not null default 1 check (model_version in (1, 2)),
  add column goal_id text,
  add column goal_kind text check (goal_kind is null or goal_kind in ('launch', 'fundraising', 'sales', 'hiring', 'partnership', 'career')),
  add column purpose_text text check (purpose_text is null or length(purpose_text) between 1 and 2000),
  add column purpose_level smallint check (purpose_level is null or purpose_level between 1 and 4),
  add column premise jsonb check (premise is null or jsonb_typeof(premise) = 'array'),
  add column event_allocation smallint check (event_allocation is null or (event_allocation between 0 and 100 and event_allocation % 5 = 0)),
  add column event_target_count smallint check (event_target_count is null or event_target_count between 1 and 10),
  add column revision integer not null default 1 check (revision >= 1),
  add column manual_edit_available boolean not null default false,
  add column achieved_at timestamptz,
  add column last_opened_at timestamptz;

alter table plans add constraint plans_v2_goal_check
  check (model_version = 1 or (goal_id is not null and goal_kind is not null and event_allocation is not null and event_target_count is not null));
alter table plans add constraint plans_achieved_check
  check (achieved_at is null or (status = 'archived' and model_version = 2));

-- 放宽 horizon：v1 必填（旧值不变），v2 为空。按定义找旧 CHECK，不依赖默认约束名。
-- 注意 is not null：CHECK 遇到 NULL 结果为 unknown 会放行，所以 v1 的「必填」要显式写出来。
declare
  horizon_check record;
begin
  for horizon_check in
    select conname from pg_constraint
    where conrelid = 'plans'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%horizon%'
  loop
    execute format('alter table plans drop constraint %I', horizon_check.conname);
  end loop;
end;
alter table plans alter column horizon drop not null;
alter table plans add constraint plans_horizon_by_model_check
  check ((model_version = 1 and horizon is not null and horizon in ('month', 'quarter', 'year')) or (model_version = 2 and horizon is null));

-- 每个目标一份生效计划（v1 都在 'legacy' 桶里，仍然每人一份）。服务层另限同时生效的 v2 目标 ≤ 2。
drop index plans_one_active_per_actor;
create unique index plans_one_active_per_goal
  on plans (workspace_id, actor_id, coalesce(goal_id, 'legacy'))
  where status = 'active';

alter table plan_items
  add column allocation smallint check (allocation is null or (allocation between 0 and 100 and allocation % 5 = 0)),
  add column skipped_at timestamptz,
  add column type_slot text check (type_slot is null or length(type_slot) between 1 and 40);
alter table plan_items add constraint plan_items_skipped_kind_check
  check (skipped_at is null or kind = 'network_need');

create table plan_intakes (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  source text not null check (source in ('task', 'onboarding', 'next_goal', 'iorbit')),
  goal_text text not null check (length(goal_text) between 1 and 2000),
  goal_kind text not null check (goal_kind in ('launch', 'fundraising', 'sales', 'hiring', 'partnership', 'career')),
  status text not null default 'drafting' check (status in ('drafting', 'background', 'questions', 'premise', 'drafted', 'planned', 'abandoned')),
  background jsonb not null default '{}'::jsonb check (jsonb_typeof(background) = 'object'),
  ladder jsonb check (ladder is null or jsonb_typeof(ladder) = 'object'),
  questions jsonb check (questions is null or jsonb_typeof(questions) = 'object'),
  answers jsonb check (answers is null or jsonb_typeof(answers) = 'object'),
  premise jsonb check (premise is null or jsonb_typeof(premise) = 'array'),
  ai_steps jsonb not null default '{}'::jsonb check (jsonb_typeof(ai_steps) = 'object'),
  plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, id),
  foreign key (workspace_id, actor_id, plan_id) references plans (workspace_id, actor_id, id),
  check ((status = 'planned') = (plan_id is not null))
);
create index plan_intakes_open on plan_intakes (workspace_id, actor_id, updated_at desc)
  where status not in ('planned', 'abandoned');

create table plan_drafts (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  kind text not null check (kind in ('initial', 'review')),
  intake_id text,
  plan_id text,
  base_revision integer check (base_revision is null or base_revision >= 1),
  status text not null default 'open' check (status in ('open', 'confirmed', 'discarded')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  origin_content jsonb not null check (jsonb_typeof(origin_content) = 'object'),
  premise jsonb check (premise is null or jsonb_typeof(premise) = 'array'),
  ai_fix_used smallint not null default 0 check (ai_fix_used between 0 and 3),
  manual_edit_used boolean not null default false,
  turns jsonb not null default '[]'::jsonb check (jsonb_typeof(turns) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, id),
  foreign key (workspace_id, actor_id, intake_id) references plan_intakes (workspace_id, actor_id, id),
  foreign key (workspace_id, actor_id, plan_id) references plans (workspace_id, actor_id, id) on delete cascade,
  check ((kind = 'initial' and intake_id is not null) or (kind = 'review' and plan_id is not null and base_revision is not null)),
  check ((status = 'confirmed') = (confirmed_at is not null))
);
create unique index plan_drafts_one_open_review
  on plan_drafts (workspace_id, actor_id, plan_id)
  where kind = 'review' and status = 'open';

create table plan_revisions (
  workspace_id text not null,
  id text not null,
  actor_id text not null,
  plan_id text not null,
  from_revision integer not null check (from_revision >= 1),
  to_revision integer not null check (to_revision = from_revision + 1),
  source text not null check (source in ('review', 'manual_edit', 'goal_edit', 'undo')),
  draft_id text,
  before jsonb not null check (jsonb_typeof(before) = 'object'),
  after jsonb not null check (jsonb_typeof(after) = 'object'),
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, plan_id, to_revision),
  foreign key (workspace_id, actor_id, plan_id) references plans (workspace_id, actor_id, id) on delete cascade
);

create table plan_flow_commands (
  workspace_id text not null,
  actor_id text not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 300),
  kind text not null check (length(kind) between 1 and 64),
  intake_id text,
  draft_id text,
  plan_id text,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('applied', 'noop')),
  response jsonb not null default '{}'::jsonb check (jsonb_typeof(response) = 'object'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_id, idempotency_key)
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

export const PLAN_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

/** R22：测试可以只跑前几个版本（证明在旧数据上升级可行）。生产入口只用默认的全部迁移。 */
export const PLAN_SCHEMA_MIGRATIONS: readonly PlanSchemaMigration[] = migrations;

export async function runPlanMigrations(client: PlanMigrationClient, override: readonly PlanSchemaMigration[] = migrations): Promise<void> {
  await client.query(`
do $plans_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists plans_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$plans_bootstrap$;
`);

  for (const migration of override) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $plans_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from plans_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'plans migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into plans_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$plans_migration$;
`);
  }
}
