/**
 * 注册漏斗表 `signup_funnel_events`。Used by: `scripts/migrate-web-runtime.ts`（不做首次使用时自动建表：生产库要用户授权）。
 * 写法同 `features/invite-codes/migrations.ts`：advisory lock + 自己的 `signup_funnel_schema_migrations` + checksum 守卫；改表只追加新版本。
 *
 * 只有步骤名、端、来源类别、时间、匿名访客标识（随机 UUID）、账号 id；没有邮箱、姓名、IP、地址。
 * 建号那一行同时有访客标识和账号 id，是两者唯一的关联。注销账号时这些行一并删除（data-rights/purge/residual.ts）。
 */
import { createHash } from "node:crypto";

export interface SignupFunnelMigrationClient {
  query(text: string): Promise<unknown>;
}

const LOCK = "orbit:signup-funnel-schema";
const MIGRATIONS = [
  {
    name: "signup-funnel-events",
    version: 1,
    sql: `
create table signup_funnel_events (
  id bigint generated always as identity primary key,
  workspace_id text not null,
  name text not null check (name in ('register_opened', 'account_created', 'email_verified',
    'onboarding_step1', 'onboarding_step2', 'onboarding_step3', 'onboarding_finished')),
  client text not null check (client in ('web', 'app')),
  source text not null check (source in ('event', 'invite', 'direct')),
  visitor_id uuid,
  user_id text check (user_id is null or length(user_id) between 1 and 200),
  occurred_at timestamptz not null default now(),
  check (case when name = 'register_opened' then visitor_id is not null and user_id is null else user_id is not null end)
);
-- 每个账号每一步只记一次；同一访客一天只记一次打开（东京日期）。
create unique index signup_funnel_events_user_step on signup_funnel_events (workspace_id, user_id, name) where user_id is not null;
create unique index signup_funnel_events_opened_day on signup_funnel_events
  (workspace_id, visitor_id, client, ((occurred_at at time zone 'Asia/Tokyo')::date)) where name = 'register_opened';
create index signup_funnel_events_time on signup_funnel_events (workspace_id, occurred_at);
`,
  },
] as const;

const checksum = (sql: string) => createHash("sha256").update(sql).digest("hex");

export async function runSignupFunnelMigrations(client: SignupFunnelMigrationClient): Promise<void> {
  await client.query(`
do $signup_funnel_bootstrap$
begin
  perform pg_advisory_xact_lock(hashtextextended('${LOCK}', 0));
  create table if not exists signup_funnel_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$signup_funnel_bootstrap$;
`);
  for (const migration of MIGRATIONS) {
    const hash = checksum(migration.sql);
    await client.query(`
do $signup_funnel_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(hashtextextended('${LOCK}', 0));
  select checksum into stored_checksum from signup_funnel_schema_migrations where version = ${migration.version};
  if stored_checksum is not null and stored_checksum <> '${hash}' then
    raise exception 'signup funnel migration % checksum mismatch', ${migration.version};
  end if;
  if stored_checksum is null then
    ${migration.sql}
    insert into signup_funnel_schema_migrations (version, name, checksum) values (${migration.version}, '${migration.name}', '${hash}');
  end if;
end
$signup_funnel_migration$;
`);
  }
}
