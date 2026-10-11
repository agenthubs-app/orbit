/**
 * R15 迁移「invite-codes-core」（DESIGN add-and-invite §3.2）。Owner: 甲 (R15).
 * Used by: `features/invite-codes/configured.ts`（首次使用时以 advisory lock 幂等执行）、`scripts/migrate-web-runtime.ts`。
 *
 * 写法同 `features/plans/migrations.ts`：advisory lock + 模块自己的 `invite_codes_schema_migrations` + checksum 守卫，
 * 已发布的迁移不可修改（checksum 变化会报错），改表只追加新版本。生产库执行需要用户单独授权。
 *
 * - `invite_codes`：码（存去掉连字符的 8 位规范形式，全局唯一）、发码时选择共享的字段键（值用的时候从资料读）、
 *   用量（`used_count ≤ max_uses ≤ 10`）、期限、作废 / 被替换；部分唯一索引保证「每人同时只有 1 个可用码」。
 * - `invite_connections`：连接本身（两边联系人 id、各自共享的键、各自「上次同步的值」、解除）；部分唯一索引保证
 *   「同一对人只有一条生效连接」，解除后再连 = 新的一行。
 * - `invite_code_attempts`：公开预览与兑换的限流计数（只存 IP / 账号的 HMAC，不存原值），超过 2 天的窗口由维护任务清理。
 */
import { createHash } from "node:crypto";

export interface InviteCodeMigrationClient {
  query(text: string): Promise<unknown>;
}

interface InviteCodeSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:invite-codes-schema";

const migrations: readonly InviteCodeSchemaMigration[] = [
  {
    name: "invite-codes-core",
    version: 1,
    sql: `
create table invite_codes (
  workspace_id text not null,
  id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  code text not null check (code ~ '^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$'),
  shared_keys text[] not null default '{}'
    check (shared_keys <@ array['organization', 'offering', 'seeking', 'email', 'phone']::text[]),
  max_uses smallint not null default 10 check (max_uses between 1 and 10),
  used_count smallint not null default 0 check (used_count >= 0 and used_count <= max_uses),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  idempotency_key text check (idempotency_key is null or length(idempotency_key) between 1 and 200),
  primary key (workspace_id, id),
  unique (code)
);

-- 每人同时只有 1 个可用码（过期的码也会在发新码时写 superseded_at，免得占住这个索引）。
create unique index invite_codes_one_usable_per_actor
  on invite_codes (workspace_id, actor_id)
  where revoked_at is null and superseded_at is null;
create unique index invite_codes_idempotency
  on invite_codes (workspace_id, actor_id, idempotency_key)
  where idempotency_key is not null;
create index invite_codes_actor_created
  on invite_codes (workspace_id, actor_id, created_at desc);

create table invite_connections (
  workspace_id text not null,
  id text not null,
  code_id text not null,
  inviter_actor_id text not null,
  redeemer_actor_id text not null,
  outcome text not null check (outcome in ('connected', 'merged')),
  -- 邀请人人脈里的兑换人 / 兑换人人脈里的邀请人。
  inviter_contact_id text not null,
  redeemer_contact_id text not null,
  -- 这条联系人是招待新建的（解除时对方那边墓碑删除）还是统合进已有的（只结束连接）。
  inviter_contact_created boolean not null,
  redeemer_contact_created boolean not null,
  inviter_shared_keys text[] not null default '{}'
    check (inviter_shared_keys <@ array['organization', 'offering', 'seeking', 'email', 'phone']::text[]),
  redeemer_shared_keys text[] not null default '{}'
    check (redeemer_shared_keys <@ array['organization', 'offering', 'seeking', 'email', 'phone']::text[]),
  -- 各自那条联系人上每个共享字段「上次同步的值」与对方资料的 updatedAt（同步与冲突判断用）。
  inviter_synced jsonb not null default '{}'::jsonb check (jsonb_typeof(inviter_synced) = 'object'),
  redeemer_synced jsonb not null default '{}'::jsonb check (jsonb_typeof(redeemer_synced) = 'object'),
  redeemer_idempotency_key text not null check (length(redeemer_idempotency_key) between 1 and 200),
  created_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unlinked_by text,
  unlink_idempotency_key text check (unlink_idempotency_key is null or length(unlink_idempotency_key) between 1 and 200),
  unlink_kept boolean,
  primary key (workspace_id, id),
  foreign key (workspace_id, code_id) references invite_codes (workspace_id, id),
  unique (workspace_id, redeemer_actor_id, redeemer_idempotency_key),
  check (inviter_actor_id <> redeemer_actor_id),
  check ((unlinked_at is null) = (unlinked_by is null)),
  check (unlinked_by is null or unlinked_by in (inviter_actor_id, redeemer_actor_id))
);

-- 同一对人只有一条生效连接：B 已经和 A 连着时，无论谁的码都是 already_connected；解除后再连 = 新的一行。
create unique index invite_connections_one_live_pair
  on invite_connections (
    workspace_id,
    least(inviter_actor_id, redeemer_actor_id),
    greatest(inviter_actor_id, redeemer_actor_id)
  )
  where unlinked_at is null;
create index invite_connections_code on invite_connections (workspace_id, code_id);
create index invite_connections_inviter_contact
  on invite_connections (workspace_id, inviter_actor_id, inviter_contact_id)
  where unlinked_at is null;
create index invite_connections_redeemer_contact
  on invite_connections (workspace_id, redeemer_actor_id, redeemer_contact_id)
  where unlinked_at is null;
create unique index invite_connections_unlink_key
  on invite_connections (workspace_id, unlinked_by, unlink_idempotency_key)
  where unlink_idempotency_key is not null;

-- 限流计数：bucket 是「规则 : HMAC(IP 或账号)」，window_start 是固定窗口的起点。
create table invite_code_attempts (
  bucket text not null check (length(bucket) between 1 and 200),
  window_start timestamptz not null,
  count integer not null check (count >= 0),
  primary key (bucket, window_start)
);
create index invite_code_attempts_window on invite_code_attempts (window_start);
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const INVITE_CODE_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

export const INVITE_CODE_SCHEMA_MIGRATIONS: readonly InviteCodeSchemaMigration[] = migrations;

export async function runInviteCodeMigrations(
  client: InviteCodeMigrationClient,
  override: readonly InviteCodeSchemaMigration[] = migrations,
): Promise<void> {
  await client.query(`
do $invite_codes_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists invite_codes_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$invite_codes_bootstrap$;
`);

  for (const migration of override) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $invite_codes_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from invite_codes_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'invite codes migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into invite_codes_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$invite_codes_migration$;
`);
  }
}
