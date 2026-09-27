import { createHash } from "node:crypto";

// 计划的结构化存储（RW-09，Sprint W0007）：plans / plan_items / plan_log / plan_commands。
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

export async function runPlanMigrations(client: PlanMigrationClient): Promise<void> {
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

  for (const migration of migrations) {
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
