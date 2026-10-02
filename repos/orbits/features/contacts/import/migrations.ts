import { createHash } from "node:crypto";

// W0053：联系人导入（CSV／vCard／活动）的批次与解析行。
// 写法与 `features/plans/migrations.ts` 相同：advisory lock + 自带 schema_migrations 表 + checksum 守卫；
// 已发布的迁移不可修改，改表只追加新版本。生产库执行需要用户单独授权（scripts/migrate-web-runtime.ts）。
//
// - 不保存原始文件（W53-6）：只存解析后的行；CSV 另存原始单元格以便改字段对应后重算；
// - 行数据在批次完成／取消后 7 天（未完成的从创建起 7 天）由 `contact-import` 维护任务删除，批次摘要保留；
// - commit_intent_id：一次提交的幂等键（同键重放返回同一结果、不重复写）；
// - layers_*：每个写入事务（≤200 行）提交后对应一次 W0048a 三层更新入口调用（layers_pending 记还没成功调用的事务号）；
//   入口失败不回滚联系人，批次标 `retry` 由后续请求或维护任务重试（租约防并发）；
// - enrichment_deferred_until：后台池额度用尽、入口把补全顺延到次日时的 retryOn（导入记录显示「补全明天继续」）。

export interface ContactImportMigrationClient {
  query(text: string): Promise<unknown>;
}

interface ContactImportSchemaMigration {
  name: string;
  sql: string;
  version: number;
}

const MIGRATION_LOCK_KEY = "orbit:contact-import-schema";

const migrations: readonly ContactImportSchemaMigration[] = [
  {
    name: "contact-import-core",
    version: 1,
    sql: `
create table contact_import_batches (
  workspace_id text not null,
  id text not null,
  actor_id text not null check (length(actor_id) between 1 and 200),
  kind text not null check (kind in ('csv', 'vcard', 'event')),
  format text not null check (format in ('linkedin', 'generic', 'vcard', 'event')),
  status text not null check (status in ('parsed', 'reviewing', 'committing', 'completed', 'cancelled', 'expired')),
  file_name text not null default '' check (length(file_name) <= 300),
  source_event_id text,
  encoding text,
  row_count integer not null check (row_count between 0 and 2000),
  headers jsonb not null default '[]'::jsonb check (jsonb_typeof(headers) = 'array'),
  mapping jsonb check (mapping is null or jsonb_typeof(mapping) = 'object'),
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  version integer not null default 1 check (version > 0),
  counts jsonb not null default '{"created":0,"merged":0,"skipped":0,"failed":0}'::jsonb check (jsonb_typeof(counts) = 'object'),
  commit_intent_id text,
  commit_fingerprint text,
  next_chunk integer not null default 0 check (next_chunk >= 0),
  layers_status text not null default 'none' check (layers_status in ('none', 'pending', 'retry', 'done')),
  layers_pending integer[] not null default '{}',
  layers_attempts integer not null default 0 check (layers_attempts >= 0),
  layers_lease_until timestamptz,
  layers_last_error text,
  enrichment_deferred_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  rows_purged_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, actor_id, idempotency_key)
);

create index contact_import_batches_actor_recent
  on contact_import_batches (workspace_id, actor_id, created_at desc);
create index contact_import_batches_layers_due
  on contact_import_batches (workspace_id, layers_lease_until)
  where layers_status in ('pending', 'retry');
create index contact_import_batches_expiry
  on contact_import_batches (workspace_id, expires_at)
  where rows_purged_at is null;

create table contact_import_rows (
  workspace_id text not null,
  batch_id text not null,
  seq integer not null check (seq > 0),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  cells jsonb check (cells is null or jsonb_typeof(cells) = 'array'),
  parse_issues text[] not null default '{}',
  in_file_duplicate_of integer,
  candidate jsonb check (candidate is null or jsonb_typeof(candidate) = 'object'),
  decision text check (decision in ('create', 'merge', 'skip')),
  merge_into_contact_id text,
  status text not null default 'pending' check (status in ('pending', 'created', 'merged', 'skipped', 'failed')),
  contact_id text,
  layers_chunk integer,
  version integer not null default 1 check (version > 0),
  primary key (workspace_id, batch_id, seq),
  foreign key (workspace_id, batch_id) references contact_import_batches (workspace_id, id) on delete cascade,
  check ((decision = 'merge') = (merge_into_contact_id is not null))
);

create index contact_import_rows_chunk
  on contact_import_rows (workspace_id, batch_id, layers_chunk)
  where layers_chunk is not null;
`,
  },
];

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export const CONTACT_IMPORT_MIGRATIONS = migrations.map((migration) => ({
  checksum: checksum(migration.sql),
  name: migration.name,
  version: migration.version,
}));

export async function runContactImportMigrations(client: ContactImportMigrationClient): Promise<void> {
  await client.query(`
do $contact_import_bootstrap$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  create table if not exists contact_import_schema_migrations (
    version integer primary key check (version > 0),
    name text not null,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
end
$contact_import_bootstrap$;
`);

  for (const migration of migrations) {
    const migrationChecksum = checksum(migration.sql);
    await client.query(`
do $contact_import_migration$
declare
  stored_checksum text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(${sqlLiteral(MIGRATION_LOCK_KEY)}, 0)
  );
  select checksum into stored_checksum
  from contact_import_schema_migrations
  where version = ${migration.version};

  if stored_checksum is not null and stored_checksum <> ${sqlLiteral(migrationChecksum)} then
    raise exception 'contact import migration % checksum mismatch', ${migration.version};
  end if;

  if stored_checksum is null then
    ${migration.sql}
    insert into contact_import_schema_migrations (version, name, checksum)
    values (
      ${migration.version},
      ${sqlLiteral(migration.name)},
      ${sqlLiteral(migrationChecksum)}
    );
  end if;
end
$contact_import_migration$;
`);
  }
}
