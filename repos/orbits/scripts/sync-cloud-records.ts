/**
 * 把云端(Supabase)里"用出来的"记录同步到本地 Postgres。
 *
 * 背景:种子数据两边同源，用 db:seed:* 就能重建；但在界面上产生的数据
 * (agent 聊天会话历史、UI 导入/编辑的记录)只存在云端，需要单独捞回。
 *
 * 用法:
 *   # 云端项目恢复后，先把云端连接串放进环境变量
 *   ORBIT_CLOUD_DATABASE_URL='postgresql://...' npx tsx scripts/sync-cloud-records.ts
 *
 *   # 只同步指定集合(默认只同步聊天会话)
 *   ORBIT_CLOUD_DATABASE_URL='...' npx tsx scripts/sync-cloud-records.ts orbit_agent_chat_sessions conversations messages
 *
 *   # 先看看云端有什么，不写入
 *   ORBIT_CLOUD_DATABASE_URL='...' npx tsx scripts/sync-cloud-records.ts --list
 *
 * 目标库取 ORBIT_EVENT_DATABASE_URL(即当前 .env 指向的本地库)。
 * 写入用 upsert，重复跑安全；不会删除本地已有记录。
 */
import { Client } from "pg";

const DEFAULT_COLLECTIONS = ["orbit_agent_chat_sessions"];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function isCloud(connectionString: string): boolean {
  return !/localhost|127\.0\.0\.1/.test(connectionString);
}

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({
    connectionString,
    ssl: isCloud(connectionString) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 20000,
  });

  await client.connect();

  return client;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const collections = args.filter((arg) => !arg.startsWith("--"));
  const cloudUrl = requireEnv("ORBIT_CLOUD_DATABASE_URL");
  const localUrl = requireEnv("ORBIT_EVENT_DATABASE_URL");

  if (isCloud(localUrl)) {
    throw new Error(
      "ORBIT_EVENT_DATABASE_URL does not look local; refusing to write to a remote target.",
    );
  }

  const cloud = await connect(cloudUrl);

  try {
    if (listOnly) {
      const summary = await cloud.query<{ collection_name: string; count: string }>(
        "select collection_name, count(*)::text as count from orbit_records where deleted_at is null group by 1 order by 1",
      );

      console.log("Cloud collections:");
      for (const row of summary.rows) {
        console.log(`- ${row.collection_name}: ${row.count}`);
      }

      return;
    }

    const targets = collections.length > 0 ? collections : DEFAULT_COLLECTIONS;
    const local = await connect(localUrl);

    try {
      let total = 0;

      for (const collection of targets) {
        const rows = await cloud.query(
          `select workspace_id, collection_name, record_id, user_id, source_type, source_id,
                  source_label, provider, provider_record_id, evidence_ids, target_type, target_id,
                  occurred_at, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at
             from orbit_records
            where collection_name = $1`,
          [collection],
        );

        for (const row of rows.rows as Record<string, unknown>[]) {
          await local.query(
            `insert into orbit_records (
               workspace_id, collection_name, record_id, user_id, source_type, source_id,
               source_label, provider, provider_record_id, evidence_ids, target_type, target_id,
               occurred_at, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
             on conflict (workspace_id, collection_name, record_id) do update set
               user_id = excluded.user_id,
               source_type = excluded.source_type,
               source_id = excluded.source_id,
               source_label = excluded.source_label,
               provider = excluded.provider,
               provider_record_id = excluded.provider_record_id,
               evidence_ids = excluded.evidence_ids,
               target_type = excluded.target_type,
               target_id = excluded.target_id,
               occurred_at = excluded.occurred_at,
               lifecycle_state = excluded.lifecycle_state,
               search_text = excluded.search_text,
               payload = excluded.payload,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at`,
            [
              row.workspace_id,
              row.collection_name,
              row.record_id,
              row.user_id,
              row.source_type,
              row.source_id,
              row.source_label,
              row.provider,
              row.provider_record_id,
              row.evidence_ids,
              row.target_type,
              row.target_id,
              row.occurred_at,
              row.lifecycle_state,
              row.search_text,
              row.payload,
              row.created_at,
              row.updated_at,
              row.deleted_at,
            ],
          );
        }

        total += rows.rows.length;
        console.log(`- ${collection}: synced ${rows.rows.length} records`);
      }

      console.log(`Synced ${total} records from cloud into local.`);
    } finally {
      await local.end();
    }
  } finally {
    await cloud.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
